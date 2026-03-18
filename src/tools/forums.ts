import { ChannelType, ForumChannel, ThreadChannel } from "discord.js";
import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for managing forum channels, posts, tags, and threads. */
export const definitions = [
  {
    name: "discord_get_forum_channels",
    description: "List all forum channels in a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_create_forum_channel",
    description: "Create a new forum channel in a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        name: { type: "string" },
        topic: { type: "string", description: "The forum channel guidelines/topic." },
        category_id: { type: "string", description: "Parent category ID (optional)." },
      },
      required: ["guild_id", "name"],
    },
  },
  {
    name: "discord_create_forum_post",
    description: "Create a new post (thread) in a forum channel.",
    inputSchema: {
      type: "object",
      properties: {
        forum_channel_id: { type: "string" },
        title: { type: "string", description: "The post title (thread name)." },
        content: { type: "string", description: "The initial message content of the post." },
        applied_tags: {
          type: "array",
          items: { type: "string" },
          description: "Array of tag IDs to apply to the post.",
        },
      },
      required: ["forum_channel_id", "title", "content"],
    },
  },
  {
    name: "discord_get_forum_post",
    description: "Get a forum post's details and its messages.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
        limit: { type: "number", description: "Number of messages to fetch (1–100, default 20)." },
      },
      required: ["thread_id"],
    },
  },
  {
    name: "discord_list_forum_threads",
    description: "List all threads (active and archived) in a forum channel.",
    inputSchema: {
      type: "object",
      properties: {
        forum_channel_id: { type: "string" },
      },
      required: ["forum_channel_id"],
    },
  },
  {
    name: "discord_reply_to_forum",
    description: "Reply to a forum post (send a message in a forum thread).",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["thread_id", "content"],
    },
  },
  {
    name: "discord_delete_forum_post",
    description: "Delete (close) a forum post/thread.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
      },
      required: ["thread_id"],
    },
  },
  {
    name: "discord_get_forum_tags",
    description: "Get the available tags for a forum channel.",
    inputSchema: {
      type: "object",
      properties: {
        forum_channel_id: { type: "string" },
      },
      required: ["forum_channel_id"],
    },
  },
  {
    name: "discord_set_forum_tags",
    description: "Set or update the available tags on a forum channel.",
    inputSchema: {
      type: "object",
      properties: {
        forum_channel_id: { type: "string" },
        tags: {
          type: "array",
          description: "Array of tag objects to set on the forum channel.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              emoji_name: { type: "string", description: "Unicode emoji for the tag (optional)." },
              moderated: { type: "boolean", description: "If true, only moderators can apply this tag (optional)." },
            },
            required: ["name"],
          },
        },
      },
      required: ["forum_channel_id", "tags"],
    },
  },
  {
    name: "discord_update_forum_post",
    description: "Update a forum post's title, archived/locked status, or applied tags.",
    inputSchema: {
      type: "object",
      properties: {
        thread_id: { type: "string" },
        title: { type: "string", description: "New title for the forum post." },
        archived: { type: "boolean", description: "Whether to archive the thread." },
        locked: { type: "boolean", description: "Whether to lock the thread." },
        applied_tags: {
          type: "array",
          items: { type: "string" },
          description: "Array of tag IDs to apply to the post.",
        },
      },
      required: ["thread_id"],
    },
  },
];

/**
 * Fetches a channel by ID and guarantees it is a forum channel.
 */
async function getForumChannel(channelId: string): Promise<ForumChannel> {
  const channel = await discord.channels.fetch(validateId(channelId, "forum_channel_id"));
  if (!channel || channel.type !== ChannelType.GuildForum)
    throw new Error(`Channel ${channelId} is not a forum channel or doesn't exist.`);
  return channel as ForumChannel;
}

/**
 * Fetches a channel by ID and guarantees it is a thread channel.
 */
async function getThreadChannel(threadId: string): Promise<ThreadChannel> {
  const channel = await discord.channels.fetch(validateId(threadId, "thread_id"));
  if (!channel || !channel.isThread())
    throw new Error(`Channel ${threadId} is not a thread or doesn't exist.`);
  return channel as ThreadChannel;
}

/**
 * Handles all forum-related tools: list forums, create forum channels,
 * create/get/list/reply/delete/update forum posts, and manage forum tags.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_get_forum_channels": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const channels = await guild.channels.fetch();
      const forums = [...channels.values()]
        .filter((c) => c && c.type === ChannelType.GuildForum)
        .map((c) => ({
          id: c!.id,
          name: c!.name,
          topic: (c as ForumChannel).topic,
          parentId: c!.parentId,
        }));
      return { content: [{ type: "text", text: JSON.stringify(forums, null, 2) }] };
    }

    case "discord_create_forum_channel": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const created = await guild.channels.create({
        name: args.name as string,
        type: ChannelType.GuildForum,
        topic: args.topic as string | undefined,
        parent: args.category_id as string | undefined,
      });
      return { content: [{ type: "text", text: `✅ Forum channel #${created.name} created (id: ${created.id}).` }] };
    }

    case "discord_create_forum_post": {
      const forum = await getForumChannel(args.forum_channel_id as string);
      const thread = await forum.threads.create({
        name: args.title as string,
        message: { content: args.content as string },
        appliedTags: (args.applied_tags as string[] | undefined) ?? [],
      });
      return { content: [{ type: "text", text: `✅ Forum post "${thread.name}" created (id: ${thread.id}) in #${forum.name}.` }] };
    }

    case "discord_get_forum_post": {
      const thread = await getThreadChannel(args.thread_id as string);
      const limit = Math.min(Number(args.limit ?? 20), 100);
      const messages = await thread.messages.fetch({ limit });
      const result = {
        id: thread.id,
        name: thread.name,
        archived: thread.archived,
        locked: thread.locked,
        messageCount: thread.messageCount,
        appliedTags: thread.appliedTags,
        createdAt: thread.createdAt?.toISOString(),
        messages: [...messages.values()]
          .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
          .map((m) => ({
            id: m.id,
            author: m.author.tag,
            content: m.content,
            timestamp: m.createdAt.toISOString(),
          })),
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_list_forum_threads": {
      const forum = await getForumChannel(args.forum_channel_id as string);
      const active = await forum.threads.fetchActive();
      const archived = await forum.threads.fetchArchived();
      const threads = [
        ...active.threads.values(),
        ...archived.threads.values(),
      ].map((t) => ({
        id: t.id,
        name: t.name,
        archived: t.archived,
        locked: t.locked,
        messageCount: t.messageCount,
        appliedTags: t.appliedTags,
        createdAt: t.createdAt?.toISOString(),
      }));
      return { content: [{ type: "text", text: JSON.stringify(threads, null, 2) }] };
    }

    case "discord_reply_to_forum": {
      const thread = await getThreadChannel(args.thread_id as string);
      const sent = await thread.send(args.content as string);
      return { content: [{ type: "text", text: `✅ Reply sent (id: ${sent.id}) in thread "${thread.name}".` }] };
    }

    case "discord_delete_forum_post": {
      const thread = await getThreadChannel(args.thread_id as string);
      const threadName = thread.name;
      await thread.delete();
      return { content: [{ type: "text", text: `✅ Forum post "${threadName}" deleted.` }] };
    }

    case "discord_get_forum_tags": {
      const forum = await getForumChannel(args.forum_channel_id as string);
      const tags = forum.availableTags.map((t) => ({
        id: t.id,
        name: t.name,
        emoji: t.emoji?.name ?? null,
        moderated: t.moderated,
      }));
      return { content: [{ type: "text", text: JSON.stringify(tags, null, 2) }] };
    }

    case "discord_set_forum_tags": {
      const forum = await getForumChannel(args.forum_channel_id as string);
      const tags = (args.tags as { name: string; emoji_name?: string; moderated?: boolean }[]).map((t) => ({
        name: t.name,
        emoji: t.emoji_name ? { name: t.emoji_name, id: null } : undefined,
        moderated: t.moderated ?? false,
      }));
      await forum.setAvailableTags(tags);
      return { content: [{ type: "text", text: `✅ Forum tags updated on #${forum.name} (${tags.length} tags set).` }] };
    }

    case "discord_update_forum_post": {
      const thread = await getThreadChannel(args.thread_id as string);
      const editOptions: Record<string, unknown> = {};
      if (args.title !== undefined) editOptions.name = args.title as string;
      if (args.archived !== undefined) editOptions.archived = args.archived as boolean;
      if (args.locked !== undefined) editOptions.locked = args.locked as boolean;
      if (args.applied_tags !== undefined) editOptions.appliedTags = args.applied_tags as string[];
      await thread.edit(editOptions);
      return { content: [{ type: "text", text: `✅ Forum post "${thread.name}" updated.` }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
