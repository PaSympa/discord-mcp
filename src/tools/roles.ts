import { ColorResolvable, Role, Guild } from "discord.js";
import { z } from "zod";
import {
  discord,
  serializePermissions,
  deserializePermissions,
  parsePermissionNames,
} from "../client.js";
import { defineTool, defineModule, snowflake, guildId, structured, httpUrl } from "./define.js";

const roleId = snowflake.describe("ID (snowflake) of the role to edit.");

const roleSummary = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  position: z.number(),
  memberCount: z.number(),
  permissions: z.array(z.string()),
  hoist: z.boolean(),
  mentionable: z.boolean(),
});

const roleMember = z.object({
  id: z.string(),
  username: z.string(),
  nickname: z.string().nullable(),
});

/** Fetches a role by ID, throwing a clear error if it does not exist in the guild. */
async function fetchRole(guild: Guild, rawId: string): Promise<Role> {
  const role = await guild.roles.fetch(rawId);
  if (!role) throw new Error(`Role ${rawId} not found in this server.`);
  return role;
}

/** Tool definitions for creating, editing, deleting, and assigning roles. */
const tools = [
  defineTool({
    name: "discord_list_roles",
    description:
      "List all roles in a server (excluding @everyone), highest-first, with color, position, member count, and permissions. Read-only. Returns { roles: [...] }. Use discord_get_role_members to see who holds a given role.",
    annotations: { title: "List roles", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({ roles: z.array(roleSummary) }),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const roles = await guild.roles.fetch();
      const counts = await guild.roles.fetchMemberCounts();
      const result = [...roles.values()]
        .filter((r) => r.name !== "@everyone")
        .sort((a, b) => b.position - a.position)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.hexColor,
          position: r.position,
          memberCount: counts.get(r.id) ?? 0,
          permissions: serializePermissions(r.permissions),
          hoist: r.hoist,
          mentionable: r.mentionable,
        }));
      return structured({ roles: result });
    },
  }),
  defineTool({
    name: "discord_create_role",
    description:
      "Create a new role in a server. Requires the Manage Roles permission; the new role is placed below the bot's highest role. Use discord_add_role to then assign it to members. Returns the new role's name and ID.",
    annotations: {
      title: "Create role",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      name: z.string().describe("Name of the new role (max 100 characters)."),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, "Hex color like '#FF5733'.")
        .optional()
        .describe("Role color as a hex string, e.g. '#FF5733'."),
      hoist: z
        .boolean()
        .optional()
        .describe("If true, display members with this role separately in the member list."),
      mentionable: z.boolean().optional().describe("If true, anyone can @mention this role."),
      permissions: z
        .union([z.array(z.string()), z.string()])
        .optional()
        .describe(
          "Server-wide permission flag names to grant, e.g. ['SendMessages','ViewChannel']. Uses Discord PermissionsBitField flag names.",
        ),
    }),
    handle: async ({ guild_id, name, color, hoist, mentionable, permissions }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const perms = permissions === undefined ? undefined : parsePermissionNames(permissions);
      const role = await guild.roles.create({
        name,
        color: color as ColorResolvable | undefined,
        hoist,
        mentionable,
        permissions: perms !== undefined ? deserializePermissions(perms) : undefined,
      });
      return {
        content: [{ type: "text", text: `✅ Role "${role.name}" created (id: ${role.id}).` }],
      };
    },
  }),
  defineTool({
    name: "discord_edit_role",
    description:
      "Update an existing role's name, color, permissions, hoist, or mentionable flag. Only provided fields change; passing permissions REPLACES the role's full permission set. Requires the Manage Roles permission, and the role must be below the bot's highest role.",
    annotations: {
      title: "Edit role",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      role_id: roleId,
      name: z.string().optional().describe("New role name (max 100 characters)."),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, "Hex color like '#FF5733'.")
        .optional()
        .describe("New role color as a hex string, e.g. '#FF5733'."),
      hoist: z
        .boolean()
        .optional()
        .describe("If true, display members with this role separately in the member list."),
      mentionable: z.boolean().optional().describe("If true, anyone can @mention this role."),
      permissions: z
        .union([z.array(z.string()), z.string()])
        .optional()
        .describe(
          "Permission flag names. Providing this REPLACES the role's entire permission set. Uses Discord PermissionsBitField flag names.",
        ),
    }),
    handle: async ({ guild_id, role_id, name, color, hoist, mentionable, permissions }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const role = await fetchRole(guild, role_id);
      const perms = permissions === undefined ? undefined : parsePermissionNames(permissions);
      await role.edit({
        name,
        color: color as ColorResolvable | undefined,
        hoist,
        mentionable,
        permissions: perms !== undefined ? deserializePermissions(perms) : undefined,
      });
      return { content: [{ type: "text", text: `✅ Role "${role.name}" updated.` }] };
    },
  }),
  defineTool({
    name: "discord_delete_role",
    description:
      "Permanently delete a role from the server; it is automatically removed from every member who held it. IRREVERSIBLE. Requires the Manage Roles permission, and the role must be below the bot's highest role.",
    annotations: {
      title: "Delete role",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      role_id: snowflake.describe("ID (snowflake) of the role to delete."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, role_id, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const role = await fetchRole(guild, role_id);
      await role.delete(reason);
      return { content: [{ type: "text", text: `✅ Role "${role.name}" deleted.` }] };
    },
  }),
  defineTool({
    name: "discord_add_role",
    description:
      "Assign an existing role to a member. Requires the Manage Roles permission, and the role must be below the bot's highest role. Idempotent: assigning a role the member already has has no effect. Use discord_remove_role to undo.",
    annotations: {
      title: "Add role to member",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe("Discord user ID (snowflake) of the member to give the role to."),
      role_id: snowflake.describe("ID (snowflake) of the role to assign."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, user_id, role_id, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const member = await guild.members.fetch(user_id);
      await member.roles.add(role_id, reason);
      return { content: [{ type: "text", text: `✅ Role added to ${member.user.tag}.` }] };
    },
  }),
  defineTool({
    name: "discord_remove_role",
    description:
      "Remove a role from a member. Requires the Manage Roles permission, and the role must be below the bot's highest role. Idempotent: removing a role the member doesn't have has no effect. Reverses discord_add_role.",
    annotations: {
      title: "Remove role from member",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe(
        "Discord user ID (snowflake) of the member to remove the role from.",
      ),
      role_id: snowflake.describe("ID (snowflake) of the role to remove."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, user_id, role_id, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const member = await guild.members.fetch(user_id);
      await member.roles.remove(role_id, reason);
      return { content: [{ type: "text", text: `✅ Role removed from ${member.user.tag}.` }] };
    },
  }),
  defineTool({
    name: "discord_get_role_members",
    description:
      "List members who currently hold a specific role, scanning up to 20,000 members. Returns { members: [...], truncated } — check `truncated` on very large servers. Read-only. Use discord_list_roles to discover role IDs first.",
    annotations: { title: "Get role members", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      role_id: snowflake.describe("ID (snowflake) of the role to list holders of."),
    }),
    outputSchema: z.object({
      members: z.array(roleMember),
      truncated: z.boolean(),
      note: z.string().optional(),
    }),
    handle: async ({ guild_id, role_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const role = await fetchRole(guild, role_id);
      // No "members of a role" endpoint exists, so page the member list and filter
      // (1000/page max), accumulating per page: a sweep can empty the cache mid-loop.
      const MAX_PAGES = 20;
      let after: string | undefined;
      let truncated = true;
      const members: { id: string; username: string; nickname: string | null }[] = [];
      for (let i = 0; i < MAX_PAGES; i++) {
        const page = await guild.members.list({ limit: 1000, after });
        for (const m of page.values()) {
          if (m.roles.cache.has(role.id))
            members.push({ id: m.id, username: m.user.tag, nickname: m.nickname });
        }
        if (page.size < 1000) {
          truncated = false;
          break;
        }
        after = page.lastKey();
      }
      return structured({
        members,
        truncated,
        note: truncated
          ? `Only the first ${MAX_PAGES * 1000} members were scanned; results may be incomplete on very large servers.`
          : undefined,
      });
    },
  }),
  defineTool({
    name: "discord_set_role_position",
    description:
      "Move a role up or down in the server's role hierarchy, which determines permission precedence and member-list ordering. Higher position = higher in the list. Requires the Manage Roles permission, and the target position must be below the bot's highest role.",
    annotations: {
      title: "Set role position",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      role_id: snowflake.describe("ID (snowflake) of the role to reposition."),
      position: z
        .int()
        .min(1)
        .describe(
          "New hierarchy position (1 = lowest, just above @everyone, which sits at 0). Higher numbers rank higher.",
        ),
    }),
    handle: async ({ guild_id, role_id, position }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const role = await fetchRole(guild, role_id);
      const maxPosition = guild.roles.cache.size - 1;
      if (position > maxPosition)
        throw new Error(
          `position ${position} is out of range — this server's highest role position is ${maxPosition}.`,
        );
      await role.setPosition(position);
      return {
        content: [{ type: "text", text: `✅ Role "${role.name}" moved to position ${position}.` }],
      };
    },
  }),
  defineTool({
    name: "discord_set_role_icon",
    description:
      "Set or clear a role's icon — either a custom image or a unicode emoji. Requires the server to be Boost Level 2+ (the ROLE_ICONS feature) and the Manage Roles permission. Pass null to either field to remove that icon. Returns a confirmation.",
    annotations: {
      title: "Set role icon",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z
      .object({
        guild_id: guildId,
        role_id: snowflake.describe("ID (snowflake) of the role to set the icon on."),
        icon: z
          .union([httpUrl, z.literal("null")])
          .nullable()
          .optional()
          .describe("Image URL for the role icon, or null to remove it."),
        unicode_emoji: z
          .string()
          .nullable()
          .optional()
          .describe("Unicode emoji to use as the role icon, or null to remove it."),
      })
      .refine(
        (a) => a.icon !== undefined || a.unicode_emoji !== undefined,
        "Provide icon or unicode_emoji.",
      ),
    handle: async ({ guild_id, role_id, icon, unicode_emoji }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const role = await fetchRole(guild, role_id);
      if (icon !== undefined) {
        await role.setIcon(icon === "null" || icon === null ? null : icon);
      }
      if (unicode_emoji !== undefined) {
        await role.setUnicodeEmoji(
          unicode_emoji === "null" || unicode_emoji === null ? null : unicode_emoji,
        );
      }
      return { content: [{ type: "text", text: `✅ Role "${role.name}" icon updated.` }] };
    },
  }),
];

export default defineModule(tools);
