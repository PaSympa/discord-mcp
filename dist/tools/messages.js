"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
const constants_js_1 = require("../constants.js");
/** Tool definitions for reading, sending, replying, editing, reacting, threading, embedding, deleting, pinning, and searching messages. */
exports.definitions = [
    {
        name: "discord_read_messages",
        description: "Read the last N messages from a text channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                limit: { type: "number", description: "1–100, default 20." },
            },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_send_message",
        description: "Send a plain text message to a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                content: { type: "string" },
            },
            required: ["channel_id", "content"],
        },
    },
    {
        name: "discord_reply_message",
        description: "Reply to a specific message in a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string", description: "The message ID to reply to." },
                content: { type: "string" },
            },
            required: ["channel_id", "message_id", "content"],
        },
    },
    {
        name: "discord_edit_message",
        description: "Edit a message sent by the bot.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string", description: "The message ID to edit (must be a bot message)." },
                content: { type: "string", description: "New text content for the message." },
            },
            required: ["channel_id", "message_id", "content"],
        },
    },
    {
        name: "discord_add_reaction",
        description: "Add a reaction emoji to a message.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string" },
                emoji: { type: "string", description: "Unicode emoji (e.g. '👍') or custom emoji in format 'name:id'." },
            },
            required: ["channel_id", "message_id", "emoji"],
        },
    },
    {
        name: "discord_create_thread",
        description: "Create a thread from an existing message or as a standalone thread in a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                name: { type: "string", description: "Thread name." },
                message_id: { type: "string", description: "Optional: message to start the thread from. If omitted, creates a standalone thread." },
                auto_archive_duration: { type: "number", description: "Auto-archive after N minutes of inactivity (60, 1440, 4320, 10080). Default 1440 (24h)." },
            },
            required: ["channel_id", "name"],
        },
    },
    {
        name: "discord_bulk_delete_messages",
        description: "Delete multiple messages at once (2–100, messages must be less than 14 days old).",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                count: { type: "number", description: "Number of recent messages to delete (2–100)." },
            },
            required: ["channel_id", "count"],
        },
    },
    {
        name: "discord_send_embed",
        description: "Send a rich embed message with title, description, color, fields, footer, image, thumbnail, author, URL, and timestamp.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                title: { type: "string" },
                url: { type: "string", description: "URL that makes the title clickable." },
                description: { type: "string" },
                color: { type: "string", description: "Hex color e.g. #5865F2" },
                fields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            value: { type: "string" },
                            inline: { type: "boolean" },
                        },
                        required: ["name", "value"],
                    },
                },
                author: {
                    type: "object",
                    description: "Author block shown at the top of the embed.",
                    properties: {
                        name: { type: "string" },
                        icon_url: { type: "string" },
                        url: { type: "string" },
                    },
                    required: ["name"],
                },
                thumbnail_url: { type: "string", description: "Small image shown in the top-right corner." },
                footer: { type: "string" },
                image_url: { type: "string" },
                timestamp: { type: "boolean", description: "If true, adds the current timestamp to the embed." },
            },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_edit_embed",
        description: "Edit an embed message previously sent by the bot. Only provided fields are updated; omitted fields are removed.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string", description: "The message ID to edit (must be a bot message with an embed)." },
                title: { type: "string" },
                url: { type: "string", description: "URL that makes the title clickable." },
                description: { type: "string" },
                color: { type: "string", description: "Hex color e.g. #5865F2" },
                fields: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            name: { type: "string" },
                            value: { type: "string" },
                            inline: { type: "boolean" },
                        },
                        required: ["name", "value"],
                    },
                },
                author: {
                    type: "object",
                    properties: {
                        name: { type: "string" },
                        icon_url: { type: "string" },
                        url: { type: "string" },
                    },
                    required: ["name"],
                },
                thumbnail_url: { type: "string" },
                footer: { type: "string" },
                image_url: { type: "string" },
                timestamp: { type: "boolean", description: "If true, adds the current timestamp to the embed." },
            },
            required: ["channel_id", "message_id"],
        },
    },
    {
        name: "discord_send_multiple_embeds",
        description: "Send up to 10 embeds in a single message.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                content: { type: "string", description: "Optional text content above the embeds." },
                embeds: {
                    type: "array",
                    description: "Array of embed objects (max 10).",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            url: { type: "string" },
                            description: { type: "string" },
                            color: { type: "string", description: "Hex color e.g. #5865F2" },
                            fields: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        name: { type: "string" },
                                        value: { type: "string" },
                                        inline: { type: "boolean" },
                                    },
                                    required: ["name", "value"],
                                },
                            },
                            author: {
                                type: "object",
                                properties: {
                                    name: { type: "string" },
                                    icon_url: { type: "string" },
                                    url: { type: "string" },
                                },
                                required: ["name"],
                            },
                            thumbnail_url: { type: "string" },
                            footer: { type: "string" },
                            image_url: { type: "string" },
                            timestamp: { type: "boolean" },
                        },
                    },
                },
            },
            required: ["channel_id", "embeds"],
        },
    },
    {
        name: "discord_delete_message",
        description: "Delete a specific message from a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string" },
                reason: { type: "string" },
            },
            required: ["channel_id", "message_id"],
        },
    },
    {
        name: "discord_pin_message",
        description: "Pin or unpin a message in a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string" },
                pin: { type: "boolean", description: "true to pin, false to unpin." },
            },
            required: ["channel_id", "message_id", "pin"],
        },
    },
    {
        name: "discord_search_messages",
        description: "Search messages in a channel by keyword (scans up to last 100 messages).",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                keyword: { type: "string" },
                limit: { type: "number", description: "Max messages to scan (default 100)." },
            },
            required: ["channel_id", "keyword"],
        },
    },
    {
        name: "discord_crosspost_message",
        description: "Publish a message in an announcement channel to all following channels.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string" },
            },
            required: ["channel_id", "message_id"],
        },
    },
    {
        name: "discord_remove_reactions",
        description: "Remove reactions from a message. No emoji = remove all. Emoji only = remove that emoji. Emoji + user_id = remove that user's reaction.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string" },
                emoji: { type: "string", description: "Unicode emoji or custom emoji 'name:id'. Omit to remove all reactions." },
                user_id: { type: "string", description: "Remove only this user's reaction for the given emoji." },
            },
            required: ["channel_id", "message_id"],
        },
    },
    {
        name: "discord_get_reactions",
        description: "List users who reacted with a specific emoji on a message.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string" },
                emoji: { type: "string", description: "Unicode emoji or custom emoji 'name:id'." },
                limit: { type: "number", description: "1–100, default 25." },
            },
            required: ["channel_id", "message_id", "emoji"],
        },
    },
    {
        name: "discord_fetch_pinned_messages",
        description: "List all pinned messages in a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
            },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_forward_message",
        description: "Forward a message to another channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                message_id: { type: "string" },
                target_channel_id: { type: "string" },
            },
            required: ["channel_id", "message_id", "target_channel_id"],
        },
    },
];
/** Builds an EmbedBuilder from a flat args object. */
function buildEmbed(args) {
    const embed = new discord_js_1.EmbedBuilder();
    if (args.title)
        embed.setTitle(args.title);
    if (args.url)
        embed.setURL(args.url);
    if (args.description)
        embed.setDescription(args.description);
    if (args.color)
        embed.setColor(args.color);
    if (args.footer)
        embed.setFooter({ text: args.footer });
    if (args.image_url)
        embed.setImage(args.image_url);
    if (args.thumbnail_url)
        embed.setThumbnail(args.thumbnail_url);
    if (args.timestamp)
        embed.setTimestamp();
    if (args.author) {
        const a = args.author;
        embed.setAuthor({ name: a.name, iconURL: a.icon_url, url: a.url });
    }
    if (args.fields) {
        const fields = args.fields;
        embed.addFields(fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
    }
    return embed;
}
/**
 * Handles all message-related tools: read, send, reply, edit, react,
 * thread, bulk delete, embed, delete, pin/unpin, and keyword search.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_read_messages": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const limit = Math.min(Number(args.limit ?? constants_js_1.DEFAULTS.MESSAGES), constants_js_1.MAX_FETCH_LIMIT);
            const messages = await channel.messages.fetch({ limit });
            const result = [...messages.values()]
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .map((m) => ({
                id: m.id, author: m.author.tag, content: m.content,
                timestamp: m.createdAt.toISOString(), attachments: m.attachments.size, pinned: m.pinned,
            }));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        case "discord_send_message": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const sent = await channel.send(args.content);
            return { content: [{ type: "text", text: `✅ Message sent (id: ${sent.id}) in #${channel.name}.` }] };
        }
        case "discord_reply_message": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const target = await channel.messages.fetch(args.message_id);
            const sent = await target.reply(args.content);
            return { content: [{ type: "text", text: `✅ Reply sent (id: ${sent.id}) to message ${args.message_id} in #${channel.name}.` }] };
        }
        case "discord_edit_message": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            if (msg.author.id !== client_js_1.discord.user?.id)
                throw new Error("Can only edit messages sent by the bot.");
            const edited = await msg.edit(args.content);
            return { content: [{ type: "text", text: `✅ Message ${edited.id} edited in #${channel.name}.` }] };
        }
        case "discord_add_reaction": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            await msg.react(args.emoji);
            return { content: [{ type: "text", text: `✅ Reacted with ${args.emoji} to message ${msg.id} in #${channel.name}.` }] };
        }
        case "discord_create_thread": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const duration = args.auto_archive_duration ?? 1440;
            if (args.message_id) {
                const msg = await channel.messages.fetch(args.message_id);
                const thread = await msg.startThread({
                    name: args.name,
                    autoArchiveDuration: duration,
                });
                return { content: [{ type: "text", text: `✅ Thread "${thread.name}" created from message (id: ${thread.id}).` }] };
            }
            else {
                const thread = await channel.threads.create({
                    name: args.name,
                    autoArchiveDuration: duration,
                    type: discord_js_1.ChannelType.PublicThread,
                });
                return { content: [{ type: "text", text: `✅ Thread "${thread.name}" created (id: ${thread.id}).` }] };
            }
        }
        case "discord_bulk_delete_messages": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const count = Math.min(Math.max(Number(args.count ?? 2), 2), 100);
            const deleted = await channel.bulkDelete(count, true);
            return { content: [{ type: "text", text: `✅ Deleted ${deleted.size} messages in #${channel.name}.` }] };
        }
        case "discord_send_embed": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const embed = buildEmbed(args);
            const sent = await channel.send({ embeds: [embed] });
            return { content: [{ type: "text", text: `✅ Embed sent (id: ${sent.id}) in #${channel.name}.` }] };
        }
        case "discord_edit_embed": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            if (msg.author.id !== client_js_1.discord.user?.id)
                throw new Error("Can only edit embeds sent by the bot.");
            const embed = buildEmbed(args);
            await msg.edit({ embeds: [embed] });
            return { content: [{ type: "text", text: `✅ Embed edited on message ${args.message_id} in #${channel.name}.` }] };
        }
        case "discord_send_multiple_embeds": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const embedArgs = args.embeds;
            if (embedArgs.length > 10)
                throw new Error("Discord allows a maximum of 10 embeds per message.");
            const embeds = embedArgs.map((e) => buildEmbed(e));
            const sent = await channel.send({
                content: args.content || undefined,
                embeds,
            });
            return { content: [{ type: "text", text: `✅ ${embeds.length} embeds sent (id: ${sent.id}) in #${channel.name}.` }] };
        }
        case "discord_delete_message": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            await msg.delete();
            return { content: [{ type: "text", text: `✅ Message ${args.message_id} deleted.` }] };
        }
        case "discord_pin_message": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            if (args.pin) {
                await msg.pin();
            }
            else {
                await msg.unpin();
            }
            return { content: [{ type: "text", text: `✅ Message ${args.pin ? "pinned" : "unpinned"}.` }] };
        }
        case "discord_search_messages": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const limit = Math.min(Math.max(Number(args.limit ?? constants_js_1.MAX_FETCH_LIMIT), 1), constants_js_1.MAX_FETCH_LIMIT);
            const messages = await channel.messages.fetch({ limit });
            const keyword = args.keyword.toLowerCase();
            const matches = [...messages.values()]
                .filter((m) => m.content.toLowerCase().includes(keyword))
                .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
                .map((m) => ({ id: m.id, author: m.author.tag, content: m.content, timestamp: m.createdAt.toISOString() }));
            return { content: [{ type: "text", text: matches.length > 0 ? JSON.stringify(matches, null, 2) : `No messages found containing "${args.keyword}" in the last ${limit} messages.` }] };
        }
        case "discord_crosspost_message": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            await msg.crosspost();
            return { content: [{ type: "text", text: `✅ Message ${msg.id} published to all followers of #${channel.name}.` }] };
        }
        case "discord_remove_reactions": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            if (!args.emoji) {
                await msg.reactions.removeAll();
                return { content: [{ type: "text", text: `✅ All reactions removed from message ${msg.id}.` }] };
            }
            const reaction = msg.reactions.cache.get(args.emoji);
            if (!reaction)
                throw new Error(`No reaction found for emoji "${args.emoji}" on message ${msg.id}.`);
            if (args.user_id) {
                await reaction.users.remove(args.user_id);
                return { content: [{ type: "text", text: `✅ Removed ${args.emoji} reaction from user ${args.user_id} on message ${msg.id}.` }] };
            }
            await reaction.remove();
            return { content: [{ type: "text", text: `✅ All ${args.emoji} reactions removed from message ${msg.id}.` }] };
        }
        case "discord_get_reactions": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            const reaction = msg.reactions.cache.get(args.emoji);
            if (!reaction)
                throw new Error(`No reaction found for emoji "${args.emoji}" on message ${msg.id}.`);
            const limit = Math.min(Number(args.limit ?? constants_js_1.DEFAULTS.LIMIT), constants_js_1.MAX_FETCH_LIMIT);
            const users = await reaction.users.fetch({ limit });
            const result = [...users.values()].map((u) => ({ id: u.id, username: u.username, bot: u.bot }));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        case "discord_fetch_pinned_messages": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const pinned = await channel.messages.fetchPinned();
            const result = [...pinned.values()].map((m) => ({
                id: m.id, author: m.author.tag, content: m.content, timestamp: m.createdAt.toISOString(),
            }));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        case "discord_forward_message": {
            const channel = await (0, client_js_1.getTextChannel)(args.channel_id);
            const msg = await channel.messages.fetch(args.message_id);
            const targetChannel = await (0, client_js_1.getTextChannel)(args.target_channel_id);
            await msg.forward(targetChannel);
            return { content: [{ type: "text", text: `✅ Message ${msg.id} forwarded to #${targetChannel.name}.` }] };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=messages.js.map