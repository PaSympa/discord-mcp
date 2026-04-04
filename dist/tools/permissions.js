"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
/** Tool definitions for viewing and managing per-channel permission overwrites. */
exports.definitions = [
    {
        name: "discord_get_channel_permissions",
        description: "List all permission overwrites on a channel (per role and per member).",
        inputSchema: {
            type: "object",
            properties: { channel_id: { type: "string" } },
            required: ["channel_id"],
        },
    },
    {
        name: "discord_set_role_permission",
        description: "Allow or deny specific permissions for a role on a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                role_id: { type: "string" },
                allow: { type: "array", items: { type: "string" }, description: "e.g. ['SendMessages','ViewChannel']" },
                deny: { type: "array", items: { type: "string" } },
                reason: { type: "string" },
            },
            required: ["channel_id", "role_id"],
        },
    },
    {
        name: "discord_set_member_permission",
        description: "Allow or deny specific permissions for a single member on a channel.",
        inputSchema: {
            type: "object",
            properties: {
                channel_id: { type: "string" },
                user_id: { type: "string" },
                allow: { type: "array", items: { type: "string" } },
                deny: { type: "array", items: { type: "string" } },
                reason: { type: "string" },
            },
            required: ["channel_id", "user_id"],
        },
    },
    {
        name: "discord_reset_channel_permissions",
        description: "Remove ALL permission overwrites on a channel (reset to inherited).",
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
        name: "discord_copy_permissions",
        description: "Copy all permission overwrites from one channel to another.",
        inputSchema: {
            type: "object",
            properties: {
                source_channel_id: { type: "string" },
                target_channel_id: { type: "string" },
                reason: { type: "string" },
            },
            required: ["source_channel_id", "target_channel_id"],
        },
    },
    {
        name: "discord_audit_permissions",
        description: "Generate a full permission audit report for a guild: who can access what on every channel.",
        inputSchema: {
            type: "object",
            properties: { guild_id: { type: "string" } },
            required: ["guild_id"],
        },
    },
];
/**
 * Parses a permission array from tool arguments.
 * Accepts an array directly or a JSON-encoded string.
 */
function parsePermArray(value) {
    if (Array.isArray(value))
        return value;
    if (typeof value === "string")
        return JSON.parse(value);
    return [];
}
/**
 * Handles permission tools: view overwrites, set per-role/per-member permissions,
 * reset to inherited, copy between channels, and full guild audit.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_get_channel_permissions": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            const overwrites = channel.permissionOverwrites.cache.map((ow) => ({
                id: ow.id,
                type: ow.type === 0 ? "role" : "member",
                allow: (0, client_js_1.serializePermissions)(ow.allow),
                deny: (0, client_js_1.serializePermissions)(ow.deny),
            }));
            return { content: [{ type: "text", text: JSON.stringify(overwrites, null, 2) }] };
        }
        case "discord_set_role_permission": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            const options = {};
            parsePermArray(args.allow).forEach((p) => { options[p] = true; });
            parsePermArray(args.deny).forEach((p) => { options[p] = false; });
            await channel.permissionOverwrites.edit(args.role_id, options, { reason: args.reason });
            return { content: [{ type: "text", text: `✅ Permissions updated for role ${args.role_id} on #${channel.name}.` }] };
        }
        case "discord_set_member_permission": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            const options = {};
            parsePermArray(args.allow).forEach((p) => { options[p] = true; });
            parsePermArray(args.deny).forEach((p) => { options[p] = false; });
            await channel.permissionOverwrites.edit(args.user_id, options, { reason: args.reason });
            return { content: [{ type: "text", text: `✅ Permissions updated for member ${args.user_id} on #${channel.name}.` }] };
        }
        case "discord_reset_channel_permissions": {
            const channel = await (0, client_js_1.getGuildChannel)(args.channel_id);
            await channel.permissionOverwrites.set([], args.reason);
            return { content: [{ type: "text", text: `✅ All permission overwrites cleared on #${channel.name}.` }] };
        }
        case "discord_copy_permissions": {
            const source = await (0, client_js_1.getGuildChannel)(args.source_channel_id);
            const target = await (0, client_js_1.getGuildChannel)(args.target_channel_id);
            const overwrites = source.permissionOverwrites.cache.map((ow) => ({
                id: ow.id, type: ow.type, allow: ow.allow, deny: ow.deny,
            }));
            await target.permissionOverwrites.set(overwrites, args.reason);
            return { content: [{ type: "text", text: `✅ Permissions copied from #${source.name} to #${target.name}.` }] };
        }
        case "discord_audit_permissions": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            await guild.channels.fetch();
            await guild.roles.fetch();
            const memberIdsNeeded = new Set();
            guild.channels.cache.forEach((ch) => {
                if (ch instanceof discord_js_1.GuildChannel) {
                    ch.permissionOverwrites.cache.forEach((ow) => {
                        if (ow.type === 1)
                            memberIdsNeeded.add(ow.id);
                    });
                }
            });
            await Promise.all([...memberIdsNeeded].map((id) => guild.members.fetch(id).catch(() => null)));
            const report = [];
            guild.channels.cache
                .filter((c) => c instanceof discord_js_1.GuildChannel)
                .forEach((ch) => {
                const gch = ch;
                const overwrites = gch.permissionOverwrites.cache.map((ow) => {
                    const isRole = ow.type === 0;
                    const entity = isRole
                        ? guild.roles.cache.get(ow.id)?.name ?? ow.id
                        : guild.members.cache.get(ow.id)?.user.tag ?? ow.id;
                    return { entity, type: isRole ? "role" : "member", allow: (0, client_js_1.serializePermissions)(ow.allow), deny: (0, client_js_1.serializePermissions)(ow.deny) };
                });
                if (overwrites.length > 0)
                    report.push({ channel: gch.name, channelId: gch.id, overwrites });
            });
            return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=permissions.js.map