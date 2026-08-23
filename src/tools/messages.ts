import {
  ChannelType,
  TextChannel,
  PublicThreadChannel,
  PrivateThreadChannel,
  Message,
  MessageReaction,
  Routes,
  SnowflakeUtil,
  DiscordAPIError,
} from "discord.js";
import { z } from "zod";
import { discord, getTextChannel, fetchChannelChecked } from "../client.js";
import { MAX_FETCH_LIMIT, DEFAULTS, AUTO_ARCHIVE_DURATIONS } from "../constants.js";
import { buildEmbed, embedFieldsShape, embedArraySchema } from "../embeds.js";
import { defineModule, defineTool, snowflake, guildId, intIn, structured } from "./define.js";

const channelId = snowflake.describe("ID (snowflake) of the channel or thread.");
const messageId = snowflake.describe("ID of the message.");

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
  "Return messages centred on this message ID (snowflake): Discord splits `limit` either side of it. Use it to pull the conversation surrounding one message, such as a discord_search_messages hit.",
);
const sinceInstant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Must be an ISO 8601 date or date-time.",
  })
  .describe(
    'Return only messages posted after this instant, as an ISO 8601 date or date-time (e.g. "2026-08-01" or "2026-08-01T09:00:00Z"). Convenience form of `after` for callers that know a date but not a message id.',
  );

const SINGLE_CURSOR_MESSAGE =
  "Pass at most one of before, after, around, or since: Discord treats before/after/around as mutually exclusive, and since is a form of after.";

/** True when at most one paging cursor was supplied. */
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
 * exactly. Instants before the Discord epoch are clamped to it: `generate` returns
 * a negative id for them, which the API rejects.
 */
function cursorForInstant(iso: string): string {
  const timestamp = Math.max(Date.parse(iso), Number(SnowflakeUtil.epoch));
  return SnowflakeUtil.generate({ timestamp }).toString();
}

const messageSummary = z.object({
  id: z.string(),
  author: z.string(),
  content: z.string(),
  timestamp: z.string(),
});

/**
 * Looks up a reaction on a message by emoji argument.
 * The reaction cache is keyed by the emoji id (snowflake) for custom emoji and
 * by the raw unicode char for standard emoji, NOT by the "name:id" / "<:name:id>"
 * form the tool schema accepts, so a custom emoji is normalized to its id first.
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

/** Tool definitions for channel and thread messages. */
const tools = [
  defineTool({
    name: "discord_read_messages",
    description:
      "Read messages from a text channel or thread, oldest-to-newest. Without a cursor it returns the most recent messages; pass before, after, around, or since (at most one) to reach older history or the context surrounding a known message. Page backwards by re-calling with before set to the id of the oldest message you received, which walks a channel past the 100-message per-call cap. Requires View Channel and Read Message History. Returns { messages: [...] } with id, author, content, timestamp, attachment count, pinned flag. Use discord_search_messages to filter by keyword, or discord_fetch_pinned_messages for pinned messages only.",
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
      .refine(hasSingleCursor, { message: SINGLE_CURSOR_MESSAGE }),
    outputSchema: z.object({
      messages: z.array(messageSummary.extend({ attachments: z.number(), pinned: z.boolean() })),
    }),
    handle: async ({ channel_id, limit, before, after, around, since }) => {
      const channel = await getTextChannel(channel_id);
      const resolvedAfter = after ?? (since === undefined ? undefined : cursorForInstant(since));
      const messages = await channel.messages.fetch({
        limit,
        cache: false,
        ...(before === undefined ? {} : { before }),
        ...(around === undefined ? {} : { around }),
        ...(resolvedAfter === undefined ? {} : { after: resolvedAfter }),
      });
      const result = [...messages.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          id: m.id,
          author: m.author.tag,
          content: m.content,
          timestamp: m.createdAt.toISOString(),
          attachments: m.attachments.size,
          pinned: m.pinned,
        }));
      return structured({ messages: result });
    },
  }),
  defineTool({
    name: "discord_send_message",
    description:
      "Send a plain-text message to a channel or thread. For rich content (title, color, fields, images) use discord_send_embed; to attach a reply reference to an existing message use discord_reply_message. Requires the bot to have the Send Messages permission. Returns the new message ID.",
    annotations: {
      title: "Send message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the target channel or thread."),
      content: z.string().describe("Plain-text body of the message (max 2000 characters)."),
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
      "Reply to a specific message, attaching a reply reference so clients show it as a threaded reply. Use discord_send_message for a standalone message with no reference. Requires the Send Messages permission. Returns the new reply's message ID.",
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
      content: z.string().describe("Plain-text body of the reply (max 2000 characters)."),
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
      "Edit the text content of a message previously sent by this bot. Discord forbids editing other users' messages, so this fails for non-bot messages. Use discord_edit_embed for embed messages. Works in text channels and threads. Returns the edited message ID.",
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
      content: z
        .string()
        .describe(
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
      "Add a single emoji reaction to a message as the bot. Requires the Add Reactions and Read Message History permissions. Use discord_remove_reactions to undo. Idempotent: re-adding the bot's existing reaction has no effect.",
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
    name: "discord_create_thread",
    description:
      "Create a thread, either branching from an existing message (pass message_id) or as a standalone thread in a text channel (omit message_id). Standalone creation requires a parent text channel and fails if channel_id is itself a thread. Requires the Create Public Threads permission. Returns the new thread's ID.",
    annotations: {
      title: "Create thread",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe(
        "ID (snowflake) of the parent text channel. For a message-based thread, the channel containing message_id.",
      ),
      name: z.string().describe("Name of the thread to create (max 100 characters)."),
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
    }),
    handle: async ({ channel_id, name, message_id, auto_archive_duration }) => {
      const channel = await getTextChannel(channel_id);
      const duration = auto_archive_duration;
      if (message_id) {
        const msg = await channel.messages.fetch({ message: message_id, cache: false });
        const thread = await msg.startThread({ name, autoArchiveDuration: duration });
        return {
          content: [
            {
              type: "text",
              text: `✅ Thread "${thread.name}" created from message (id: ${thread.id}).`,
            },
          ],
        };
      }
      if (!(channel instanceof TextChannel)) {
        throw new Error(
          `Standalone thread creation requires a parent TextChannel; ${channel_id} is itself a thread. Pass a message_id to start a thread from a message instead.`,
        );
      }
      const thread = await channel.threads.create({
        name,
        autoArchiveDuration: duration,
        type: ChannelType.PublicThread,
      });
      return {
        content: [{ type: "text", text: `✅ Thread "${thread.name}" created (id: ${thread.id}).` }],
      };
    },
  }),
  defineTool({
    name: "discord_bulk_delete_messages",
    description:
      "Permanently delete multiple recent messages in one call. IRREVERSIBLE. SAFE BY DEFAULT: dry_run is true unless explicitly set to false, so call it first to preview, then re-call with dry_run:false to actually delete. Discord only allows bulk-deleting messages younger than 14 days; older ones are skipped. Requires the Manage Messages permission. Returns the number deleted.",
    annotations: {
      title: "Bulk delete messages",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe(
        "ID (snowflake) of the channel or thread to delete messages from.",
      ),
      count: intIn(2, MAX_FETCH_LIMIT).describe("Number of recent messages to delete (2–100)."),
      dry_run: z
        .boolean()
        .default(true)
        .describe(
          "If true (default), only reports how many would be deleted without deleting. Set false to actually delete.",
        ),
    }),
    handle: async ({ channel_id, count, dry_run }) => {
      const channel = await getTextChannel(channel_id);
      if (dry_run) {
        const recent = await channel.messages.fetch({ limit: count, cache: false });
        const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
        const deletable = recent.filter((m) => m.createdTimestamp > cutoff).size;
        return {
          content: [
            {
              type: "text",
              text: `🔍 Dry run: ${deletable} of the ${recent.size} most recent messages in #${channel.name} would be deleted (${recent.size - deletable} older than 14 days are skipped). Re-call with dry_run:false to delete.`,
            },
          ],
        };
      }
      const deleted = await channel.bulkDelete(count, true);
      return {
        content: [
          { type: "text", text: `✅ Deleted ${deleted.size} messages in #${channel.name}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_send_embed",
    description:
      "Send a single rich embed (title, description, color, fields, author, footer, images, timestamp). Use discord_send_message for plain text, or discord_send_multiple_embeds to send several embeds at once. Requires the Send Messages and Embed Links permissions. Returns the new message ID.",
    annotations: {
      title: "Send embed",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the target channel or thread."),
      ...embedFieldsShape,
    }),
    handle: async ({ channel_id, ...embedArgs }) => {
      const channel = await getTextChannel(channel_id);
      const sent = await channel.send({ embeds: [buildEmbed(embedArgs)] });
      return {
        content: [{ type: "text", text: `✅ Embed sent (id: ${sent.id}) in #${channel.name}.` }],
      };
    },
  }),
  defineTool({
    name: "discord_edit_embed",
    description:
      "Replace the embed on a message previously sent by this bot. Only this bot's messages can be edited. This is a full replace, not a merge: provided fields are applied and omitted fields are dropped from the embed. Returns a confirmation.",
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
      "Send up to 10 embeds in a single message, with optional text above them. Use discord_send_embed for a single embed. Requires the Send Messages and Embed Links permissions. Returns the new message ID.",
    annotations: {
      title: "Send multiple embeds",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the target channel or thread."),
      content: z.string().optional().describe("Optional plain text shown above the embeds."),
      embeds: embedArraySchema.describe("Array of embed objects to send (max 10)."),
    }),
    handle: async ({ channel_id, content, embeds }) => {
      const channel = await getTextChannel(channel_id);
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
      "Permanently delete one specific message. IRREVERSIBLE. The bot can always delete its own messages; deleting another user's message requires the Manage Messages permission. Use discord_bulk_delete_messages to remove many at once. An optional reason is recorded in the audit log.",
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
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ channel_id, message_id, reason }) => {
      const channel = await getTextChannel(channel_id);
      await channel.messages.fetch({ message: message_id, cache: false });
      // msg.delete() cannot carry an audit-log reason; the raw REST call sets X-Audit-Log-Reason.
      await discord.rest.delete(Routes.channelMessage(channel.id, message_id), { reason });
      return { content: [{ type: "text", text: `✅ Message ${message_id} deleted.` }] };
    },
  }),
  defineTool({
    name: "discord_pin_message",
    description:
      "Pin or unpin a message in a channel, controlled by the pin flag. Requires the Pin Messages permission (a dedicated permission since early 2026, separate from Manage Messages). A channel holds at most 50 pins. Idempotent: pinning an already-pinned message (or unpinning an unpinned one) has no additional effect.",
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
      "Keyword search over a channel's recent messages using case-insensitive substring matching. Scans only up to the last 100 messages — it does not search full history. Returns { matches: [...] } with id, author, content, timestamp. Use discord_read_messages to fetch recent messages without filtering.",
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
      const needle = keyword.toLowerCase();
      const matches = [...messages.values()]
        .filter((m) => m.content.toLowerCase().includes(needle))
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          id: m.id,
          author: m.author.tag,
          content: m.content,
          timestamp: m.createdAt.toISOString(),
        }));
      return structured({ matches });
    },
  }),
  defineTool({
    name: "discord_search_guild_messages",
    description:
      "Search for messages across all channels in a guild using Discord's native search API. Returns messages matching the query with channel context. Requires READ_MESSAGE_HISTORY permission. Use discord_search_messages for channel-specific search.",
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
            author: { username: string; discriminator: string };
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
        content: m.content,
        timestamp: m.timestamp,
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
      "Publish (crosspost) a message from an Announcement channel to every server that follows it. Only works in announcement channels on a message that has not already been published. Requires the Send Messages permission (and Manage Messages for messages authored by others). Returns a confirmation.",
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
          "Channel is not an announcement channel — only announcement-channel messages can be published.",
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
      "Remove reactions from a message. With no emoji: removes ALL reactions. With emoji only: removes every reaction of that emoji. With emoji and user_id: removes that one user's reaction. Removing all reactions or another user's reaction requires the Manage Messages permission. Use discord_add_reaction to add.",
    annotations: {
      title: "Remove reactions",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe(
        "ID (snowflake) of the channel or thread containing the message.",
      ),
      message_id: messageId.describe("ID of the message to remove reactions from."),
      emoji: z
        .string()
        .optional()
        .describe(
          "Unicode emoji or custom emoji 'name:id'. Omit to remove ALL reactions on the message.",
        ),
      user_id: snowflake
        .optional()
        .describe(
          "Remove only this user's reaction for the given emoji. Requires emoji to be set.",
        ),
    }),
    handle: async ({ channel_id, message_id, emoji, user_id }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
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
      "List the users who reacted to a message with a specific emoji. Returns { reactions: [...] } with id, username, bot flag. Read-only.",
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
    }),
    outputSchema: z.object({
      reactions: z.array(
        z.object({
          id: z.string(),
          username: z.string(),
          bot: z.boolean(),
        }),
      ),
    }),
    handle: async ({ channel_id, message_id, emoji, limit }) => {
      const channel = await getTextChannel(channel_id);
      const msg = await channel.messages.fetch({ message: message_id, cache: false });
      const reaction = findReaction(msg, emoji);
      if (!reaction)
        throw new Error(`No reaction found for emoji "${emoji}" on message ${msg.id}.`);
      const users = await reaction.users.fetch({ limit });
      const result = [...users.values()].map((u) => ({
        id: u.id,
        username: u.username,
        bot: u.bot,
      }));
      return structured({ reactions: result });
    },
  }),
  defineTool({
    name: "discord_fetch_pinned_messages",
    description:
      "List all pinned messages in a channel. Returns { messages: [...] } with id, author, content, timestamp, pinnedAt. Read-only. Use discord_pin_message to change which messages are pinned.",
    annotations: { title: "Fetch pinned messages", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel or thread to list pins from."),
    }),
    outputSchema: z.object({
      messages: z.array(messageSummary.extend({ pinnedAt: z.string() })),
    }),
    handle: async ({ channel_id }) => {
      const channel = await getTextChannel(channel_id);
      const pinned = await channel.messages.fetchPins();
      const result = pinned.items.map(({ message: m, pinnedAt }) => ({
        id: m.id,
        author: m.author.tag,
        content: m.content,
        timestamp: m.createdAt.toISOString(),
        pinnedAt: pinnedAt.toISOString(),
      }));
      return structured({ messages: result });
    },
  }),
  defineTool({
    name: "discord_forward_message",
    description:
      "Forward an existing message to another channel using Discord's native forward, which preserves the original attribution. Works across text channels and threads. Use discord_send_message to compose new content instead. Requires the Send Messages permission in the target channel. Returns a confirmation.",
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
