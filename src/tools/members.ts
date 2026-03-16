import { GuildMember } from "discord.js";
import { discord, serializePermissions, validateId } from "../client.js";
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
];

/**
 * Handles member tools: list with roles, detailed info,
 * kick, ban, unban, and timeout management.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_list_members": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const limit = Math.min(Number(args.limit ?? 50), 1000);
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

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
