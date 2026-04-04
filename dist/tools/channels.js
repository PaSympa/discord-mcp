"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
/** Tool definitions for creating, deleting, editing, moving, and cloning channels. */
exports.definitions = [
    {
        name: "discord_create_channel",
        description: "Create a text, voice channel or category in a guild.",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                name: { type: "string" },
                type: { type: "string", enum: ["text", "voice", "category"], description: "Defaults to 'text'." },
                topic: { type: "string" },
                category_id: { type: "string" },
            },
            required: ["guild_id", "name"],
        },
    },
    {
        name: "discord_delete_channel",
        description: "Delete a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                reason: { type: "string" },
            },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_edit_channel",
        description: "Edit a channel's name, topic, slowmode, or NSFW flag.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                name: { type: "string" },
                topic: { type: "string" },
                slowmode: { type: "number", description: "Slowmode in seconds (0 to disable)." },
                nsfw: { type: "boolean", description: "Mark channel as NSFW." },
            },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_move_channel",
        description: "Move a channel into a category (or remove from category if category_id is omitted).",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                category_id: { type: "string" },
            },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_clone_channel",
        description: "Clone a channel with its name, topic and permission overwrites.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                new_name: { type: "string" },
            },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_set_channel_position",
        description: "Set the display position of a channel within its category.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                position: { type: "number" },
            },
            required: ["channel_id", "position"],
        },
    },
    {
        name: "discord_follow_announcement_channel",
        description: "Follow an announcement channel so its messages are published to a target channel.",
        inputSchema: {
            type: "object",
            properties: {
                source_channel_id: { type: "string", description: "The announcement channel to follow." },
                target_channel_id: { type: "string", description: "The channel that will receive published messages." },
            },
            required: ["source_channel_id", "target_channel_id"],
        },
    },
    {
        name: "discord_lock_channel_permissions",
        description: "Sync a channel's permissions with its parent category.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
            },
            required: ["channel_id"],
        },
    },
];
/**
 * Handles channel management tools: create (text/voice/category),
 * delete, edit (name/topic/slowmode), move between categories, and clone.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_create_channel": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const typeMap = {
                text: discord_js_1.ChannelType.GuildText, voice: discord_js_1.ChannelType.GuildVoice, category: discord_js_1.ChannelType.GuildCategory,
            };
            const channelType = typeMap[args.type ?? "text"] ?? discord_js_1.ChannelType.GuildText;
            const created = await guild.channels.create({
                name: args.name, type: channelType,
                topic: channelType === discord_js_1.ChannelType.GuildText ? args.topic : undefined,
                parent: args.category_id,
            });
            return { content: [{ type: "text", text: `✅ Channel #${created.name} created (id: ${created.id}).` }] };
        }
        case "discord_delete_channel": {
            const channel = await client_js_1.discord.channels.fetch(args.channel_id);
            if (!channel)
                throw new Error("Channel not found.");
            const channelName = "name" in channel ? channel.name : channel.id;
            await channel.delete(args.reason);
            return { content: [{ type: "text", text: `✅ Channel #${channelName} deleted.` }] };
        }
        case "discord_edit_channel": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            const editOptions = {};
            if (args.name !== undefined)
                editOptions.name = args.name;
            if (args.topic !== undefined && channel.type === discord_js_1.ChannelType.GuildText)
                editOptions.topic = args.topic;
            if (args.slowmode !== undefined && channel.type === discord_js_1.ChannelType.GuildText)
                editOptions.rateLimitPerUser = args.slowmode;
            if (args.nsfw !== undefined)
                editOptions.nsfw = args.nsfw;
            await channel.edit(editOptions);
            return { content: [{ type: "text", text: `✅ Channel #${channel.name} updated.` }] };
        }
        case "discord_move_channel": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            await channel.edit({ parent: args.category_id ?? null });
            return { content: [{ type: "text", text: `✅ Channel #${channel.name} moved.` }] };
        }
        case "discord_clone_channel": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            const cloned = await channel.clone({ name: args.new_name });
            return { content: [{ type: "text", text: `✅ Channel cloned as #${cloned.name} (id: ${cloned.id}).` }] };
        }
        case "discord_set_channel_position": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            await channel.setPosition(args.position);
            return { content: [{ type: "text", text: `✅ Channel #${channel.name} moved to position ${args.position}.` }] };
        }
        case "discord_follow_announcement_channel": {
            const source = await client_js_1.discord.channels.fetch((0, client_js_1.validateId)(args.source_channel_id, "source_channel_id"));
            if (!source || !(source instanceof discord_js_1.NewsChannel))
                throw new Error("Source channel is not an announcement channel.");
            await source.addFollower((0, client_js_1.validateId)(args.target_channel_id, "target_channel_id"));
            return { content: [{ type: "text", text: `✅ Now following announcement channel in target channel.` }] };
        }
        case "discord_lock_channel_permissions": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            await channel.lockPermissions();
            return { content: [{ type: "text", text: `✅ Channel #${channel.name} permissions synced with parent category.` }] };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=channels.js.map