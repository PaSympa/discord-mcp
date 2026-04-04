"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
/** Tool definitions for creating, sending via, editing, deleting, and listing webhooks. */
exports.definitions = [
    {
        name: "discord_create_webhook",
        description: "Create a webhook on a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                name: { type: "string", description: "Name for the webhook." },
                avatar: { type: "string", description: "Optional avatar URL for the webhook." },
            },
            required: ["channel_id", "name"],
        },
    },
    {
        name: "discord_send_webhook_message",
        description: "Send a message via a webhook using its ID and token.",
        inputSchema: {
            type: "object",
            properties: {
                webhook_id: { type: "string" },
                webhook_token: { type: "string" },
                content: { type: "string", description: "Text content of the message." },
                username: { type: "string", description: "Override the webhook's default username." },
                avatar_url: { type: "string", description: "Override the webhook's default avatar." },
                embeds: {
                    type: "array",
                    description: "Optional array of embed objects.",
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
                            footer: { type: "string" },
                            image_url: { type: "string" },
                            thumbnail_url: { type: "string" },
                            timestamp: { type: "boolean" },
                        },
                    },
                },
            },
            required: ["webhook_id", "webhook_token"],
        },
    },
    {
        name: "discord_edit_webhook",
        description: "Edit a webhook's name, avatar, or channel.",
        inputSchema: {
            type: "object",
            properties: {
                webhook_id: { type: "string" },
                name: { type: "string", description: "New name for the webhook." },
                avatar: { type: "string", description: "New avatar URL for the webhook." },
                channel_id: { type: "string", description: "Move the webhook to a different channel." },
            },
            required: ["webhook_id"],
        },
    },
    {
        name: "discord_delete_webhook",
        description: "Delete a webhook.",
        inputSchema: {
            type: "object",
            properties: {
                webhook_id: { type: "string" },
            },
            required: ["webhook_id"],
        },
    },
    {
        name: "discord_list_webhooks",
        description: "List all webhooks for a channel or guild. Provide either channel_id or guild_id.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string", description: "List webhooks for a specific channel." },
                guild_id: { type: "string", description: "List all webhooks in a guild." },
            },
        },
    },
    {
        name: "discord_edit_webhook_message",
        description: "Edit a message previously sent by a webhook.",
        inputSchema: {
            type: "object",
            properties: {
                webhook_id: { type: "string" },
                webhook_token: { type: "string" },
                message_id: { type: "string" },
                content: { type: "string" },
                embeds: {
                    type: "array",
                    description: "Optional array of embed objects.",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" }, url: { type: "string" }, description: { type: "string" },
                            color: { type: "string", description: "Hex color e.g. #5865F2" },
                            fields: { type: "array", items: { type: "object", properties: { name: { type: "string" }, value: { type: "string" }, inline: { type: "boolean" } }, required: ["name", "value"] } },
                            footer: { type: "string" }, image_url: { type: "string" }, thumbnail_url: { type: "string" }, timestamp: { type: "boolean" },
                        },
                    },
                },
            },
            required: ["webhook_id", "webhook_token", "message_id"],
        },
    },
    {
        name: "discord_delete_webhook_message",
        description: "Delete a message sent by a webhook.",
        inputSchema: {
            type: "object",
            properties: {
                webhook_id: { type: "string" },
                webhook_token: { type: "string" },
                message_id: { type: "string" },
            },
            required: ["webhook_id", "webhook_token", "message_id"],
        },
    },
    {
        name: "discord_fetch_webhook_message",
        description: "Fetch a specific message sent by a webhook.",
        inputSchema: {
            type: "object",
            properties: {
                webhook_id: { type: "string" },
                webhook_token: { type: "string" },
                message_id: { type: "string" },
            },
            required: ["webhook_id", "webhook_token", "message_id"],
        },
    },
];
/** Builds an EmbedBuilder from a webhook embed arg object. */
function buildWebhookEmbed(args) {
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
    if (args.fields) {
        const fields = args.fields;
        embed.addFields(fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
    }
    return embed;
}
/**
 * Handles webhook tools: create, send message via webhook,
 * edit, delete, and list webhooks.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_create_webhook": {
            const channel = await client_js_1.discord.channels.fetch((0, client_js_1.validateId)(args.channel_id, "channel_id"));
            if (!channel || !("createWebhook" in channel))
                throw new Error("Channel does not support webhooks.");
            const webhook = await channel.createWebhook({
                name: args.name,
                avatar: args.avatar ?? undefined,
            });
            return {
                content: [{
                        type: "text",
                        text: `✅ Webhook "${webhook.name}" created (id: ${webhook.id}, token: ${webhook.token}).`,
                    }],
            };
        }
        case "discord_send_webhook_message": {
            const webhookId = (0, client_js_1.validateId)(args.webhook_id, "webhook_id");
            const token = args.webhook_token;
            if (!token)
                throw new Error("webhook_token is required.");
            const client = new discord_js_1.WebhookClient({ id: webhookId, token });
            try {
                const sendOptions = {};
                if (args.content)
                    sendOptions.content = args.content;
                if (args.username)
                    sendOptions.username = args.username;
                if (args.avatar_url)
                    sendOptions.avatarURL = args.avatar_url;
                if (args.embeds) {
                    const embedArgs = args.embeds;
                    if (embedArgs.length > 10)
                        throw new Error("Discord allows a maximum of 10 embeds per message.");
                    sendOptions.embeds = embedArgs.map((e) => buildWebhookEmbed(e));
                }
                if (!sendOptions.content && !sendOptions.embeds) {
                    throw new Error("At least one of content or embeds is required.");
                }
                const sent = await client.send(sendOptions);
                return { content: [{ type: "text", text: `✅ Webhook message sent (id: ${sent.id}).` }] };
            }
            finally {
                client.destroy();
            }
        }
        case "discord_edit_webhook": {
            const webhookId = (0, client_js_1.validateId)(args.webhook_id, "webhook_id");
            const webhook = await client_js_1.discord.fetchWebhook(webhookId);
            const editOptions = {};
            if (args.name !== undefined)
                editOptions.name = args.name;
            if (args.avatar !== undefined)
                editOptions.avatar = args.avatar;
            if (args.channel_id !== undefined)
                editOptions.channel = (0, client_js_1.validateId)(args.channel_id, "channel_id");
            await webhook.edit(editOptions);
            return { content: [{ type: "text", text: `✅ Webhook "${webhook.name}" (id: ${webhook.id}) updated.` }] };
        }
        case "discord_delete_webhook": {
            const webhookId = (0, client_js_1.validateId)(args.webhook_id, "webhook_id");
            const webhook = await client_js_1.discord.fetchWebhook(webhookId);
            const webhookName = webhook.name;
            await webhook.delete();
            return { content: [{ type: "text", text: `✅ Webhook "${webhookName}" (id: ${webhookId}) deleted.` }] };
        }
        case "discord_list_webhooks": {
            if (args.channel_id) {
                const channel = await client_js_1.discord.channels.fetch((0, client_js_1.validateId)(args.channel_id, "channel_id"));
                if (!channel || !("fetchWebhooks" in channel))
                    throw new Error("Channel does not support webhooks.");
                const webhooks = await channel.fetchWebhooks();
                const result = [...webhooks.values()].map((w) => ({
                    id: w.id,
                    name: w.name,
                    channel_id: w.channelId,
                    token: w.token ?? null,
                    creator: w.owner?.tag ?? null,
                }));
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            else if (args.guild_id) {
                const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
                const webhooks = await guild.fetchWebhooks();
                const result = [...webhooks.values()].map((w) => ({
                    id: w.id,
                    name: w.name,
                    channel_id: w.channelId,
                    token: w.token ?? null,
                    creator: w.owner && "tag" in w.owner ? w.owner.tag : (w.owner?.username ?? null),
                }));
                return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
            }
            else {
                throw new Error("Either channel_id or guild_id is required.");
            }
        }
        case "discord_edit_webhook_message": {
            const webhookId = (0, client_js_1.validateId)(args.webhook_id, "webhook_id");
            const token = args.webhook_token;
            if (!token)
                throw new Error("webhook_token is required.");
            const client = new discord_js_1.WebhookClient({ id: webhookId, token });
            try {
                const editOptions = {};
                if (args.content !== undefined)
                    editOptions.content = args.content;
                if (args.embeds) {
                    const embedArgs = args.embeds;
                    editOptions.embeds = embedArgs.map((e) => buildWebhookEmbed(e));
                }
                await client.editMessage(args.message_id, editOptions);
                return { content: [{ type: "text", text: `✅ Webhook message ${args.message_id} edited.` }] };
            }
            finally {
                client.destroy();
            }
        }
        case "discord_delete_webhook_message": {
            const webhookId = (0, client_js_1.validateId)(args.webhook_id, "webhook_id");
            const token = args.webhook_token;
            if (!token)
                throw new Error("webhook_token is required.");
            const client = new discord_js_1.WebhookClient({ id: webhookId, token });
            try {
                await client.deleteMessage(args.message_id);
                return { content: [{ type: "text", text: `✅ Webhook message ${args.message_id} deleted.` }] };
            }
            finally {
                client.destroy();
            }
        }
        case "discord_fetch_webhook_message": {
            const webhookId = (0, client_js_1.validateId)(args.webhook_id, "webhook_id");
            const token = args.webhook_token;
            if (!token)
                throw new Error("webhook_token is required.");
            const client = new discord_js_1.WebhookClient({ id: webhookId, token });
            try {
                const msg = await client.fetchMessage(args.message_id);
                return { content: [{ type: "text", text: JSON.stringify({
                                id: msg.id, content: msg.content, embeds: msg.embeds.length,
                                timestamp: msg.timestamp,
                            }, null, 2) }] };
            }
            finally {
                client.destroy();
            }
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=webhooks.js.map