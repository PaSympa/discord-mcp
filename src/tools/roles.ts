import { PermissionsBitField, ColorResolvable, Role } from "discord.js";
import { discord, serializePermissions, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for creating, editing, deleting, and assigning roles. */
export const definitions = [
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
];

/**
 * Parses a permission array from tool arguments.
 * Accepts an array, a JSON string, or returns undefined if absent.
 */
function parsePerms(raw: unknown): string[] | undefined {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") return JSON.parse(raw);
  return undefined;
}

/**
 * Handles role tools: list all roles, CRUD operations,
 * assign/remove from members, and list members by role.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_list_roles": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const roles = await guild.roles.fetch();
      const result = [...roles.values()]
        .filter((r) => r.name !== "@everyone")
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id, name: r.name, color: r.hexColor, position: r.position,
          memberCount: r.members.size, permissions: serializePermissions(r.permissions),
          hoist: r.hoist, mentionable: r.mentionable,
        }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_create_role": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const perms = parsePerms(args.permissions);
      const role = await guild.roles.create({
        name: args.name as string,
        color: args.color as ColorResolvable | undefined,
        hoist: args.hoist as boolean | undefined,
        mentionable: args.mentionable as boolean | undefined,
        permissions: perms
          ? new PermissionsBitField(perms.map((p) => PermissionsBitField.Flags[p as keyof typeof PermissionsBitField.Flags]))
          : undefined,
      });
      return { content: [{ type: "text", text: `✅ Role "${role.name}" created (id: ${role.id}).` }] };
    }

    case "discord_edit_role": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const role = await guild.roles.fetch(args.role_id as string) as Role;
      const perms = parsePerms(args.permissions);
      await role.edit({
        name: args.name as string | undefined,
        color: args.color as ColorResolvable | undefined,
        hoist: args.hoist as boolean | undefined,
        mentionable: args.mentionable as boolean | undefined,
        permissions: perms
          ? new PermissionsBitField(perms.map((p) => PermissionsBitField.Flags[p as keyof typeof PermissionsBitField.Flags]))
          : undefined,
      });
      return { content: [{ type: "text", text: `✅ Role "${role.name}" updated.` }] };
    }

    case "discord_delete_role": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const role = await guild.roles.fetch(args.role_id as string) as Role;
      await role.delete(args.reason as string | undefined);
      return { content: [{ type: "text", text: `✅ Role "${role.name}" deleted.` }] };
    }

    case "discord_add_role": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const member = await guild.members.fetch(args.user_id as string);
      await member.roles.add(args.role_id as string, args.reason as string | undefined);
      return { content: [{ type: "text", text: `✅ Role added to ${member.user.tag}.` }] };
    }

    case "discord_remove_role": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const member = await guild.members.fetch(args.user_id as string);
      await member.roles.remove(args.role_id as string, args.reason as string | undefined);
      return { content: [{ type: "text", text: `✅ Role removed from ${member.user.tag}.` }] };
    }

    case "discord_get_role_members": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      await guild.members.list({ limit: 1000 });
      const role = await guild.roles.fetch(args.role_id as string) as Role;
      const members = role.members.map((m) => ({ id: m.id, username: m.user.tag, nickname: m.nickname }));
      return { content: [{ type: "text", text: JSON.stringify(members, null, 2) }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
