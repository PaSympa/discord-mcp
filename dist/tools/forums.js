"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
/** Tool definitions for managing forum channels, posts, tags, and threads. */
exports.definitions = [
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
async function getForumChannel(channelId) {
    const channel = await client_js_1.discord.channels.fetch((0, client_js_1.validateId)(channelId, "forum_channel_id"));
    if (!channel || channel.type !== discord_js_1.ChannelType.GuildForum)
        throw new Error(`Channel ${channelId} is not a forum channel or doesn't exist.`);
    return channel;
}
/**
 * Fetches a channel by ID and guarantees it is a thread channel.
 */
async function getThreadChannel(threadId) {
    const channel = await client_js_1.discord.channels.fetch((0, client_js_1.validateId)(threadId, "thread_id"));
    if (!channel || !channel.isThread())
        throw new Error(`Channel ${threadId} is not a thread or doesn't exist.`);
    return channel;
}
/**
 * Handles all forum-related tools: list forums, create forum channels,
 * create/get/list/reply/delete/update forum posts, and manage forum tags.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_get_forum_channels": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const channels = await guild.channels.fetch();
            const forums = [...channels.values()]
                .filter((c) => c && c.type === discord_js_1.ChannelType.GuildForum)
                .map((c) => ({
                id: c.id,
                name: c.name,
                topic: c.topic,
                parentId: c.parentId,
            }));
            return { content: [{ type: "text", text: JSON.stringify(forums, null, 2) }] };
        }
        case "discord_create_forum_channel": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const created = await guild.channels.create({
                name: args.name,
                type: discord_js_1.ChannelType.GuildForum,
                topic: args.topic,
                parent: args.category_id,
            });
            return { content: [{ type: "text", text: `✅ Forum channel #${created.name} created (id: ${created.id}).` }] };
        }
        case "discord_create_forum_post": {
            const forum = await getForumChannel(args.forum_channel_id);
            const thread = await forum.threads.create({
                name: args.title,
                message: { content: args.content },
                appliedTags: args.applied_tags ?? [],
            });
            return { content: [{ type: "text", text: `✅ Forum post "${thread.name}" created (id: ${thread.id}) in #${forum.name}.` }] };
        }
        case "discord_get_forum_post": {
            const thread = await getThreadChannel(args.thread_id);
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
            const forum = await getForumChannel(args.forum_channel_id);
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
            const thread = await getThreadChannel(args.thread_id);
            const sent = await thread.send(args.content);
            return { content: [{ type: "text", text: `✅ Reply sent (id: ${sent.id}) in thread "${thread.name}".` }] };
        }
        case "discord_delete_forum_post": {
            const thread = await getThreadChannel(args.thread_id);
            const threadName = thread.name;
            await thread.delete();
            return { content: [{ type: "text", text: `✅ Forum post "${threadName}" deleted.` }] };
        }
        case "discord_get_forum_tags": {
            const forum = await getForumChannel(args.forum_channel_id);
            const tags = forum.availableTags.map((t) => ({
                id: t.id,
                name: t.name,
                emoji: t.emoji?.name ?? null,
                moderated: t.moderated,
            }));
            return { content: [{ type: "text", text: JSON.stringify(tags, null, 2) }] };
        }
        case "discord_set_forum_tags": {
            const forum = await getForumChannel(args.forum_channel_id);
            const tags = args.tags.map((t) => ({
                name: t.name,
                emoji: t.emoji_name ? { name: t.emoji_name, id: null } : undefined,
                moderated: t.moderated ?? false,
            }));
            await forum.setAvailableTags(tags);
            return { content: [{ type: "text", text: `✅ Forum tags updated on #${forum.name} (${tags.length} tags set).` }] };
        }
        case "discord_update_forum_post": {
            const thread = await getThreadChannel(args.thread_id);
            const editOptions = {};
            if (args.title !== undefined)
                editOptions.name = args.title;
            if (args.archived !== undefined)
                editOptions.archived = args.archived;
            if (args.locked !== undefined)
                editOptions.locked = args.locked;
            if (args.applied_tags !== undefined)
                editOptions.appliedTags = args.applied_tags;
            await thread.edit(editOptions);
            return { content: [{ type: "text", text: `✅ Forum post "${thread.name}" updated.` }] };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=forums.js.map