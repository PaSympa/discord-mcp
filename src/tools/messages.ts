import {
  AnyThreadChannel,
  ChannelType,
  TextChannel,
  NewsChannel,
  PublicThreadChannel,
  PrivateThreadChannel,
  ThreadChannel,
  Message,
  MessageReaction,
  Routes,
  SnowflakeUtil,
  DiscordAPIError,
  RESTJSONErrorCodes,
  Constants,
  PermissionFlagsBits,
  type GuildTextBasedChannel,
} from "discord.js";
import { z } from "zod";
import { formatToolError } from "../errors.js";
import {
  discord,
  getTextChannel,
  fetchChannelChecked,
  validateId,
  assertCanEmbed,
  assertCanReadHistory,
  getThreadChannel,
} from "../client.js";
import {
  BATCH_BUDGET_MS,
  BatchStopped,
  batchStopSchema,
  failureShape,
  runBatch,
  runStep,
  type BatchResult,
  type BatchStop,
} from "../batch.js";
import {
  MAX_FETCH_LIMIT,
  MAX_PINS_LIMIT,
  MIN_ARCHIVED_THREAD_LIMIT,
  DEFAULTS,
  AUTO_ARCHIVE_DURATIONS,
} from "../constants.js";
import {
  buildEmbed,
  embedFieldsShape,
  embedArraySchema,
  embedContent,
  embedSummary,
  embedField,
} from "../embeds.js";
import {
  defineModule,
  defineTool,
  snowflake,
  snowflakeSet,
  guildId,
  channelId,
  messageId,
  intIn,
  messageText,
  textUpTo,
  structured,
  messageAuthor,
  messageAuthorShape,
} from "./define.js";

/**
 * History paging cursors. Discord's `GET /channels/{id}/messages` accepts at most
 * one of `before` / `after` / `around` per request, so tools exposing them reject
 * combinations at parse time instead of letting the API answer 400.
 */
const beforeCursor = snowflake.describe(
  "Return only messages older than this message ID (snowflake). Page backwards through history by passing the id of the oldest message from the previous call.",
);
const afterCursor = snowflake.describe(
  "Return only messages newer than this message ID (snowflake). Page forwards by passing the id of the newest message from the previous call.",
);
const aroundCursor = snowflake.describe(
  "Return messages centered on this message ID (snowflake): Discord splits `limit` either side of it, and an even `limit` puts the extra message on the newer side. Use it to read outward from a known message, such as a discord_search_guild_messages hit.",
);
const sinceInstant = z
  .union([z.iso.date(), z.iso.datetime({ offset: true })], {
    error:
      "Must be an ISO 8601 date (2026-08-01) or a date-time with an explicit offset (2026-08-01T09:00:00Z).",
  })
  .describe(
    'Return only messages posted after this instant, as an ISO 8601 date or a date-time with an explicit offset (e.g. "2026-08-01" or "2026-08-01T09:00:00Z"). Convenience form of `after`: the call yields the oldest `limit` messages after that instant, so page forwards with `after` set to the newest id received.',
  );

function hasSingleCursor(args: {
  before?: string;
  after?: string;
  around?: string;
  since?: string;
}): boolean {
  return (
    [args.before, args.after, args.around, args.since].filter((value) => value !== undefined)
      .length <= 1
  );
}

/**
 * Converts an ISO 8601 instant into the snowflake an `after` cursor expects.
 * Snowflakes embed a millisecond timestamp, so a synthetic id marks that instant
 * exactly. The instant is clamped to the Discord epoch on one side (`generate`
 * returns a negative id before it) and to now on the other (ids overflow 64 bits
 * past 2154, and nothing can be posted in the future). The schema only admits a
 * date or an offset-bearing date-time, both of which `Date.parse` reads as UTC or
 * the given offset, so the result does not depend on the server's timezone.
 */
function cursorForInstant(iso: string): string {
  const timestamp = Math.min(Math.max(Date.parse(iso), Number(SnowflakeUtil.epoch)), Date.now());
  return SnowflakeUtil.generate({ timestamp }).toString();
}

const messageSummary = z.object({
  id: z.string(),
  author: z.string(),
  ...messageAuthorShape,
  content: z.string(),
  timestamp: z.string(),
  embeds: z.array(embedSummary).optional(),
});

const attachmentSummary = z.object({
  id: z.string(),
  filename: z.string(),
  contentType: z.string().nullable(),
  size: z.number(),
  url: z.string(),
  proxyUrl: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  description: z.string().nullable(),
  title: z.string().nullable(),
  duration: z.number().nullable(),
  waveform: z.string().nullable(),
  spoiler: z.boolean(),
});

/**
 * Looks up a reaction on a message by emoji argument.
 * The reaction cache is keyed by the emoji id (snowflake) for custom emoji and
 * by the raw unicode char for standard emoji, NOT by the "name:id" / "<:name:id>"
 * form the tool schema accepts, so a custom emoji is normalized to its id first.
 * Callers fetch with `force: true`: a message this process sent stays cached, and no
 * intent refreshes its reactions.
 */
function findReaction(msg: Message, emoji: string): MessageReaction | undefined {
  const customId = emoji.match(/^<a?:[^:]+:(\d{17,20})>$|^[^:]+:(\d{17,20})$/);
  const key = customId ? (customId[1] ?? customId[2]) : emoji;
  return msg.reactions.cache.get(key);
}

/** Mirrors discord.js `User#tag`, which raw API users lack. Both "0" and "0000" mean migrated. */
function userTag(user: { username: string; discriminator: string }): string {
  return user.discriminator === "0" || user.discriminator === "0000"
    ? user.username
    : `${user.username}#${user.discriminator}`;
}

const channelThreadSummary = z.object({
  id: z.string(),
  name: z.string(),
  private: z.boolean(),
  archived: z.boolean().nullable(),
  locked: z.boolean().nullable(),
  messageCount: z.number().nullable(),
  createdAt: z.string().nullable(),
});

/**
 * Fetches a channel by ID and guarantees it is a text or announcement channel, the
 * two that hold threads of their own. A forum is pointed at discord_list_forum_threads
 * instead of being refused generically.
 */
async function getThreadParent(channelId: string): Promise<TextChannel | NewsChannel> {
  const channel = await fetchChannelChecked(validateId(channelId, "channel_id"));
  if (channel?.type === ChannelType.GuildForum)
    throw new Error(
      `Channel ${channelId} is a forum. Use discord_list_forum_threads to list its posts.`,
    );
  if (channel?.type !== ChannelType.GuildText && channel?.type !== ChannelType.GuildAnnouncement)
    throw new Error(
      `Channel ${channelId} holds no threads of its own or doesn't exist. Pass a text or announcement channel.`,
    );
  return channel;
}

/** Inputs shared by the thread member tools. */
const threadMemberShape = z.object({
  thread_id: snowflake.describe(
    "ID (snowflake) of the thread: public, private, announcement, or a forum post.",
  ),
  user_id: snowflake.describe("Discord user ID (snowflake) of the member."),
});

/** How many people discord_create_thread adds in one call. */
const MAX_THREAD_MEMBERS = 50;

/**
 * Runs a member change on a thread. Discord accepts most changes on an archived thread, so
 * the change is tried as is; only when Discord refuses because the thread is archived is
 * it unarchived and the change retried. If the retry fails too, the thread is archived
 * again when Discord allows it. Returns whether the thread was unarchived.
 */
async function changeThreadMembers(
  thread: ThreadChannel,
  change: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await change();
    return false;
  } catch (err) {
    const archived =
      err instanceof DiscordAPIError &&
      err.code === RESTJSONErrorCodes.InvalidActionOnArchivedThread;
    if (!archived) throw err;
  }
  try {
    await thread.setArchived(false);
  } catch (err) {
    throw new Error(`The thread is archived and could not be unarchived: ${formatToolError(err)}`, {
      cause: err,
    });
  }
  try {
    await change();
    return true;
  } catch (err) {
    const rearchived = await thread.setArchived(true).then(
      () => true,
      () => false,
    );
    const outcome = rearchived
      ? "The thread was unarchived for the retry and is archived again."
      : "The thread was unarchived for the retry and could not be archived again, so it is still open.";
    throw new Error(`${formatToolError(err)} ${outcome}`, { cause: err });
  }
}

/**
 * Why a member_ids batch stopped. The batch's own messages say to call again, which here
 * would create a second thread, so only an error's message is passed on.
 */
function memberStopReason(stop: BatchStop): string {
  if (stop.reason === "cancelled") return "The client cancelled the call.";
  if (stop.reason === "time_budget")
    return stop.retry_after_seconds === undefined
      ? `The call used its ${BATCH_BUDGET_MS / 1000} s time budget.`
      : `Discord asked to wait ${stop.retry_after_seconds} s, past the call's time budget, so wait that long first.`;
  return `Stopped on this error: ${stop.message.replace(/(?<![.!?])$/, ".")}`;
}

/**
 * The refusals that stop member_ids adds: about the bot or the thread. Missing Access
 * (50001) is left out: it can concern one user, such as one who cannot view the parent.
 */
const THREAD_MEMBER_STOP_CODES = new Set<number>([
  RESTJSONErrorCodes.MissingPermissions,
  RESTJSONErrorCodes.UnknownChannel,
  RESTJSONErrorCodes.InvalidActionOnArchivedThread,
  RESTJSONErrorCodes.ThreadLocked,
]);

/**
 * Adds each user to a new thread within the call's time budget. Never throws, so the
 * caller always gets the thread's ID: refused and unreached users are reported instead.
 */
async function addThreadMembers(
  thread: AnyThreadChannel,
  userIds: string[],
  options: { deadline: number; signal?: AbortSignal },
): Promise<string> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return "";
  const { done, failed, remaining, stopped } = await runBatch(
    unique,
    (id, signal) => discord.rest.put(Routes.threadMembers(thread.id, id), { signal }),
    { ...options, systemicCodes: THREAD_MEMBER_STOP_CODES },
  );
  const total = unique.length;
  if (done.length === total) return ` Added ${total} member${total === 1 ? "" : "s"}.`;
  let report = ` Added ${done.length} of ${total} members.`;
  if (failed.length)
    report += ` Discord refused ${failed.map((f) => `${f.item} (code ${f.code}: ${f.message})`).join(", ")}.`;
  if (stopped)
    report += ` Not reached: ${remaining.join(", ")}. ${memberStopReason(stopped)} Add them with discord_add_thread_member.`;
  return report;
}

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
/** Discord checks ages when it runs a bulk delete, and one ID past 14 days fails the whole request. */
const BULK_AGE_MARGIN_MS = 5 * 60 * 1000;
const LOOKUP_PAGES = 10;

const LOOKUP_LIMIT: BatchStop = {
  reason: "lookup_limit",
  message: `The lookup reads at most ${LOOKUP_PAGES} pages of ${MAX_FETCH_LIMIT} messages per call. Call again with remaining.`,
};

const messageToDelete = z.object({
  id: z.string(),
  ...messageAuthorShape,
  created_at: z.string(),
  older_than_14_days: z.boolean(),
});

function toDelete(m: Message) {
  return {
    id: m.id,
    ...messageAuthor(m.author.id, m.webhookId),
    created_at: m.createdAt.toISOString(),
    older_than_14_days: m.createdTimestamp <= Date.now() - FOURTEEN_DAYS_MS,
  };
}

const notDeletable = z.object({
  id: z.string(),
  reason: z.enum(["system_message", "no_permission"]),
});

/**
 * Splits messages on discord.js's `deletable`: the message type, then Manage Messages in
 * the channel or the bot's own authorship. A message Discord would refuse never reaches
 * a request, where one refused ID fails a whole bulk delete.
 */
function splitDeletable(messages: Message[]) {
  const deletable: Message[] = [];
  const refused: z.infer<typeof notDeletable>[] = [];
  for (const m of messages) {
    if (m.deletable) deletable.push(m);
    else
      refused.push({
        id: m.id,
        reason: Constants.UndeletableMessageTypes.some((type) => type === m.type)
          ? "system_message"
          : "no_permission",
      });
  }
  return { deletable, refused };
}

/**
 * Finds which IDs exist in the channel. Each page is read forward from just below the
 * smallest pending ID and settles every pending ID in its span: a full page covers up
 * to its newest message, a short one reaches the end of the channel. IDs still pending
 * when the pages, the time or the call run out are `unreached`.
 */
async function locateMessages(
  channel: GuildTextBasedChannel,
  ids: string[],
  { deadline, signal }: { deadline: number; signal?: AbortSignal },
) {
  const pending = ids.map((id) => BigInt(id)).sort((a, b) => (a < b ? -1 : 1));
  const found: Message[] = [];
  const notFound: string[] = [];
  let stopped: BatchStop | undefined;
  for (let page = 0; pending.length > 0; page++) {
    if (page === LOOKUP_PAGES) {
      stopped = LOOKUP_LIMIT;
      break;
    }
    const after = (pending[0] - 1n).toString();
    let messages;
    try {
      // fetch takes no signal: at the hard stop the step stops waiting and abandons the read.
      messages = await runStep(
        () => channel.messages.fetch({ after, limit: MAX_FETCH_LIMIT, cache: false }),
        { deadline, signal },
      );
    } catch (err) {
      if (!(err instanceof BatchStopped)) throw err;
      stopped = err.stop;
      break;
    }
    const newest =
      messages.size < MAX_FETCH_LIMIT
        ? undefined
        : [...messages.keys()].reduce((max, id) => (BigInt(id) > max ? BigInt(id) : max), 0n);
    while (pending.length > 0 && (newest === undefined || pending[0] <= newest)) {
      const id = pending.shift()!.toString();
      const message = messages.get(id);
      if (message) found.push(message);
      else notFound.push(id);
    }
  }
  return { found, notFound, unreached: pending.map(String), stopped };
}

/**
 * The bulk endpoint needs Manage Messages even for the bot's own messages, which
 * `deletable` lets it delete one by one without it. A timed-out bot loses it too.
 * Unresolvable permissions let the bulk request through.
 */
function canBulkDelete(channel: GuildTextBasedChannel): boolean {
  const me = channel.guild.members.me;
  if (!me) return true;
  return (
    channel.permissionsFor(me).has(PermissionFlagsBits.ManageMessages) &&
    !me.isCommunicationDisabled()
  );
}

/** Tool definitions for channel and thread messages. */
const tools = [
  defineTool({
    name: "discord_read_messages",
    description:
      "Read messages from a text channel or thread, oldest-to-newest. Page backwards by re-calling with before set to the id of the oldest message you received, which walks a channel past the 100-message per-call cap. Requires the View Channel and Read Message History permissions; without Read Message History an empty result fails with an error naming the permission. Returns { messages: [...] } with id, author, content, timestamp, attachment count, pinned flag, and the text of any embeds. Use discord_search_messages or discord_search_guild_messages to filter by keyword, or discord_fetch_pinned_messages for pinned messages only. Use discord_read_dms for the bot's DMs, discord_get_message_attachments for a message's files, or discord_get_forum_post for a forum post's tags and state.",
    annotations: { title: "Read messages", readOnlyHint: true, openWorldHint: true },
    schema: z
      .object({
        channel_id: snowflake.describe("ID (snowflake) of the channel or thread to read from."),
        limit: intIn(1, MAX_FETCH_LIMIT)
          .default(DEFAULTS.MESSAGES)
          .describe("How many messages to fetch per call (1–100). Default 20."),
        before: beforeCursor.optional(),
        after: afterCursor.optional(),
        around: aroundCursor.optional(),
        since: sinceInstant.optional(),
      })
      .refine(
        hasSingleCursor,
        "Pass at most one of before, after, around, or since: Discord treats before/after/around as mutually exclusive, and since is a form of after.",
      ),
    outputSchema: z.object({
      guild_id: z.string().nullable(),
      messages: z.array(messageSummary.extend({ attachments: z.number(), pinned: z.boolean() })),
    }),
    handle: async ({ channel_id, limit, before, after, around, since }) => {
      const channel = await getTextChannel(channel_id);
      const resolvedAfter = after ?? (since === undefined ? undefined : cursorForInstant(since));
      const messages = await channel.messages.fetch({
        limit,
        cache: false,
        before,
        after: resolvedAfter,
        around,
      });
      if (messages.size === 0) assertCanReadHistory(channel);
      const result = [...messages.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          id: m.id,
          author: m.author.tag,
          ...messageAuthor(m.author.id, m.webhookId),
          content: m.content,
          timestamp: m.createdAt.toISOString(),
          ...embedField(m.embeds),
          attachments: m.attachments.size,
          pinned: m.pinned,
        }));
      return structured({ guild_id: channel.guildId, messages: result });
    },
  }),
  defineTool({
    name: "discord_send_message",
    description:
      "Send a plain-text message to a channel or thread. For rich content (title, color, fields, images) use discord_send_embed; to attach a reply reference to an existing message use discord_reply_message. Requires the bot to have the Send Messages permission. Returns the new message ID. Use discord_send_multiple_embeds for text with embeds, discord_forward_message to share an existing message, discord_send_webhook_message to post as a webhook, discord_create_poll for a poll, or discord_send_dm for a DM; in a thread, discord_reply_to_forum does the same.",
    annotations: {
      title: "Send message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the target channel or thread."),
      content: messageText.describe("Plain-text body of the message (max 2000 characters)."),
    }),
    handle: async ({ channel_id, content }) => {
      const channel = await getTextChannel(channel_id);
      const sent = await channel.send(content);
      return {
        content: [{ type: "text", text: `✅ Message sent (id: ${sent.id}) in #${channel.name}.` }],
      };
    },
  }),
  defineTool({
    name: "discord_reply_message",
    description:
      "Reply to a specific message, attaching a reply reference so clients show it as a threaded reply. Use discord_send_message for a standalone message with no reference. Requires the Send Messages and Read Message History permissions. Discord refuses some system messages as reply targets. Returns the new reply's message ID. In a DM, use discord_reply_dm; discord_reply_to_forum posts in a thread without a reply reference.",
    annotations: {
      title: "Reply to message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe("ID of the message to reply to."),
      content: messageText.describe("Plain-text body of the reply (max 2000 characters)."),
    }),
    handle: async ({ channel_id, message_id, content }) => {
      const channel = await getTextChannel(channel_id);
      const target = await channel.messages.fetch({ message: message_id, cache: false });
      const sent = await target.reply(content);
      return {
        content: [
          {
            type: "text",
            text: `✅ Reply sent (id: ${sent.id}) to message ${message_id} in #${channel.name}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_edit_message",
    description:
      "Edit the text content of a message previously sent by this bot. Discord forbids editing other users' messages, so this fails for non-bot messages. It changes the text and keeps any embeds; discord_edit_embed replaces the embeds and keeps the text. Works in text channels and threads. Requires the View Channel and Read Message History permissions. Returns the edited message ID. Use discord_edit_dm for a DM, or discord_edit_webhook_message for a message sent through a webhook.",
    annotations: {
      title: "Edit message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe(
        "ID of the message to edit. Must be a message authored by this bot.",
      ),
      content: messageText.describe(
        "New plain-text content that fully replaces the existing content (max 2000 characters).",
      ),
    }),
    handle: async ({ channel_id, message_id, content }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      if (msg.author.id !== discord.user?.id)
        throw new Error("Can only edit messages sent by the bot.");
      const edited = await msg.edit(content);
      return {
        content: [{ type: "text", text: `✅ Message ${edited.id} edited in #${channel.name}.` }],
      };
    },
  }),
  defineTool({
    name: "discord_add_reaction",
    description:
      "Add a single emoji reaction to a message as the bot. Requires the Read Message History permission to look the message up, plus Add Reactions when no one has reacted with that emoji yet. Use discord_remove_reactions to undo. Idempotent: re-adding the bot's existing reaction has no effect.",
    annotations: {
      title: "Add reaction",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe("ID of the message to react to."),
      emoji: z
        .string()
        .describe("Unicode emoji (e.g. '👍') or a custom emoji in 'name:id' format."),
    }),
    handle: async ({ channel_id, message_id, emoji }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      await msg.react(emoji);
      return {
        content: [
          {
            type: "text",
            text: `✅ Reacted with ${emoji} to message ${msg.id} in #${channel.name}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_list_channel_threads",
    description:
      "List the threads in a text or announcement channel. Returns { threads: [...], hasMore, nextBefore }. The first call includes active threads plus the first page of archived ones; while hasMore is true pass nextBefore back as `before`. hasMore means that page came back full, so the last call can return nothing. messageCount excludes the starter message and deleted messages, and is inaccurate above 50 for threads created before July 1, 2022. Requires the View Channel and Read Message History permissions. Read-only. Use discord_list_forum_threads for a forum's posts.",
    annotations: { title: "List channel threads", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: snowflake.describe(
        "ID (snowflake) of the text or announcement channel to list threads from.",
      ),
      limit: intIn(MIN_ARCHIVED_THREAD_LIMIT, MAX_FETCH_LIMIT)
        .default(MAX_FETCH_LIMIT)
        .describe("Max archived threads per page (2–100). Default 100."),
      type: z
        .enum(["public", "private"])
        .default("public")
        .describe(
          "Which archived threads to page through. Private requires the Manage Threads permission. Active threads are returned either way. Default public.",
        ),
      before: z.iso
        .datetime({ offset: true })
        .optional()
        .describe(
          "Pagination cursor: an ISO timestamp compared against when a thread was archived. Pass the previous response's nextBefore to fetch older archived threads. When set, active threads are omitted.",
        ),
    }),
    outputSchema: z.object({
      threads: z.array(channelThreadSummary),
      hasMore: z.boolean(),
      nextBefore: z.string().nullable(),
    }),
    handle: async ({ channel_id, limit, type, before }) => {
      const channel = await getThreadParent(channel_id);
      const collected: AnyThreadChannel[] = [];
      if (before === undefined) {
        const active = await channel.threads.fetchActive();
        collected.push(...active.threads.values());
      }
      const archived = await channel.threads.fetchArchived({
        type,
        // Without fetchAll, private goes to the joined-threads route, which ignores a date cursor.
        fetchAll: type === "private",
        limit,
        before,
      });
      collected.push(...archived.threads.values());
      const threads = collected.map((t) => ({
        id: t.id,
        name: t.name,
        private: t.type === ChannelType.PrivateThread,
        archived: t.archived,
        locked: t.locked,
        messageCount: t.messageCount,
        createdAt: t.createdAt?.toISOString() ?? null,
      }));
      // hasMore follows the cursor so the two cannot disagree.
      const oldest = archived.threads.last();
      const nextBefore =
        archived.hasMore && oldest?.archivedAt ? oldest.archivedAt.toISOString() : null;
      return structured({ threads, hasMore: nextBefore !== null, nextBefore });
    },
  }),
  defineTool({
    name: "discord_create_thread",
    description:
      "Create a thread, either branching from an existing message (pass message_id) or as a standalone thread in a text channel (omit message_id). Standalone creation requires a parent text channel and fails if channel_id is itself a thread. Requires the Create Public Threads permission (or Create Private Threads for a private thread), plus Read Message History when message_id is set. Returns the new thread's ID. Set private for a standalone thread that only its members and moderators see. member_ids adds people in the same call and needs Send Messages in Threads; discord_add_thread_member adds them later. In a forum channel, use discord_create_forum_post instead.",
    annotations: {
      title: "Create thread",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z
      .object({
        channel_id: snowflake.describe(
          "ID (snowflake) of the parent text or announcement channel. For a message-based thread, the channel containing message_id.",
        ),
        name: textUpTo(100).describe("Name of the thread to create (max 100 characters)."),
        message_id: snowflake
          .optional()
          .describe(
            "Optional. Message to branch the thread from. If omitted, a standalone thread is created in the channel.",
          ),
        auto_archive_duration: z
          .literal([...AUTO_ARCHIVE_DURATIONS])
          .default(1440)
          .describe(
            "Minutes of inactivity before auto-archiving: 60, 1440, 4320, or 10080. Default 1440 (24h).",
          ),
        private: z
          .boolean()
          .default(false)
          .describe(
            "Optional. True creates a standalone private thread, visible only to its members and to moderators; the bot joins it as its creator. Not available in an announcement channel, whose threads are public. Default false (public).",
          ),
        invitable: z
          .boolean()
          .optional()
          .describe(
            "Optional, private threads only. Whether members without Manage Threads can add other people to the thread. Discord's default is true.",
          ),
        member_ids: z
          .array(snowflake)
          .max(MAX_THREAD_MEMBERS)
          .optional()
          .describe(
            "Optional. Up to 50 Discord user IDs (snowflakes) to add to the new thread; duplicates are added once. Needs Send Messages in Threads. A refused add, or one the call had no time left for, is reported in the result and leaves the thread in place.",
          ),
      })
      .refine(
        (args) => !(args.private && args.message_id),
        "private cannot be combined with message_id: Discord branches only public threads from a message. Omit message_id to create a standalone private thread.",
      )
      .refine(
        (args) => args.invitable === undefined || args.private,
        "invitable applies to private threads only: set private to true or omit invitable.",
      ),
    handle: async (
      {
        channel_id,
        name,
        message_id,
        auto_archive_duration,
        private: isPrivate,
        invitable,
        member_ids = [],
      },
      { signal },
    ) => {
      const batch = { deadline: Date.now() + BATCH_BUDGET_MS, signal };
      const channel = await getTextChannel(channel_id);
      const duration = auto_archive_duration;
      if (message_id) {
        const msg = await channel.messages.fetch({ message: message_id, cache: false });
        const thread = await msg.startThread({ name, autoArchiveDuration: duration });
        const added = await addThreadMembers(thread, member_ids, batch);
        return {
          content: [
            {
              type: "text",
              text: `✅ Thread "${thread.name}" created from message (id: ${thread.id}).${added}`,
            },
          ],
        };
      }
      if (!(channel instanceof TextChannel || channel instanceof NewsChannel)) {
        const kind = channel.isThread()
          ? "a thread"
          : channel.type === ChannelType.GuildStageVoice
            ? "a stage channel"
            : "a voice channel";
        throw new Error(
          `Channel ${channel_id} is ${kind}. A standalone thread needs a text or announcement channel as its parent.`,
        );
      }
      if (isPrivate) {
        // discord.js sends an announcement thread whatever the type, so private would be dropped silently.
        if (channel instanceof NewsChannel)
          throw new Error(
            `Channel ${channel_id} is an announcement channel, where Discord creates public threads only. Omit private, or pass a text channel.`,
          );
        const thread = await channel.threads.create({
          name,
          autoArchiveDuration: duration,
          type: ChannelType.PrivateThread,
          ...(invitable === undefined ? {} : { invitable }),
        });
        const added = await addThreadMembers(thread, member_ids, batch);
        const hint = member_ids.length ? "" : " Add people with discord_add_thread_member.";
        return {
          content: [
            {
              type: "text",
              text: `✅ Private thread "${thread.name}" created (id: ${thread.id}).${added}${hint}`,
            },
          ],
        };
      }
      const thread = await channel.threads.create({ name, autoArchiveDuration: duration });
      const added = await addThreadMembers(thread, member_ids, batch);
      return {
        content: [
          { type: "text", text: `✅ Thread "${thread.name}" created (id: ${thread.id}).${added}` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_add_thread_member",
    description:
      "Add a member to a thread. This is how people join a private thread, which they cannot open otherwise; in a public thread it makes them follow it. Works on any thread, forum posts included. Adding someone already in the thread changes nothing. The member must be able to view the parent channel. If Discord refuses because the thread is archived, it is unarchived and the call retried, and it stays open afterwards. Unarchiving a locked thread needs Manage Threads. Requires the Send Messages in Threads permission. Returns a confirmation. Use discord_remove_thread_member to take someone out, or discord_create_thread with private set to create a private thread.",
    annotations: {
      title: "Add thread member",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: threadMemberShape,
    handle: async ({ thread_id, user_id }) => {
      const thread = await getThreadChannel(thread_id);
      const unarchived = await changeThreadMembers(thread, () => thread.members.add(user_id));
      const note = unarchived ? " The thread was archived and is now open again." : "";
      return {
        content: [
          {
            type: "text",
            text: `✅ User ${user_id} added to thread "${thread.name}" (${thread.id}).${note}`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_remove_thread_member",
    description:
      "Remove a member from a thread. In a private thread they lose access until someone adds them again; in a public thread they only stop following it and can still open it. Removing someone who is not in the thread changes nothing. If Discord refuses because the thread is archived, it is unarchived and the call retried, and it stays open afterwards. Unarchiving a locked thread needs Manage Threads. Requires the Manage Threads permission, unless the bot created the private thread. Returns a confirmation. Use discord_add_thread_member to add someone back.",
    annotations: {
      title: "Remove thread member",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: threadMemberShape,
    handle: async ({ thread_id, user_id }) => {
      const thread = await getThreadChannel(thread_id);
      const unarchived = await changeThreadMembers(thread, () => thread.members.remove(user_id));
      const note = unarchived ? " The thread was archived and is now open again." : "";
      return {
        content: [
          {
            type: "text",
            text: `✅ User ${user_id} is not in thread "${thread.name}" (${thread.id}).${note}`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_bulk_delete_messages",
    description:
      "Permanently delete up to 100 messages in a channel or thread, chosen by ID. IRREVERSIBLE. SAFE BY DEFAULT: dry_run is true unless explicitly set to false. Preview first: count lists the most recent messages, message_ids checks which of those IDs are in this channel. Both return would_delete, the messages a real call would delete, with each one's id, author_id, created_at and older_than_14_days, and not_deletable, the ones the bot may not delete: a system message, or another member's without Manage Messages. Then re-call with dry_run:false and the reviewed IDs as message_ids; a real call refuses count. It looks the IDs up again and deletes only the deletable ones it finds: those younger than 14 days in one request, or one by one if Discord refuses it, older ones one by one, more slowly. Discord allows about 40 of those, then asks for a pause of about 2 minutes. A call reads at most 10 pages of history and stops after about 40 seconds or at such a pause; what it did not reach comes back in remaining, with the reason in stopped and any wait in stopped.retry_after_seconds, so call again with those IDs after that wait. Requires the Manage Messages and Read Message History permissions. Returns { dry_run, would_delete, not_deletable } for a preview, with not_found and remaining when it took message_ids, and { dry_run, deleted, not_deletable, not_found, failed, remaining } after a real call. Use discord_delete_message for a single message.",
    annotations: {
      title: "Bulk delete messages",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z
      .object({
        channel_id: snowflake.describe(
          "ID (snowflake) of the channel or thread to delete messages from.",
        ),
        count: intIn(2, MAX_FETCH_LIMIT)
          .optional()
          .describe(
            "Preview only: list the N most recent messages (2-100) as would_delete. A real call refuses it.",
          ),
        message_ids: snowflakeSet(MAX_FETCH_LIMIT)
          .optional()
          .describe(
            "IDs (snowflakes) of the messages to delete, 1-100 distinct. A dry run reports which are in this channel; a real call deletes only those.",
          ),
        dry_run: z
          .boolean()
          .default(true)
          .describe(
            "If true (default), deletes nothing and returns would_delete. Set false, with message_ids, to delete.",
          ),
      })
      .refine(
        (a) => (a.count === undefined) !== (a.message_ids === undefined),
        "Pass exactly one of count or message_ids.",
      ),
    outputSchema: z.object({
      dry_run: z.boolean().describe("true for a preview: nothing was deleted."),
      would_delete: z
        .array(messageToDelete)
        .optional()
        .describe("Dry run only: the messages a real call with these IDs would delete."),
      deleted: z
        .array(z.string())
        .optional()
        .describe(
          "IDs found in the channel just before the request and accepted by Discord. Discord does not confirm each ID of a bulk request.",
        ),
      not_deletable: z
        .array(notDeletable)
        .optional()
        .describe(
          "Messages in this channel the bot may not delete, never sent to Discord: system_message for a type Discord lets no one delete, no_permission for another member's message where the bot lacks Manage Messages or is timed out.",
        ),
      not_found: z
        .array(z.string())
        .optional()
        .describe("IDs not in this channel: another channel's, or already deleted."),
      failed: z
        .array(z.object({ id: z.string(), ...failureShape }))
        .optional()
        .describe("IDs Discord refused to delete, with its error code."),
      remaining: z
        .array(z.string())
        .optional()
        .describe("IDs this call did not reach. Call again with them as message_ids."),
      stopped: batchStopSchema("lookup_limit").optional(),
    }),
    handle: async ({ channel_id, count, message_ids, dry_run }, { signal }) => {
      const deadline = Date.now() + BATCH_BUDGET_MS;
      const channel = await getTextChannel(channel_id);
      assertCanReadHistory(channel);
      if (message_ids === undefined) {
        if (!dry_run)
          throw new Error(
            "A real bulk delete takes message_ids, not count, so it deletes only messages you have seen. Preview with count, then call again with dry_run:false and message_ids set to the would_delete IDs.",
          );
        const recent = await channel.messages.fetch({ limit: count, cache: false });
        const { deletable, refused } = splitDeletable(
          [...recent.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp),
        );
        return structured({
          dry_run,
          would_delete: deletable.map(toDelete),
          not_deletable: refused,
        });
      }
      const lookup = await locateMessages(channel, message_ids, { deadline, signal });
      const { deletable, refused } = splitDeletable(lookup.found);
      if (dry_run)
        return structured({
          dry_run,
          would_delete: deletable.map(toDelete),
          not_deletable: refused,
          not_found: lookup.notFound,
          remaining: lookup.unreached,
          ...(lookup.stopped ? { stopped: lookup.stopped } : {}),
        });
      const cutoff = Date.now() - FOURTEEN_DAYS_MS + BULK_AGE_MARGIN_MS;
      const recent = deletable.filter((m) => m.createdTimestamp > cutoff).map((m) => m.id);
      const older = deletable.filter((m) => m.createdTimestamp <= cutoff).map((m) => m.id);
      const options = { deadline, signal };
      const bulk =
        recent.length > 1 && canBulkDelete(channel)
          ? await runBatch(
              [recent],
              (ids, itemSignal) =>
                discord.rest.post(Routes.channelBulkDelete(channel.id), {
                  body: { messages: ids },
                  signal: itemSignal,
                }),
              options,
            )
          : undefined;
      const inBulk = bulk?.done.length ? recent : [];
      // A bulk request refused for one of its IDs fails them all, so they go one by one.
      const singles: BatchResult<string> = bulk?.stopped
        ? { done: [], failed: [], remaining: [...recent, ...older], stopped: bulk.stopped }
        : await runBatch(
            inBulk.length ? older : [...recent, ...older],
            (id, itemSignal) =>
              discord.rest.delete(Routes.channelMessage(channel.id, id), { signal: itemSignal }),
            options,
          );
      const stopped = singles.stopped ?? lookup.stopped;
      return structured({
        dry_run,
        deleted: [...inBulk, ...singles.done],
        not_deletable: refused,
        not_found: lookup.notFound,
        failed: singles.failed.map(({ item, code, message }) => ({ id: item, code, message })),
        remaining: [...singles.remaining, ...lookup.unreached],
        ...(stopped ? { stopped } : {}),
      });
    },
  }),
  defineTool({
    name: "discord_send_embed",
    description:
      "Send a single rich embed (title, description, color, fields, author, footer, images, timestamp). Use discord_send_message for plain text, or discord_send_multiple_embeds to send several embeds at once. Requires the Send Messages and Embed Links permissions. Returns the new message ID. For a DM, use discord_send_dm_embed.",
    annotations: {
      title: "Send embed",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the target channel or thread."),
      content: embedContent,
      ...embedFieldsShape,
    }),
    handle: async ({ channel_id, content, ...embedArgs }) => {
      const channel = await getTextChannel(channel_id);
      assertCanEmbed(channel);
      const sent = await channel.send({
        content: content || undefined,
        embeds: [buildEmbed(embedArgs)],
      });
      return {
        content: [{ type: "text", text: `✅ Embed sent (id: ${sent.id}) in #${channel.name}.` }],
      };
    },
  }),
  defineTool({
    name: "discord_edit_embed",
    description:
      "Replace the embed on a message previously sent by this bot. Only this bot's messages can be edited. This is a full replace, not a merge: provided fields are applied and omitted fields are dropped from the embed. Requires the View Channel, Read Message History and Embed Links permissions. Returns a confirmation. It keeps the message's text; use discord_edit_message to change the text, discord_edit_dm_embed for a DM, or discord_edit_webhook_message for a webhook's message.",
    annotations: {
      title: "Edit embed",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe(
        "ID of the message to edit. Must be a message authored by this bot (an embed is added if it has none).",
      ),
      ...embedFieldsShape,
    }),
    handle: async ({ channel_id, message_id, ...embedArgs }) => {
      const channel = await getTextChannel(channel_id);
      assertCanEmbed(channel);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      if (msg.author.id !== discord.user?.id)
        throw new Error("Can only edit embeds sent by the bot.");
      await msg.edit({ embeds: [buildEmbed(embedArgs)] });
      return {
        content: [
          { type: "text", text: `✅ Embed edited on message ${message_id} in #${channel.name}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_send_multiple_embeds",
    description:
      "Send up to 10 embeds in a single message, with optional text above them. Use discord_send_embed for a single embed. Requires the Send Messages and Embed Links permissions. Returns the new message ID. For text with no embed, use discord_send_message.",
    annotations: {
      title: "Send multiple embeds",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the target channel or thread."),
      content: messageText
        .optional()
        .describe("Optional plain text shown above the embeds (max 2000 characters)."),
      embeds: embedArraySchema.describe("Array of embed objects to send (max 10)."),
    }),
    handle: async ({ channel_id, content, embeds }) => {
      const channel = await getTextChannel(channel_id);
      assertCanEmbed(channel);
      const built = embeds.map((e) => buildEmbed(e));
      const sent = await channel.send({ content: content || undefined, embeds: built });
      return {
        content: [
          {
            type: "text",
            text: `✅ ${built.length} embeds sent (id: ${sent.id}) in #${channel.name}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_delete_message",
    description:
      "Permanently delete one specific message. IRREVERSIBLE. Requires the View Channel and Read Message History permissions to find the message. The bot can then delete its own messages; deleting another user's message also requires the Manage Messages permission. Use discord_bulk_delete_messages to remove many at once. Discord does not record a reason for a single message delete in the audit log. Use discord_delete_dm for a DM, or discord_delete_webhook_message to delete a webhook's message with its token.",
    annotations: {
      title: "Delete message",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe("ID of the message to delete."),
      reason: z
        .string()
        .optional()
        .describe(
          "Optional. Not recorded: Discord keeps no audit log reason for a single message delete.",
        ),
    }),
    handle: async ({ channel_id, message_id, reason }) => {
      const channel = await getTextChannel(channel_id);
      await channel.messages.fetch({ message: message_id, cache: false });
      await discord.rest.delete(Routes.channelMessage(channel.id, message_id), { reason });
      return { content: [{ type: "text", text: `✅ Message ${message_id} deleted.` }] };
    },
  }),
  defineTool({
    name: "discord_pin_message",
    description:
      "Pin or unpin a message in a channel, controlled by the pin flag. Requires the Pin Messages and Read Message History permissions (Pin Messages is a dedicated permission since early 2026, separate from Manage Messages). A channel holds at most 250 pins. Idempotent: pinning an already-pinned message (or unpinning an unpinned one) has no additional effect. List the pins with discord_fetch_pinned_messages.",
    annotations: {
      title: "Pin or unpin message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe("ID of the message to pin or unpin."),
      pin: z.boolean().describe("true to pin the message, false to unpin it."),
    }),
    handle: async ({ channel_id, message_id, pin }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      if (pin) {
        await msg.pin();
      } else {
        await msg.unpin();
      }
      return { content: [{ type: "text", text: `✅ Message ${pin ? "pinned" : "unpinned"}.` }] };
    },
  }),
  defineTool({
    name: "discord_search_messages",
    description:
      "Keyword search over a channel's recent messages using case-insensitive substring matching. Scans only up to the last 100 messages; it does not search full history. Returns { matches: [...] } with id, author, content, timestamp, and the text of any embeds. Matching checks message content only, so a word that appears only in an embed is not found. Requires the View Channel and Read Message History permissions; without Read Message History an empty scan fails with an error naming the permission. Use discord_read_messages to fetch recent messages without filtering. To search full history, in one channel or the whole server, use discord_search_guild_messages.",
    annotations: { title: "Search messages", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel or thread to search."),
      keyword: z.string().describe("Case-insensitive substring to match within message content."),
      limit: intIn(1, MAX_FETCH_LIMIT)
        .default(MAX_FETCH_LIMIT)
        .describe("Max number of recent messages to scan (1–100). Default 100."),
    }),
    outputSchema: z.object({ matches: z.array(messageSummary) }),
    handle: async ({ channel_id, keyword, limit }) => {
      const channel = await getTextChannel(channel_id);
      const messages = await channel.messages.fetch({ limit, cache: false });
      if (messages.size === 0) assertCanReadHistory(channel);
      const needle = keyword.toLowerCase();
      const matches = [...messages.values()]
        .filter((m) => m.content.toLowerCase().includes(needle))
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          id: m.id,
          author: m.author.tag,
          ...messageAuthor(m.author.id, m.webhookId),
          content: m.content,
          timestamp: m.createdAt.toISOString(),
          ...embedField(m.embeds),
        }));
      return structured({ matches });
    },
  }),
  defineTool({
    name: "discord_search_guild_messages",
    description:
      "Search for messages across all channels in a guild using Discord's native search API. Returns at most 25 messages matching the query with channel context, with no way to page past them. Age-restricted (NSFW) channels are left out. Requires the Read Message History permission and the Message Content privileged intent, enabled in the Developer Portal. While Discord is still building the server's search index, the call fails and says how many seconds to wait. Use discord_search_messages for a substring scan of one channel's last 100 messages. To read the messages around a hit, use discord_read_messages with around.",
    annotations: { title: "Search guild messages", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      query: z.string().describe("Search query (case-insensitive)."),
      channel_id: snowflake.optional().describe("Optional. Restrict search to this channel ID."),
      author_id: snowflake.optional().describe("Optional. Only show messages from this user ID."),
      limit: intIn(1, 25).default(25).describe("Max messages to return (1–25). Default 25."),
    }),
    outputSchema: z.object({
      matches: z.array(
        messageSummary.extend({
          channel_id: z.string(),
          channel_name: z.string(),
        }),
      ),
    }),
    handle: async ({ guild_id, query, channel_id, author_id, limit }) => {
      const searchParams: Record<string, string> = { content: query, limit: String(limit) };
      if (channel_id) searchParams.channel_id = channel_id;
      if (author_id) searchParams.author_id = author_id;

      const searchUrlParams = new URLSearchParams(searchParams);
      const result = await discord.rest.get(Routes.guildMessagesSearch(guild_id), {
        query: searchUrlParams,
      });

      const data = result as {
        messages?: Array<
          Array<{
            id: string;
            content: string;
            timestamp: string;
            channel_id: string;
            author: { id: string; username: string; discriminator: string };
            webhook_id?: string;
            embeds?: {
              title?: string;
              description?: string;
              url?: string;
              fields?: { name: string; value: string }[];
              author?: { name: string };
              footer?: { text: string };
            }[];
          }>
        >;
        retry_after?: number;
      };
      // Discord answers 202 with an index-not-ready body that carries no `messages`
      // key while it builds the guild's search index.
      if (!data.messages)
        throw new Error(
          `Discord is still building this server's message search index. Retry in ${Math.ceil(data.retry_after ?? 5)}s.`,
        );
      const matches = data.messages.flat().map((m) => ({
        id: m.id,
        author: userTag(m.author),
        ...messageAuthor(m.author.id, m.webhook_id),
        content: m.content,
        timestamp: m.timestamp,
        ...embedField(m.embeds ?? []),
        channel_id: m.channel_id,
        channel_name: "",
      }));

      const guild = await discord.guilds.fetch(guild_id);
      for (const match of matches) {
        match.channel_name = guild.channels.cache.get(match.channel_id)?.name ?? "unknown";
      }

      return structured({ matches });
    },
  }),
  defineTool({
    name: "discord_crosspost_message",
    description:
      "Publish (crosspost) a message from an Announcement channel to every server that follows it. Only works in announcement channels; a message that was already published returns a success and is not published again. Requires the Read Message History and Send Messages permissions (and Manage Messages for messages authored by others). Returns a confirmation. Use discord_forward_message to copy one message into another channel, or discord_follow_announcement_channel to subscribe a channel to future publications.",
    annotations: {
      title: "Crosspost message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe(
        "ID (snowflake) of the announcement channel containing the message.",
      ),
      message_id: messageId.describe("ID of the message to publish to followers."),
    }),
    handle: async ({ channel_id, message_id }) => {
      const channel = await fetchChannelChecked(channel_id);
      if (!channel || channel.type !== ChannelType.GuildAnnouncement)
        throw new Error(
          "Channel is not an announcement channel; only announcement-channel messages can be published.",
        );
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      try {
        await msg.crosspost();
      } catch (err) {
        // 40033 = already crossposted: treat as success so the tool is truly idempotent.
        if (err instanceof DiscordAPIError && Number(err.code) === 40033) {
          return {
            content: [{ type: "text", text: `✅ Message ${message_id} was already published.` }],
          };
        }
        throw err;
      }
      return {
        content: [
          {
            type: "text",
            text: `✅ Message ${msg.id} published to all followers of #${channel.name}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_remove_reactions",
    description:
      "Remove reactions from a message. With no emoji: removes ALL reactions. With emoji only: removes every reaction of that emoji. With emoji and user_id: removes that one user's reaction. user_id without emoji is rejected. Removing all reactions, every reaction of one emoji, or another user's reaction requires the Manage Messages permission. Use discord_add_reaction to add.",
    annotations: {
      title: "Remove reactions",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z
      .object({
        channel_id: channelId.describe(
          "ID (snowflake) of the channel or thread containing the message.",
        ),
        message_id: messageId.describe("ID of the message to remove reactions from."),
        emoji: z
          .string()
          .min(1)
          .optional()
          .describe(
            "Unicode emoji or custom emoji 'name:id'. Omit to remove ALL reactions on the message.",
          ),
        user_id: snowflake
          .optional()
          .describe(
            "Remove only this user's reaction for the given emoji. Requires emoji: the call is rejected without it.",
          ),
      })
      .refine(
        (a) => a.user_id === undefined || a.emoji !== undefined,
        "user_id requires emoji: without it, every reaction on the message would be removed.",
      ),
    handle: async ({ channel_id, message_id, emoji, user_id }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({
        message: message_id,
        cache: false,
        force: true,
      });
      if (!emoji) {
        await msg.reactions.removeAll();
        return {
          content: [{ type: "text", text: `✅ All reactions removed from message ${msg.id}.` }],
        };
      }
      const reaction = findReaction(msg, emoji);
      if (!reaction)
        throw new Error(`No reaction found for emoji "${emoji}" on message ${msg.id}.`);
      if (user_id) {
        await reaction.users.remove(user_id);
        return {
          content: [
            {
              type: "text",
              text: `✅ Removed ${emoji} reaction from user ${user_id} on message ${msg.id}.`,
            },
          ],
        };
      }
      await reaction.remove();
      return {
        content: [
          { type: "text", text: `✅ All ${emoji} reactions removed from message ${msg.id}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_get_reactions",
    description:
      "List the users who reacted to a message with a specific emoji. Returns { reactions: [...], hasMore, nextAfter } with id, username, bot flag, ordered by user ID. Returns 25 users by default and at most 100 per call; while hasMore is true pass nextAfter back as `after` for the next page. A reaction added while paging is missed if the user's ID sorts before the cursor. Super reactions are not listed. Fails when no one reacted with that emoji. Requires the View Channel and Read Message History permissions. For the votes of a native poll, use discord_get_poll_voters.",
    annotations: { title: "Get reactions", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe("ID of the message to inspect."),
      emoji: z.string().describe("Unicode emoji or custom emoji 'name:id' to list reactors for."),
      limit: intIn(1, MAX_FETCH_LIMIT)
        .default(DEFAULTS.LIMIT)
        .describe("Max users to return (1–100). Default 25."),
      after: snowflake
        .optional()
        .describe(
          "Pagination cursor: a user ID (snowflake). Pass the previous response's nextAfter to fetch the next page.",
        ),
    }),
    outputSchema: z.object({
      reactions: z.array(
        z.object({
          id: z.string(),
          username: z.string(),
          bot: z.boolean(),
        }),
      ),
      hasMore: z.boolean(),
      nextAfter: z.string().nullable(),
    }),
    handle: async ({ channel_id, message_id, emoji, limit, after }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({
        message: message_id,
        cache: false,
        force: true,
      });
      const reaction = findReaction(msg, emoji);
      if (!reaction)
        throw new Error(`No reaction found for emoji "${emoji}" on message ${msg.id}.`);
      const page = [
        ...(
          await reaction.users.fetch({ after, limit: Math.min(limit + 1, MAX_FETCH_LIMIT) })
        ).values(),
      ];
      const users = page.slice(0, limit);
      const last = users.at(-1);
      // Discord serves at most 100 users per call, so a full page of 100 needs a probe for more.
      const more =
        page.length > limit ||
        (last !== undefined &&
          users.length === MAX_FETCH_LIMIT &&
          (await reaction.users.fetch({ after: last.id, limit: 1 })).size > 0);
      const nextAfter = more && last ? last.id : null;
      return structured({
        reactions: users.map((u) => ({ id: u.id, username: u.username, bot: u.bot })),
        hasMore: nextAfter !== null,
        nextAfter,
      });
    },
  }),
  defineTool({
    name: "discord_get_message_attachments",
    description:
      "List the file attachments of a message. Returns { attachments: [...] } with id, filename, title (the original name when Discord strips non-ASCII from filename), url, proxyUrl, contentType, size in bytes, width, height, alt-text description, voice-message duration and waveform, spoiler flag. Discord signs CDN urls with a 24-hour expiry and does not re-sign on every fetch; re-call this tool if a stored url has expired. Requires the View Channel and Read Message History permissions. Without the Message Content privileged intent, enabled in the Developer Portal, Discord returns no attachments for other users' messages unless they mention the bot. A forwarded message's files sit in its snapshot and are not listed. Read-only. Use discord_read_messages to find messages with attachments.",
    annotations: { title: "Get message attachments", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe("ID of the message whose attachments to list."),
    }),
    outputSchema: z.object({ attachments: z.array(attachmentSummary) }),
    handle: async ({ channel_id, message_id }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      const attachments = [...msg.attachments.values()].map((a) => ({
        id: a.id,
        filename: a.name,
        contentType: a.contentType,
        size: a.size,
        url: a.url,
        proxyUrl: a.proxyURL,
        width: a.width,
        height: a.height,
        description: a.description,
        title: a.title,
        duration: a.duration,
        waveform: a.waveform,
        spoiler: a.spoiler,
      }));
      return structured({ attachments });
    },
  }),
  defineTool({
    name: "discord_fetch_pinned_messages",
    description:
      "List a channel's pinned messages, most recently pinned first. Returns { messages: [...], hasMore, nextBefore } with id, author, content, timestamp, pinnedAt, and the text of any embeds. Discord serves at most 50 pins per call, so when hasMore is true pass nextBefore back as `before` to fetch the next page. Requires the View Channel and Read Message History permissions; without Read Message History an empty result fails with an error naming the permission. Use discord_pin_message to change which messages are pinned, or discord_read_messages to read the whole channel.",
    annotations: { title: "Fetch pinned messages", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel or thread to list pins from."),
      limit: intIn(1, MAX_PINS_LIMIT)
        .default(MAX_PINS_LIMIT)
        .describe("Max pins per page (1–50). Default 50."),
      before: z.iso
        .datetime({ offset: true })
        .optional()
        .describe(
          "Pagination cursor: an ISO timestamp compared against when a message was pinned, not when it was sent. Pass the previous response's nextBefore to fetch older pins.",
        ),
    }),
    outputSchema: z.object({
      guild_id: z.string().nullable(),
      messages: z.array(messageSummary.extend({ pinnedAt: z.string() })),
      hasMore: z.boolean(),
      nextBefore: z.string().nullable(),
    }),
    handle: async ({ channel_id, limit, before }) => {
      const channel = await getTextChannel(channel_id);
      const pinned = await channel.messages.fetchPins({ limit, before, cache: false });
      if (pinned.items.length === 0) assertCanReadHistory(channel);
      const messages = pinned.items.map(({ message: m, pinnedAt }) => ({
        id: m.id,
        author: m.author.tag,
        ...messageAuthor(m.author.id, m.webhookId),
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        ...embedField(m.embeds),
        pinnedAt: pinnedAt.toISOString(),
      }));
      // Pins come back newest first, and hasMore follows the cursor so the two cannot disagree.
      const oldest = pinned.items.at(-1);
      const nextBefore = pinned.hasMore && oldest ? oldest.pinnedAt.toISOString() : null;
      return structured({
        guild_id: channel.guildId,
        messages,
        hasMore: nextBefore !== null,
        nextBefore,
      });
    },
  }),
  defineTool({
    name: "discord_forward_message",
    description:
      "Forward an existing message to another channel using Discord's native forward, which links back to the original message. The forward carries a snapshot of the content, embeds and attachments, without the original author. Works across text channels and threads. Discord forwards only regular messages, replies and command responses, not polls, and refuses a message whose content the bot cannot read (error 160014). Use discord_send_message to compose new content instead. Requires the View Channel and Read Message History permissions in the source channel and Send Messages in the target channel. Returns a confirmation. Use discord_crosspost_message to publish an announcement to following servers, or discord_follow_announcement_channel to repost a channel's future announcements.",
    annotations: {
      title: "Forward message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the source message.",
      ),
      message_id: messageId.describe("ID of the message to forward."),
      target_channel_id: snowflake.describe("ID (snowflake) of the destination channel or thread."),
    }),
    handle: async ({ channel_id, message_id, target_channel_id }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      const targetChannel = await getTextChannel(target_channel_id);
      // ThreadChannel<boolean> is the abstract base for PublicThreadChannel / PrivateThreadChannel;
      // any runtime instance is one of them, but the type narrowing can't be expressed without a cast.
      await msg.forward(
        targetChannel as TextChannel | PublicThreadChannel<boolean> | PrivateThreadChannel,
      );
      return {
        content: [
          { type: "text", text: `✅ Message ${msg.id} forwarded to #${targetChannel.name}.` },
        ],
      };
    },
  }),
];

export default defineModule(tools);
