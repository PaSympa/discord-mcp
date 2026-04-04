"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
/** Tool definitions for server statistics (members, channels, boosts). */
exports.definitions = [
    {
        name: "discord_get_server_stats",
        description: "Get server statistics: member count (humans vs bots), channels, roles, boost level.",
        inputSchema: {
            type: "object",
            properties: { guild_id: { type: "string" } },
            required: ["guild_id"],
        },
    },
];
/**
 * Handles stats tools: returns a snapshot of server metrics
 * including member counts, channel breakdown, and boost info.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_get_server_stats": {
            const guild = await (await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"))).fetch();
            await guild.channels.fetch();
            const cachedBots = guild.members.cache.filter((m) => m.user.bot).size;
            return {
                content: [{
                        type: "text", text: JSON.stringify({
                            name: guild.name, totalMembers: guild.memberCount,
                            humans: guild.memberCount - cachedBots, botsInCache: cachedBots,
                            channels: {
                                total: guild.channels.cache.size,
                                text: guild.channels.cache.filter((c) => c.type === discord_js_1.ChannelType.GuildText).size,
                                voice: guild.channels.cache.filter((c) => c.type === discord_js_1.ChannelType.GuildVoice).size,
                                categories: guild.channels.cache.filter((c) => c.type === discord_js_1.ChannelType.GuildCategory).size,
                            },
                            roles: guild.roles.cache.size - 1,
                            boostLevel: guild.premiumTier, boostCount: guild.premiumSubscriptionCount ?? 0,
                            createdAt: guild.createdAt.toISOString(),
                        }, null, 2),
                    }],
            };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=stats.js.map