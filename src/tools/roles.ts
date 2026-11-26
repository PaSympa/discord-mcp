import { ColorResolvable, PermissionFlagsBits, Routes, type Guild, type Role } from "discord.js";
import { z } from "zod";
import {
  discord,
  serializePermissions,
  deserializePermissions,
  parsePermissionNames,
  fetchRole,
} from "../client.js";
import { BATCH_BUDGET_MS, batchStopSchema, failureShape, runBatch } from "../batch.js";
import {
  defineTool,
  defineModule,
  snowflake,
  snowflakeSet,
  guildId,
  quoted,
  plural,
  reasonLine,
  structured,
  httpUrl,
  textUpTo,
} from "./define.js";

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

const MAX_BULK_MEMBERS = 50;
/** A gateway member request answers in well under a second; discord.js waits 120 s by default. */
const MEMBER_FETCH_TIMEOUT_MS = 15_000;

const bulkRoleShape = {
  guild_id: guildId,
  role_id: snowflake.describe("ID (snowflake) of the role."),
  user_ids: snowflakeSet(MAX_BULK_MEMBERS).describe(
    "User IDs (snowflakes) of the members, 1-50 distinct.",
  ),
  dry_run: z
    .boolean()
    .default(true)
    .describe(
      "If true (default), changes nothing and returns would_change. Set false to change the roles.",
    ),
  reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
};

const bulkRoleOutput = z.object({
  dry_run: z.boolean().describe("true for a preview: no role was changed."),
  would_change: z.array(z.string()).optional().describe("Dry run only."),
  done: z.array(z.string()).optional().describe("User IDs whose role this call changed."),
  skipped: z.array(z.string()).describe("User IDs already as asked, left untouched."),
  not_member: z.array(z.string()).describe("User IDs that are not members of the server."),
  failed: z
    .array(z.object({ user_id: z.string(), ...failureShape }))
    .optional()
    .describe("User IDs Discord refused to change, with its error code."),
  remaining: z
    .array(z.string())
    .optional()
    .describe("User IDs this call did not reach. Call again with them: re-applying is harmless."),
  stopped: batchStopSchema().optional(),
});

/**
 * Refuses, before any member is touched, a role that would fail for every member.
 * Discord refuses a role at or above the bot's highest role even to an Administrator bot.
 */
async function assignableRole(guild: Guild, roleId: string): Promise<Role> {
  const role = await fetchRole(guild, roleId);
  if (role.id === guild.id)
    throw new Error("@everyone belongs to every member: it cannot be added or removed.");
  if (role.managed)
    throw new Error(
      `Role "${role.name}" is managed by an integration, such as a bot, a subscription or the booster role. Discord assigns it and refuses to change it by hand.`,
    );
  const me = await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles))
    throw new Error(
      "The bot lacks the Manage Roles permission in this server. Grant it to one of the bot's roles, then retry.",
    );
  if (guild.ownerId !== me.id && role.comparePositionTo(me.roles.highest) >= 0)
    throw new Error(
      `Role "${role.name}" is not below the bot's highest role "${me.roles.highest.name}", so Discord refuses to change it. Move the bot's role above it, then retry.`,
    );
  return role;
}

async function sortMembers(guild: Guild, role: Role, userIds: string[], add: boolean) {
  const members = await guild.members.fetch({ user: userIds, time: MEMBER_FETCH_TIMEOUT_MS });
  const change: string[] = [];
  const skipped: string[] = [];
  const notMember: string[] = [];
  for (const id of userIds) {
    const member = members.get(id);
    if (!member) notMember.push(id);
    else if (member.roles.cache.has(role.id) === add) skipped.push(id);
    else change.push(id);
  }
  return { change, skipped, notMember };
}

function bulkRoleTool(tool: { name: string; title: string; description: string; add: boolean }) {
  return defineTool({
    name: tool.name,
    description: tool.description,
    annotations: {
      title: tool.title,
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object(bulkRoleShape),
    outputSchema: bulkRoleOutput,
    handle: async (
      { guild_id, role_id, user_ids, dry_run, reason },
      { signal, progress, confirm },
    ) => {
      const deadline = Date.now() + BATCH_BUDGET_MS;
      const guild = await discord.guilds.fetch(guild_id);
      const role = await assignableRole(guild, role_id);
      const { change, skipped, notMember } = await sortMembers(guild, role, user_ids, tool.add);
      if (dry_run)
        return structured({ dry_run, would_change: change, skipped, not_member: notMember });
      if (change.length)
        await confirm?.(() => {
          const left = [
            skipped.length && `${skipped.length} ${tool.add ? "already with" : "without"} the role`,
            notMember.length && `${notMember.length} not in the server`,
          ].filter(Boolean);
          const leftOut = left.length ? ` Left out: ${left.join(", ")}.` : "";
          const name = `${quoted(role.name)} (${role.id})`;
          const action = tool.add ? `Add the role ${name} to` : `Remove the role ${name} from`;
          return `${action} ${plural(change.length, "member")} of ${quoted(guild.name)} (${guild.id})?${leftOut}${reasonLine(reason)}`;
        });
      const result = await runBatch(
        change,
        (user, itemSignal) => {
          const route = Routes.guildMemberRole(guild.id, user, role.id);
          const options = { reason, signal: itemSignal };
          return tool.add ? discord.rest.put(route, options) : discord.rest.delete(route, options);
        },
        { deadline, signal, progress },
      );
      return structured({
        dry_run,
        done: result.done,
        skipped,
        not_member: notMember,
        failed: result.failed.map(({ item, code, message }) => ({ user_id: item, code, message })),
        remaining: result.remaining,
        ...(result.stopped ? { stopped: result.stopped } : {}),
      });
    },
  });
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
      "Create a new role in a server. Requires the Manage Roles permission; the new role is placed below the bot's highest role. Use discord_add_role to then assign it to members. Returns the new role's name and ID. To change an existing role, use discord_edit_role.",
    annotations: {
      title: "Create role",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      name: textUpTo(100).describe("Name of the new role (max 100 characters)."),
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
      "Update an existing role's name, color, permissions, hoist, or mentionable flag. Only provided fields change; passing permissions REPLACES the role's full permission set, and passing color sets a single solid color, removing any gradient or holographic colors. Requires the Manage Roles permission, and the role must be below the bot's highest role. These permissions apply server-wide; for one channel, use discord_set_role_permission. Use discord_set_role_position to move the role, discord_set_role_icon for its icon, or discord_create_role for a new role.",
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
      name: textUpTo(100).optional().describe("New role name (max 100 characters)."),
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
      "Permanently delete a role from the server; it is automatically removed from every member who held it. IRREVERSIBLE. Requires the Manage Roles permission, and the role must be below the bot's highest role. To take the role from one member only, use discord_remove_role.",
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
      "Assign an existing role to a member. Requires the Manage Roles permission, and the role must be below the bot's highest role. Idempotent: assigning a role the member already has has no effect. Use discord_remove_role to undo. Use discord_bulk_add_role for many members, or discord_create_role to create a new role.",
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
      "Remove a role from a member. Requires the Manage Roles permission, and the role must be below the bot's highest role. Idempotent: removing a role the member doesn't have has no effect. Reverses discord_add_role. Use discord_bulk_remove_role for many members, or discord_delete_role to delete the role itself.",
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
  bulkRoleTool({
    name: "discord_bulk_add_role",
    title: "Add role to many members",
    add: true,
    description:
      "Add one role to up to 50 members in one call. SAFE BY DEFAULT: dry_run is true unless explicitly set to false. Before any change, both modes refuse @everyone, a managed role (bot, integration, booster), a role not below the bot's highest role, and a bot without Manage Roles. The dry run sorts user_ids into would_change, skipped (already have the role) and not_member; a real call sorts them again and changes only would_change, one request each. Discord allows about 10 role changes per 10 seconds, so a call stops after about 40 seconds and returns the rest in remaining, with the reason in stopped and any wait in stopped.retry_after_seconds: call again with those IDs after that wait, re-applying is harmless. Requires the Manage Roles permission. Returns { dry_run, would_change, skipped, not_member } for a preview and { dry_run, done, skipped, not_member, failed, remaining } after a real call. Use discord_add_role for one member, or discord_bulk_remove_role to undo.",
  }),
  bulkRoleTool({
    name: "discord_bulk_remove_role",
    title: "Remove role from many members",
    add: false,
    description:
      "Remove one role from up to 50 members in one call. SAFE BY DEFAULT: dry_run is true unless explicitly set to false. Before any change, both modes refuse @everyone, a managed role (bot, integration, booster), a role not below the bot's highest role, and a bot without Manage Roles. The dry run sorts user_ids into would_change, skipped (do not have the role) and not_member; a real call sorts them again and changes only would_change, one request each. Discord allows about 10 role changes per 10 seconds, so a call stops after about 40 seconds and returns the rest in remaining, with the reason in stopped and any wait in stopped.retry_after_seconds: call again with those IDs after that wait, re-applying is harmless. Requires the Manage Roles permission. Returns { dry_run, would_change, skipped, not_member } for a preview and { dry_run, done, skipped, not_member, failed, remaining } after a real call. Use discord_remove_role for one member, or discord_bulk_add_role to undo.",
  }),
  defineTool({
    name: "discord_get_role_members",
    description:
      "List members who currently hold a specific role, scanning up to 20,000 members. Returns { members: [...], truncated }; check `truncated` on very large servers. Read-only. Use discord_list_roles to discover role IDs first. Requires the Server Members privileged intent, enabled in the Developer Portal.",
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
      "Move a role up or down in the server's role hierarchy, which determines permission precedence and member-list ordering. Higher position = higher in the list. Requires the Manage Roles permission, and the target position must be below the bot's highest role. To change the role's name, color or permissions, use discord_edit_role.",
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
          `position ${position} is out of range; this server's highest role position is ${maxPosition}.`,
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
      "Set or clear a role's icon, either a custom image or a unicode emoji. Requires the server to be Boost Level 2+ (the ROLE_ICONS feature) and the Manage Roles permission. Pass null to either field to remove that icon. Returns a confirmation. To change the role's name, color or permissions, use discord_edit_role.",
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
