import { ChannelType, ForumChannel, ThreadChannel } from "discord.js";
import { z } from "zod";
import { embedSummary, embedField } from "../embeds.js";
import { discord, fetchChannelChecked } from "../client.js";
import { defineTool, defineModule, snowflake, guildId, intIn, structured } from "./define.js";

const threadId = snowflake.describe("ID (snowflake) of the forum post (thread).");

/** Shape of a forum post (thread) summary, shared by the post getter and thread lister. */
const threadSummary = z.object({
  id: z.string(),
  name: z.string(),
  archived: z.boolean().nullable(),
  locked: z.boolean().nullable(),
  messageCount: z.number().nullable(),
  appliedTags: z.array(z.string()),
  createdAt: z.string().nullable(),
});

/**
 * Fetches a channel by ID and guarantees it is a forum channel.
 */
async function getForumChannel(channelId: string): Promise<ForumChannel> {
  const channel = await fetchChannelChecked(channelId);
  if (!channel || channel.type !== ChannelType.GuildForum)
    throw new Error(`Channel ${channelId} is not a forum channel or doesn't exist.`);
  return channel as ForumChannel;
}

/**
 * Fetches a channel by ID and guarantees it is a thread channel.
 */
async function getThreadChannel(id: string): Promise<ThreadChannel> {
  const channel = await fetchChannelChecked(id, { force: true });
  if (!channel || !channel.isThread())
    throw new Error(`Channel ${id} is not a thread or doesn't exist.`);
  return channel as ThreadChannel;
}

/** Tool definitions for managing forum channels, posts, tags, and threads. */
const tools = [
  defineTool({
    name: "discord_get_forum_channels",
    description:
      "List the forum channels in a server (id, name, topic, parent category). Read-only. Use discord_get_forum_tags to see a forum's available tags, or discord_list_forum_threads for its posts.",
    annotations: { title: "List forum channels", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({
      channels: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          topic: z.string().nullable(),
          parentId: z.string().nullable(),
        }),
      ),
    }),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const channels = await guild.channels.fetch();
      const forums = [...channels.values()]
        .filter((c) => c && c.type === ChannelType.GuildForum)
        .map((c) => ({
          id: c!.id,
          name: c!.name,
          topic: (c as ForumChannel).topic,
          parentId: c!.parentId,
        }));
      return structured({ channels: forums });
    },
  }),
  defineTool({
    name: "discord_create_forum_channel",
    description:
      "Create a new forum channel in a server. A forum holds posts (threads) rather than a linear message feed. Requires the Manage Channels permission. Use discord_create_channel for text/voice channels instead. Returns the new channel's name and ID.",
    annotations: {
      title: "Create forum channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      name: z.string().describe("Name of the new forum channel (max 100 characters)."),
      topic: z.string().optional().describe("Guidelines/topic text shown at the top of the forum."),
      category_id: snowflake
        .optional()
        .describe("Optional category (snowflake) to nest the forum under."),
    }),
    handle: async ({ guild_id, name, topic, category_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const created = await guild.channels.create({
        name,
        type: ChannelType.GuildForum,
        topic,
        parent: category_id,
      });
      return {
        content: [
          { type: "text", text: `✅ Forum channel #${created.name} created (id: ${created.id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_create_forum_post",
    description:
      "Create a new post (a thread with a starter message) in a forum channel. Requires the Send Messages and Create Public Threads permissions. Use discord_reply_to_forum to add follow-up messages. Returns the new post's name and thread ID.",
    annotations: {
      title: "Create forum post",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      forum_channel_id: snowflake.describe("ID (snowflake) of the forum channel to post in."),
      title: z
        .string()
        .describe("Title of the post, used as the thread name (max 100 characters)."),
      content: z.string().describe("Body of the post's starter message (max 2000 characters)."),
      applied_tags: z
        .array(z.string())
        .optional()
        .describe("Optional tag IDs to apply. Get valid IDs from discord_get_forum_tags."),
    }),
    handle: async ({ forum_channel_id, title, content, applied_tags }) => {
      const forum = await getForumChannel(forum_channel_id);
      const thread = await forum.threads.create({
        name: title,
        message: { content },
        appliedTags: applied_tags ?? [],
      });
      return {
        content: [
          {
            type: "text",
            text: `✅ Forum post "${thread.name}" created (id: ${thread.id}) in #${forum.name}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_get_forum_post",
    description:
      "Get a forum post's details (title, archived/locked state, applied tags, message count) plus its recent messages, oldest-to-newest. Read-only. Pass the post's thread_id. Returns a JSON object.",
    annotations: { title: "Get forum post", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      thread_id: threadId,
      limit: intIn(1, 100)
        .default(20)
        .describe("How many recent messages to include (1–100). Default 20."),
    }),
    outputSchema: threadSummary.extend({
      messages: z.array(
        z.object({
          id: z.string(),
          author: z.string(),
          content: z.string(),
          timestamp: z.string(),
          embeds: z.array(embedSummary).optional(),
        }),
      ),
    }),
    handle: async ({ thread_id, limit }) => {
      const thread = await getThreadChannel(thread_id);
      const messages = await thread.messages.fetch({ limit, cache: false });
      const result = {
        id: thread.id,
        name: thread.name,
        archived: thread.archived,
        locked: thread.locked,
        messageCount: thread.messageCount,
        appliedTags: thread.appliedTags,
        createdAt: thread.createdAt?.toISOString() ?? null,
        messages: [...messages.values()]
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map((m) => ({
            id: m.id,
            author: m.author.tag,
            content: m.content,
            timestamp: m.createdAt.toISOString(),
            ...embedField(m.embeds),
          })),
      };
      return structured(result);
    },
  }),
  defineTool({
    name: "discord_list_forum_threads",
    description:
      "List posts in a forum channel. Returns { threads: [...], hasMore, nextBefore }. The first call (no `before`) includes all active posts plus the first page of archived posts; archived posts are paginated, so if hasMore is true pass nextBefore back as `before` to fetch older archived posts. Read-only. Use discord_get_forum_post to read one post's messages.",
    annotations: { title: "List forum threads", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      forum_channel_id: snowflake.describe(
        "ID (snowflake) of the forum channel to list posts from.",
      ),
      limit: intIn(1, 100)
        .default(100)
        .describe("Max archived posts per page (1–100). Default 100."),
      before: z.iso
        .datetime({ offset: true })
        .optional()
        .describe(
          "Pagination cursor: an ISO timestamp. Pass the previous response's nextBefore to fetch older archived posts. When set, active posts are omitted.",
        ),
    }),
    outputSchema: z.object({
      threads: z.array(threadSummary),
      hasMore: z.boolean(),
      nextBefore: z.string().nullable(),
    }),
    handle: async ({ forum_channel_id, limit, before }) => {
      const forum = await getForumChannel(forum_channel_id);
      const beforeDate = before !== undefined ? new Date(before) : undefined;
      const collected: ThreadChannel[] = [];
      if (beforeDate === undefined) {
        const active = await forum.threads.fetchActive();
        collected.push(...active.threads.values());
      }
      const archived = await forum.threads.fetchArchived({ limit, before: beforeDate });
      collected.push(...archived.threads.values());
      const threads = collected.map((t) => ({
        id: t.id,
        name: t.name,
        archived: t.archived,
        locked: t.locked,
        messageCount: t.messageCount,
        appliedTags: t.appliedTags,
        createdAt: t.createdAt?.toISOString() ?? null,
      }));
      const lastArchived = archived.threads.last();
      const nextBefore = archived.hasMore
        ? (lastArchived?.archivedAt?.toISOString() ?? null)
        : null;
      return structured({ threads, hasMore: archived.hasMore, nextBefore });
    },
  }),
  defineTool({
    name: "discord_reply_to_forum",
    description:
      "Post a follow-up message inside an existing forum post (thread). Requires the Send Messages in Threads permission (shown as 'Send Messages in Posts' for forums). Use discord_create_forum_post to start a new post instead. Returns the new message ID.",
    annotations: {
      title: "Reply to forum post",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      thread_id: snowflake.describe("ID (snowflake) of the forum post (thread) to reply in."),
      content: z.string().describe("Plain-text body of the reply (max 2000 characters)."),
    }),
    handle: async ({ thread_id, content }) => {
      const thread = await getThreadChannel(thread_id);
      const sent = await thread.send(content);
      return {
        content: [
          { type: "text", text: `✅ Reply sent (id: ${sent.id}) in thread "${thread.name}".` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_delete_forum_post",
    description:
      "Permanently delete a forum post (thread) and all its messages. IRREVERSIBLE. To merely close it without deleting, use discord_update_forum_post with archived:true. Requires the Manage Threads permission.",
    annotations: {
      title: "Delete forum post",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      thread_id: snowflake.describe("ID (snowflake) of the forum post (thread) to delete."),
    }),
    handle: async ({ thread_id }) => {
      const thread = await getThreadChannel(thread_id);
      const threadName = thread.name;
      await thread.delete();
      return { content: [{ type: "text", text: `✅ Forum post "${threadName}" deleted.` }] };
    },
  }),
  defineTool({
    name: "discord_get_forum_tags",
    description:
      "List the tags available on a forum channel (id, name, emoji, moderated flag). Read-only. Use these IDs with discord_create_forum_post or discord_update_forum_post; manage the tag set with discord_set_forum_tags.",
    annotations: { title: "Get forum tags", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      forum_channel_id: snowflake.describe(
        "ID (snowflake) of the forum channel to read tags from.",
      ),
    }),
    outputSchema: z.object({
      tags: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          emoji: z.string().nullable(),
          moderated: z.boolean(),
        }),
      ),
    }),
    handle: async ({ forum_channel_id }) => {
      const forum = await getForumChannel(forum_channel_id);
      const tags = forum.availableTags.map((t) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji?.name ?? null,
        moderated: t.moderated,
      }));
      return structured({ tags });
    },
  }),
  defineTool({
    name: "discord_set_forum_tags",
    description:
      "Replace the full set of available tags on a forum channel with the provided list. This overwrites existing tags, so include every tag you want to keep. Requires the Manage Channels permission. Returns a confirmation.",
    annotations: {
      title: "Set forum tags",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      forum_channel_id: snowflake.describe("ID (snowflake) of the forum channel to set tags on."),
      tags: z
        .array(
          z.strictObject({
            name: z.string().describe("Tag label (max 20 characters)."),
            emoji_name: z.string().optional().describe("Optional unicode emoji shown on the tag."),
            moderated: z
              .boolean()
              .optional()
              .describe(
                "If true, only members with Manage Threads can apply this tag. Default false.",
              ),
          }),
        )
        .describe("Complete list of tags to set (replaces all existing tags)."),
    }),
    handle: async ({ forum_channel_id, tags }) => {
      const forum = await getForumChannel(forum_channel_id);
      const mapped = tags.map((t) => ({
        name: t.name,
        emoji: t.emoji_name ? { name: t.emoji_name, id: null } : undefined,
        moderated: t.moderated ?? false,
      }));
      await forum.setAvailableTags(mapped);
      return {
        content: [
          {
            type: "text",
            text: `✅ Forum tags updated on #${forum.name} (${mapped.length} tags set).`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_update_forum_post",
    description:
      "Update a forum post's title, archived/locked state, or applied tags. Only provided fields change; passing applied_tags replaces the post's tags. Set archived:true to close a post without deleting it. Requires the Manage Threads permission.",
    annotations: {
      title: "Update forum post",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      thread_id: snowflake.describe("ID (snowflake) of the forum post (thread) to update."),
      title: z.string().optional().describe("New title/thread name (max 100 characters)."),
      archived: z
        .boolean()
        .optional()
        .describe("true to archive (close) the post, false to reopen it."),
      locked: z
        .boolean()
        .optional()
        .describe("true to lock the post so only moderators can reply."),
      applied_tags: z
        .array(z.string())
        .optional()
        .describe(
          "Tag IDs to apply; replaces the post's current tags. Get valid IDs from discord_get_forum_tags.",
        ),
    }),
    handle: async ({ thread_id, title, archived, locked, applied_tags }) => {
      const thread = await getThreadChannel(thread_id);
      const editOptions: Record<string, unknown> = {};
      if (title !== undefined) editOptions.name = title;
      if (archived !== undefined) editOptions.archived = archived;
      if (locked !== undefined) editOptions.locked = locked;
      if (applied_tags !== undefined) editOptions.appliedTags = applied_tags;
      await thread.edit(editOptions);
      return { content: [{ type: "text", text: `✅ Forum post "${thread.name}" updated.` }] };
    },
  }),
];

export default defineModule(tools);
