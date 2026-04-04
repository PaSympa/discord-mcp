"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.definitions = void 0;
exports.handle = handle;
const discord_js_1 = require("discord.js");
const client_js_1 = require("../client.js");
/** Tool definitions for creating, editing, deleting, and assigning roles. */
exports.definitions = [
    {
        name: "discord_list_roles",
        description: "List all roles in a guild with permissions and member count.",
        inputSchema: {
            type: "object",
            properties: { guild_id: { type: "string" } },
            required: ["guild_id"],
        },
    },
    {
        name: "discord_create_role",
        description: "Create a new role in a guild.",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                name: { type: "string" },
                color: { type: "string", description: "Hex color e.g. #FF5733" },
                hoist: { type: "boolean" },
                mentionable: { type: "boolean" },
                permissions: { type: "array", items: { type: "string" }, description: "e.g. ['SendMessages','ViewChannel']" },
            },
            required: ["guild_id", "name"],
        },
    },
    {
        name: "discord_edit_role",
        description: "Edit an existing role (name, color, permissions, hoist, mentionable).",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                role_id: { type: "string" },
                name: { type: "string" },
                color: { type: "string" },
                hoist: { type: "boolean" },
                mentionable: { type: "boolean" },
                permissions: { type: "array", items: { type: "string" } },
            },
            required: ["guild_id", "role_id"],
        },
    },
    {
        name: "discord_delete_role",
        description: "Delete a role from a guild.",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                role_id: { type: "string" },
                reason: { type: "string" },
            },
            required: ["guild_id", "role_id"],
        },
    },
    {
        name: "discord_add_role",
        description: "Assign a role to a member.",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                user_id: { type: "string" },
                role_id: { type: "string" },
                reason: { type: "string" },
            },
            required: ["guild_id", "user_id", "role_id"],
        },
    },
    {
        name: "discord_remove_role",
        description: "Remove a role from a member.",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                user_id: { type: "string" },
                role_id: { type: "string" },
                reason: { type: "string" },
            },
            required: ["guild_id", "user_id", "role_id"],
        },
    },
    {
        name: "discord_get_role_members",
        description: "List all members that have a specific role.",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                role_id: { type: "string" },
            },
            required: ["guild_id", "role_id"],
        },
    },
    {
        name: "discord_set_role_position",
        description: "Change a role's position in the hierarchy.",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                role_id: { type: "string" },
                position: { type: "number" },
            },
            required: ["guild_id", "role_id", "position"],
        },
    },
    {
        name: "discord_set_role_icon",
        description: "Set a custom icon or unicode emoji on a role (requires server boost level 2+).",
        inputSchema: {
            type: "object",
            properties: {
                guild_id: { type: "string" },
                role_id: { type: "string" },
                icon: { type: "string", description: "Image URL for the role icon. Set to null to remove." },
                unicode_emoji: { type: "string", description: "Unicode emoji for the role. Set to null to remove." },
            },
            required: ["guild_id", "role_id"],
        },
    },
];
/**
 * Parses a permission array from tool arguments.
 * Accepts an array, a JSON string, or returns undefined if absent.
 */
function parsePerms(raw) {
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === "string")
        return JSON.parse(raw);
    return undefined;
}
/**
 * Handles role tools: list all roles, CRUD operations,
 * assign/remove from members, and list members by role.
 */
async function handle(name, args) {
    switch (name) {
        case "discord_list_roles": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const roles = await guild.roles.fetch();
            const result = [...roles.values()]
                .filter((r) => r.name !== "@everyone")
                .sort((a, b) => b.position - a.position)
                .map((r) => ({
                id: r.id, name: r.name, color: r.hexColor, position: r.position,
                memberCount: r.members.size, permissions: (0, client_js_1.serializePermissions)(r.permissions),
                hoist: r.hoist, mentionable: r.mentionable,
            }));
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        }
        case "discord_create_role": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const perms = parsePerms(args.permissions);
            const role = await guild.roles.create({
                name: args.name,
                color: args.color,
                hoist: args.hoist,
                mentionable: args.mentionable,
                permissions: perms
                    ? new discord_js_1.PermissionsBitField(perms.map((p) => discord_js_1.PermissionsBitField.Flags[p]))
                    : undefined,
            });
            return { content: [{ type: "text", text: `✅ Role "${role.name}" created (id: ${role.id}).` }] };
        }
        case "discord_edit_role": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const role = await guild.roles.fetch(args.role_id);
            const perms = parsePerms(args.permissions);
            await role.edit({
                name: args.name,
                color: args.color,
                hoist: args.hoist,
                mentionable: args.mentionable,
                permissions: perms
                    ? new discord_js_1.PermissionsBitField(perms.map((p) => discord_js_1.PermissionsBitField.Flags[p]))
                    : undefined,
            });
            return { content: [{ type: "text", text: `✅ Role "${role.name}" updated.` }] };
        }
        case "discord_delete_role": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const role = await guild.roles.fetch(args.role_id);
            await role.delete(args.reason);
            return { content: [{ type: "text", text: `✅ Role "${role.name}" deleted.` }] };
        }
        case "discord_add_role": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const member = await guild.members.fetch(args.user_id);
            await member.roles.add(args.role_id, args.reason);
            return { content: [{ type: "text", text: `✅ Role added to ${member.user.tag}.` }] };
        }
        case "discord_remove_role": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const member = await guild.members.fetch(args.user_id);
            await member.roles.remove(args.role_id, args.reason);
            return { content: [{ type: "text", text: `✅ Role removed from ${member.user.tag}.` }] };
        }
        case "discord_get_role_members": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            await guild.members.list({ limit: 1000 });
            const role = await guild.roles.fetch(args.role_id);
            const members = role.members.map((m) => ({ id: m.id, username: m.user.tag, nickname: m.nickname }));
            return { content: [{ type: "text", text: JSON.stringify(members, null, 2) }] };
        }
        case "discord_set_role_position": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const role = await guild.roles.fetch(args.role_id);
            await role.setPosition(args.position);
            return { content: [{ type: "text", text: `✅ Role "${role.name}" moved to position ${args.position}.` }] };
        }
        case "discord_set_role_icon": {
            const guild = await client_js_1.discord.guilds.fetch((0, client_js_1.validateId)(args.guild_id, "guild_id"));
            const role = await guild.roles.fetch(args.role_id);
            if (args.icon !== undefined) {
                await role.setIcon(args.icon === "null" || args.icon === null ? null : args.icon);
            }
            if (args.unicode_emoji !== undefined) {
                await role.setUnicodeEmoji(args.unicode_emoji === "null" || args.unicode_emoji === null ? null : args.unicode_emoji);
            }
            return { content: [{ type: "text", text: `✅ Role "${role.name}" icon updated.` }] };
        }
        default:
            return null;
    }
}
exports.default = { definitions: exports.definitions, handle };
//# sourceMappingURL=roles.js.map