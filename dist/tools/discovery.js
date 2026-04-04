"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
/** Tool definitions for server/guild discovery and channel navigation. */
exports.definitions = [
    {
        name: "discord_list_guilds",
        description: "List all Discord servers the bot is connected to.",
        inputSchema: { type: "object", properties: {} },
    },
    {
        name: "discord_get_guild_info",
        description: "Get detailed info about a guild: name, member count, channels, roles, boosts.",
        inputSchema: {
            type: "object",
            properties: { guild_id: { type: "string" } },
            required: ["guild_id"],
        },
    },
    {
        name: "discord_list_channels",
        description: "List all channels in a guild grouped by category.",
        inputSchema: {
            type: "object",
            properties: { guild_id: { type: "string" } },
            required: ["guild_id"],
        },
    },
    {
        name: "discord_find_channel_by_name",
        description: "Find a channel by name in a guild (partial match supported).",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                name: { type: "string" },
            },
            required: ["guild_id", "name"],
        },
    },
];
/**
 * Handles discovery tools: listing guilds, fetching guild info,
 * listing channels by category, and searching channels by name.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_list_guilds": {
            const guilds = client_js_1.discord.guilds.cache.map((g) => ({
                id: g.id, name: g.name, memberCount: g.memberCount, icon: g.iconURL(),
            }));
            return { content: [{ type: "text", text: JSON.stringify(guilds, null, 2) }] };
        }
        case "discord_get_guild_info": {
            const guild = await (await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"))).fetch();
            return {
                content: [{
                        type: "text", text: JSON.stringify({
                            id: guild.id, name: guild.name, description: guild.description,
                            memberCount: guild.memberCount, channelCount: guild.channels.cache.size,
                            roleCount: guild.roles.cache.size, boostLevel: guild.premiumTier,
                            boostCount: guild.premiumSubscriptionCount, createdAt: guild.createdAt, owner: guild.ownerId,
                        }, null, 2),
                    }],
            };
        }
        case "discord_list_channels": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            await guild.channels.fetch();
            const categories = guild.channels.cache
                .filter((c) => c.type === discord_js_1.ChannelType.GuildCategory)
                .sort((a, b) => a.position - b.position);
            const result = { "No Category": [] };
            categories.forEach((cat) => { result[cat.name] = []; });
            guild.channels.cache
                .filter((c) => c.type !== discord_js_1.ChannelType.GuildCategory)
                .sort((a, b) => a.position - b.position)
                .forEach((ch) => {
                const entry = { id: ch.id, name: ch.name, type: discord_js_1.ChannelType[ch.type] };
                const parentName = ch.parent?.name ?? "No Category";
                if (!result[parentName])
                    result[parentName] = [];
                result[parentName].push(entry);
            });
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        case "discord_find_channel_by_name": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            await guild.channels.fetch();
            const keyword = args.name.toLowerCase();
            const matches = guild.channels.cache
                .filter((c) => c.name.toLowerCase().includes(keyword))
                .map((c) => ({ id: c.id, name: c.name, type: discord_js_1.ChannelType[c.type] }));
            return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=discovery.js.map