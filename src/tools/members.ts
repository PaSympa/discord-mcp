import { GuildMember } from "discord.js";
import { discord, serializePermissions, validateId } from "../client.js";
import { MAX_FETCH_LIMIT, DEFAULTS } from "../constants.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for listing, inspecting, and moderating guild members. */
export const definitions = [
  {
    name: "discord_list_members",
    description: "List guild members with their roles.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        limit: { type: "number", description: "1–1000, default 50." },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_get_member_info",
    description: "Get detailed info about a member: roles, permissions, join date, timeout status.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        user_id: { type: "string" },
      },
      required: ["guild_id", "user_id"],
    },
  },
  {
    name: "discord_kick_member",
    description: "Kick a member from a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        user_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["guild_id", "user_id"],
    },
  },
  {
    name: "discord_ban_member",
    description: "Ban a member from a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        user_id: { type: "string" },
        reason: { type: "string" },
        delete_message_days: { type: "number", description: "Delete messages from last N days (0–7)." },
      },
      required: ["guild_id", "user_id"],
    },
  },
  {
    name: "discord_unban_member",
    description: "Unban a user from a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        user_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["guild_id", "user_id"],
    },
  },
  {
    name: "discord_timeout_member",
    description: "Put a member in timeout (0 minutes to remove the timeout).",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        user_id: { type: "string" },
        duration_minutes: { type: "number" },
        reason: { type: "string" },
      },
      required: ["guild_id", "user_id", "duration_minutes"],
    },
  },
  {
    name: "discord_search_members",
    description: "Search guild members by username or nickname.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        query: { type: "string", description: "Search query (matches username and nickname)." },
        limit: { type: "number", description: "1–100, default 25." },
      },
      required: ["guild_id", "query"],
    },
  },
  {
    name: "discord_set_nickname",
    description: "Set or clear a member's nickname.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        user_id: { type: "string" },
        nickname: { type: "string", description: "New nickname, or null to clear." },
        reason: { type: "string" },
      },
      required: ["guild_id", "user_id", "nickname"],
    },
  },
  {
    name: "discord_list_bans",
    description: "List all banned users in a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        limit: { type: "number", description: "Max bans to fetch." },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_bulk_ban",
    description: "Ban multiple users at once (raid mitigation).",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        user_ids: { type: "array", items: { type: "string" }, description: "Array of user IDs to ban." },
        delete_message_seconds: { type: "number", description: "Delete messages from last N seconds (0–604800)." },
        reason: { type: "string" },
      },
      required: ["guild_id", "user_ids"],
    },
  },
  {
    name: "discord_prune_members",
    description: "Remove inactive members. Use dry_run (default) to preview count first.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        days: { type: "number", description: "Number of days of inactivity (1–30)." },
        roles: { type: "array", items: { type: "string" }, description: "Role IDs to include in the prune." },
        dry_run: { type: "boolean", description: "If true (default), only returns count without pruning." },
        reason: { type: "string" },
      },
      required: ["guild_id", "days"],
    },
  },
];

/**
 * Handles member tools: list with roles, detailed info,
 * kick, ban, unban, and timeout management.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_list_members": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const limit = Math.min(Number(args.limit ?? DEFAULTS.MEMBERS), DEFAULTS.MEMBERS_MAX);
      const members = await guild.members.list({ limit });
      const result = [...members.values()].map((m: GuildMember) => ({
        id: m.id, username: m.user.tag, nickname: m.nickname,
        roles: m.roles.cache.filter((r) => r.name !== "@everyone").map((r) => ({ id: r.id, name: r.name })),
        joinedAt: m.joinedAt?.toISOString(),
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_get_member_info": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const member = await guild.members.fetch(args.user_id as string);
      return {
        content: [{
          type: "text", text: JSON.stringify({
            id: member.id, username: member.user.tag, nickname: member.nickname,
            roles: member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => ({ id: r.id, name: r.name })),
            permissions: serializePermissions(member.permissions),
            joinedAt: member.joinedAt?.toISOString(), createdAt: member.user.createdAt.toISOString(),
            bot: member.user.bot, timedOutUntil: member.communicationDisabledUntil?.toISOString() ?? null,
          }, null, 2),
        }],
      };
    }

    case "discord_kick_member": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const member = await guild.members.fetch(args.user_id as string);
      await member.kick(args.reason as string | undefined);
      return { content: [{ type: "text", text: `✅ ${member.user.tag} has been kicked.` }] };
    }

    case "discord_ban_member": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const deleteDays = Math.min(Math.max(Number(args.delete_message_days ?? 0), 0), 7);
      await guild.members.ban(args.user_id as string, {
        reason: args.reason as string | undefined,
        deleteMessageSeconds: deleteDays * 86400,
      });
      return { content: [{ type: "text", text: `✅ User ${args.user_id} has been banned.` }] };
    }

    case "discord_unban_member": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      await guild.members.unban(args.user_id as string, args.reason as string | undefined);
      return { content: [{ type: "text", text: `✅ User ${args.user_id} has been unbanned.` }] };
    }

    case "discord_timeout_member": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const member = await guild.members.fetch(args.user_id as string);
      const duration = args.duration_minutes as number;
      const until = duration > 0 ? new Date(Date.now() + duration * 60 * 1000) : null;
      await member.disableCommunicationUntil(until, args.reason as string | undefined);
      return {
        content: [{
          type: "text",
          text: duration > 0 ? `✅ ${member.user.tag} is in timeout for ${duration} minutes.` : `✅ Timeout removed from ${member.user.tag}.`,
        }],
      };
    }

    case "discord_search_members": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const limit = Math.min(Number(args.limit ?? DEFAULTS.LIMIT), MAX_FETCH_LIMIT);
      const members = await guild.members.search({ query: args.query as string, limit });
      const result = [...members.values()].map((m: GuildMember) => ({
        id: m.id, username: m.user.tag, nickname: m.nickname,
        roles: m.roles.cache.filter((r) => r.name !== "@everyone").map((r) => ({ id: r.id, name: r.name })),
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_set_nickname": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const member = await guild.members.fetch(args.user_id as string);
      const nick = args.nickname === null || args.nickname === "null" ? null : String(args.nickname);
      await member.setNickname(nick, args.reason as string | undefined);
      return { content: [{ type: "text", text: nick ? `✅ Nickname for ${member.user.tag} set to "${nick}".` : `✅ Nickname cleared for ${member.user.tag}.` }] };
    }

    case "discord_list_bans": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const limit = args.limit ? Number(args.limit) : undefined;
      const bans = await guild.bans.fetch({ limit, cache: false });
      const result = [...bans.values()].map((ban) => ({
        user_id: ban.user.id, username: ban.user.tag, reason: ban.reason ?? null,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_bulk_ban": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const userIds = args.user_ids as string[];
      if (!Array.isArray(userIds) || userIds.length === 0) throw new Error("user_ids must be a non-empty array.");
      const result = await guild.members.bulkBan(userIds, {
        deleteMessageSeconds: Number(args.delete_message_seconds ?? 0),
        reason: args.reason as string | undefined,
      });
      return { content: [{ type: "text", text: `✅ Bulk ban complete: ${result.bannedUsers.length} banned, ${result.failedUsers.length} failed.` }] };
    }

    case "discord_prune_members": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const days = Number(args.days);
      const dryRun = args.dry_run !== false;
      const roles = args.roles as string[] | undefined;
      const pruned = await guild.members.prune({
        days,
        dry: dryRun,
        roles: roles ?? undefined,
        reason: args.reason as string | undefined,
      });
      return { content: [{ type: "text", text: dryRun ? `🔍 Dry run: ${pruned} members would be pruned (${days} days inactive).` : `✅ ${pruned} members pruned (${days} days inactive).` }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
