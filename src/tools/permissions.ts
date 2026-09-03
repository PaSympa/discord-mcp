import { PermissionOverwriteOptions, GuildChannel } from "discord.js";
import { z } from "zod";
import { discord, getGuildChannel, serializePermissions, parsePermissionNames } from "../client.js";
import { defineTool, defineModule, snowflake, guildId, structured } from "./define.js";

/** Flag names as an array, or a JSON-encoded array string (some clients serialize arrays). */
const permFlags = z.union([z.array(z.string()), z.string()]).optional();

const channelOverwriteSummary = z.object({
  id: z.string(),
  type: z.string(),
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});

const auditOverwriteSummary = z.object({
  entity: z.string(),
  type: z.string(),
  allow: z.array(z.string()),
  deny: z.array(z.string()),
});

/** Tool definitions for viewing and managing per-channel permission overwrites. */
const tools = [
  defineTool({
    name: "discord_get_channel_permissions",
    description:
      "List every permission overwrite on a channel, per role and per member, with the allowed and denied permission flags for each. Read-only. Use discord_audit_permissions for a server-wide report across all channels.",
    annotations: { title: "Get channel permissions", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to inspect."),
    }),
    outputSchema: z.object({
      overwrites: z.array(channelOverwriteSummary),
    }),
    handle: async ({ channel_id }) => {
      const channel = await getGuildChannel(channel_id);
      const overwrites = channel.permissionOverwrites.cache.map((ow) => ({
        id: ow.id,
        type: ow.type === 0 ? "role" : "member",
        allow: serializePermissions(ow.allow),
        deny: serializePermissions(ow.deny),
      }));
      return structured({ overwrites });
    },
  }),
  defineTool({
    name: "discord_set_role_permission",
    description:
      "Add or update a per-channel permission overwrite for a role, allowing and/or denying specific permissions. Merges with the role's existing overwrite (does not reset it). Denying View Channel to @everyone also locks the bot out unless it holds an allow overwrite of its own; grant that with discord_set_member_permission before the deny. Requires the Manage Roles permission. Use discord_set_member_permission to target a single member instead.",
    annotations: {
      title: "Set role channel permission",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to set the overwrite on."),
      role_id: snowflake.describe("ID (snowflake) of the role to grant/deny permissions for."),
      allow: permFlags.describe(
        "Permission flag names to allow, e.g. ['SendMessages','ViewChannel'] (or the same array JSON-encoded as a string). Uses Discord PermissionsBitField flag names.",
      ),
      deny: permFlags.describe(
        "Permission flag names to deny, e.g. ['SendMessages'] (or the same array JSON-encoded as a string).",
      ),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ channel_id, role_id, allow, deny, reason }) => {
      const channel = await getGuildChannel(channel_id);
      const options: PermissionOverwriteOptions = {};
      parsePermissionNames(allow).forEach((p) => {
        (options as Record<string, boolean>)[p] = true;
      });
      parsePermissionNames(deny).forEach((p) => {
        (options as Record<string, boolean>)[p] = false;
      });
      await channel.permissionOverwrites.edit(role_id, options, { reason });
      return {
        content: [
          { type: "text", text: `✅ Permissions updated for role ${role_id} on #${channel.name}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_set_member_permission",
    description:
      "Add or update a per-channel permission overwrite for a single member, allowing and/or denying specific permissions. Merges with the member's existing overwrite. Requires the Manage Roles permission. Use discord_set_role_permission to target a whole role instead.",
    annotations: {
      title: "Set member channel permission",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to set the overwrite on."),
      user_id: snowflake.describe("ID (snowflake) of the member to grant/deny permissions for."),
      allow: permFlags.describe(
        "Permission flag names to allow, e.g. ['ViewChannel'] (or the same array JSON-encoded as a string). Uses Discord PermissionsBitField flag names.",
      ),
      deny: permFlags.describe(
        "Permission flag names to deny (array, or JSON-encoded array string).",
      ),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ channel_id, user_id, allow, deny, reason }) => {
      const channel = await getGuildChannel(channel_id);
      const options: PermissionOverwriteOptions = {};
      parsePermissionNames(allow).forEach((p) => {
        (options as Record<string, boolean>)[p] = true;
      });
      parsePermissionNames(deny).forEach((p) => {
        (options as Record<string, boolean>)[p] = false;
      });
      await channel.permissionOverwrites.edit(user_id, options, { reason });
      return {
        content: [
          {
            type: "text",
            text: `✅ Permissions updated for member ${user_id} on #${channel.name}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_reset_channel_permissions",
    description:
      "Remove ALL permission overwrites on a channel, so only role/server-level permissions apply. Does NOT re-sync with the category; use discord_lock_channel_permissions for that. IRREVERSIBLE: the cleared overwrites cannot be recovered. Requires the Manage Roles permission.",
    annotations: {
      title: "Reset channel permissions",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe(
        "ID (snowflake) of the channel whose overwrites will be cleared.",
      ),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ channel_id, reason }) => {
      const channel = await getGuildChannel(channel_id);
      await channel.permissionOverwrites.set([], reason);
      return {
        content: [
          { type: "text", text: `✅ All permission overwrites cleared on #${channel.name}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_copy_permissions",
    description:
      "Replace the target channel's permission overwrites with a copy of the source channel's. The target's existing overwrites are overwritten. Requires the Manage Roles permission. Returns a confirmation.",
    annotations: {
      title: "Copy channel permissions",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      source_channel_id: snowflake.describe(
        "ID (snowflake) of the channel to copy overwrites from.",
      ),
      target_channel_id: snowflake.describe(
        "ID (snowflake) of the channel whose overwrites will be replaced.",
      ),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ source_channel_id, target_channel_id, reason }) => {
      const source = await getGuildChannel(source_channel_id);
      const target = await getGuildChannel(target_channel_id);
      const overwrites = source.permissionOverwrites.cache.map((ow) => ({
        id: ow.id,
        type: ow.type,
        allow: ow.allow,
        deny: ow.deny,
      }));
      await target.permissionOverwrites.set(overwrites, reason);
      return {
        content: [
          { type: "text", text: `✅ Permissions copied from #${source.name} to #${target.name}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_audit_permissions",
    description:
      "Generate a server-wide permission report: for every channel that has overwrites, lists each role/member and their allowed/denied permissions (entity names resolved). Read-only. Returns { channels: [...] } with channel, channelId, overwrites. Use discord_get_channel_permissions for a single channel.",
    annotations: { title: "Audit permissions", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({
      channels: z.array(
        z.object({
          channel: z.string(),
          channelId: z.string(),
          overwrites: z.array(auditOverwriteSummary),
        }),
      ),
    }),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      await guild.channels.fetch();
      await guild.roles.fetch();
      const memberIdsNeeded = new Set<string>();
      guild.channels.cache.forEach((ch) => {
        if (ch instanceof GuildChannel) {
          ch.permissionOverwrites.cache.forEach((ow) => {
            if (ow.type === 1) memberIdsNeeded.add(ow.id);
          });
        }
      });
      // From the fetch results, not the cache: a sweep can fire before the read-back.
      const fetched = await Promise.all(
        [...memberIdsNeeded].map((id) => guild.members.fetch(id).catch(() => null)),
      );
      const memberTags = new Map(fetched.filter((m) => m !== null).map((m) => [m.id, m.user.tag]));
      const report: Record<string, unknown>[] = [];
      guild.channels.cache
        .filter((c) => c instanceof GuildChannel)
        .forEach((ch) => {
          const gch = ch as GuildChannel;
          const overwrites = gch.permissionOverwrites.cache.map((ow) => {
            const isRole = ow.type === 0;
            const entity = isRole
              ? (guild.roles.cache.get(ow.id)?.name ?? ow.id)
              : (memberTags.get(ow.id) ?? ow.id);
            return {
              entity,
              type: isRole ? "role" : "member",
              allow: serializePermissions(ow.allow),
              deny: serializePermissions(ow.deny),
            };
          });
          if (overwrites.length > 0)
            report.push({ channel: gch.name, channelId: gch.id, overwrites });
        });
      return structured({ channels: report });
    },
  }),
];

export default defineModule(tools);
