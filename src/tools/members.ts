import { GuildMember } from "discord.js";
import { z } from "zod";
import { discord, serializePermissions } from "../client.js";
import { MAX_FETCH_LIMIT, DEFAULTS } from "../constants.js";
import { defineTool, defineModule, snowflake, guildId, intIn, structured } from "./define.js";

const roleRef = z.object({ id: z.string(), name: z.string() });
const memberSummary = z.object({
  id: z.string(),
  username: z.string(),
  nickname: z.string().nullable(),
  roles: z.array(roleRef),
  joinedAt: z.string().nullable(),
});

/** Tool definitions for listing, inspecting, and moderating guild members. */
const tools = [
  defineTool({
    name: "discord_list_members",
    description:
      "List members of a server with their roles, ordered by user ID. Returns { members: [...], nextCursor }. A page holds up to 1000 members; if nextCursor is non-null, pass it back as `after` to fetch the next page. Use discord_search_members to find specific members by name, or discord_get_member_info for one member's full details. Read-only.",
    annotations: { title: "List members", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      limit: intIn(1, DEFAULTS.MEMBERS_MAX)
        .default(DEFAULTS.MEMBERS)
        .describe("How many members per page (1–1000). Default 50."),
      after: snowflake
        .optional()
        .describe(
          "Pagination cursor: a user ID (snowflake). Pass the previous response's nextCursor to fetch the next page.",
        ),
    }),
    outputSchema: z.object({ members: z.array(memberSummary), nextCursor: z.string().nullable() }),
    handle: async ({ guild_id, limit, after }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const members = await guild.members.list({ limit, after });
      const result = [...members.values()].map((m: GuildMember) => ({
        id: m.id,
        username: m.user.tag,
        nickname: m.nickname,
        roles: m.roles.cache
          .filter((r) => r.name !== "@everyone")
          .map((r) => ({ id: r.id, name: r.name })),
        joinedAt: m.joinedAt?.toISOString() ?? null,
      }));
      const nextCursor = members.size === limit ? (members.lastKey() ?? null) : null;
      return structured({ members: result, nextCursor });
    },
  }),
  defineTool({
    name: "discord_get_member_info",
    description:
      "Get full details for one server member: roles, effective permissions, account/join dates, bot flag, and current timeout status. Read-only. Returns a JSON object.",
    annotations: { title: "Get member info", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe("Discord user ID (snowflake) of the member."),
    }),
    outputSchema: z.object({
      id: z.string(),
      username: z.string(),
      nickname: z.string().nullable(),
      roles: z.array(roleRef),
      permissions: z.array(z.string()),
      joinedAt: z.string().nullable(),
      createdAt: z.string(),
      bot: z.boolean(),
      timedOutUntil: z.string().nullable(),
    }),
    handle: async ({ guild_id, user_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const member = await guild.members.fetch(user_id);
      return structured({
        id: member.id,
        username: member.user.tag,
        nickname: member.nickname,
        roles: member.roles.cache
          .filter((r) => r.name !== "@everyone")
          .map((r) => ({ id: r.id, name: r.name })),
        permissions: serializePermissions(member.permissions),
        joinedAt: member.joinedAt?.toISOString() ?? null,
        createdAt: member.user.createdAt.toISOString(),
        bot: member.user.bot,
        timedOutUntil: member.communicationDisabledUntil?.toISOString() ?? null,
      });
    },
  }),
  defineTool({
    name: "discord_kick_member",
    description:
      "Remove a member from the server. They can rejoin with a new invite (unlike a ban). Requires the Kick Members permission, and the bot's top role must be higher than the target's. Use discord_ban_member to block re-entry. The reason is recorded in the audit log.",
    annotations: {
      title: "Kick member",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe("Discord user ID (snowflake) of the member to kick."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, user_id, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const member = await guild.members.fetch(user_id);
      await member.kick(reason);
      return { content: [{ type: "text", text: `✅ ${member.user.tag} has been kicked.` }] };
    },
  }),
  defineTool({
    name: "discord_ban_member",
    description:
      "Ban a user from the server, blocking re-entry until unbanned. Optionally bulk-deletes their recent messages. Requires the Ban Members permission, and the bot's top role must outrank the target's. Use discord_unban_member to reverse, or discord_kick_member for a non-permanent removal. The reason is recorded in the audit log.",
    annotations: {
      title: "Ban member",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe("Discord user ID (snowflake) of the user to ban."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
      delete_message_days: intIn(0, 7)
        .default(0)
        .describe(
          "Also delete the user's messages from the last N days (0–7). Default 0 (delete nothing).",
        ),
    }),
    handle: async ({ guild_id, user_id, reason, delete_message_days }) => {
      const guild = await discord.guilds.fetch(guild_id);
      await guild.members.ban(user_id, {
        reason,
        deleteMessageSeconds: delete_message_days * 86400,
      });
      return { content: [{ type: "text", text: `✅ User ${user_id} has been banned.` }] };
    },
  }),
  defineTool({
    name: "discord_unban_member",
    description:
      "Lift a ban so the user may rejoin via a new invite. Requires the Ban Members permission. Reverses discord_ban_member. The reason is recorded in the audit log.",
    annotations: {
      title: "Unban member",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe("Discord user ID (snowflake) of the banned user to unban."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, user_id, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      await guild.members.unban(user_id, reason);
      return { content: [{ type: "text", text: `✅ User ${user_id} has been unbanned.` }] };
    },
  }),
  defineTool({
    name: "discord_timeout_member",
    description:
      "Mute a member for a set duration (Discord 'timeout'): they cannot send messages, react, or speak until it expires. Pass duration_minutes = 0 to remove an active timeout early. Max 28 days (40320 minutes). Requires the Moderate Members permission.",
    annotations: {
      title: "Timeout member",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe("Discord user ID (snowflake) of the member to time out."),
      duration_minutes: intIn(0, 40320).describe(
        "Timeout length in minutes (0–40320, i.e. up to 28 days). Use 0 to clear an existing timeout.",
      ),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, user_id, duration_minutes, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const member = await guild.members.fetch(user_id);
      const until =
        duration_minutes > 0 ? new Date(Date.now() + duration_minutes * 60 * 1000) : null;
      await member.disableCommunicationUntil(until, reason);
      return {
        content: [
          {
            type: "text",
            text:
              duration_minutes > 0
                ? `✅ ${member.user.tag} is in timeout for ${duration_minutes} minutes.`
                : `✅ Timeout removed from ${member.user.tag}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_search_members",
    description:
      "Find server members whose username or nickname starts with a query string (prefix match). Returns { members: [...] } with id, username, nickname, roles. Use discord_list_members to page through everyone. Read-only.",
    annotations: { title: "Search members", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      query: z.string().describe("Prefix to match against usernames and nicknames."),
      limit: intIn(1, MAX_FETCH_LIMIT)
        .default(DEFAULTS.LIMIT)
        .describe("Max members to return (1–100). Default 25."),
    }),
    outputSchema: z.object({
      members: z.array(
        z.object({
          id: z.string(),
          username: z.string(),
          nickname: z.string().nullable(),
          roles: z.array(roleRef),
        }),
      ),
    }),
    handle: async ({ guild_id, query, limit }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const members = await guild.members.search({ query, limit });
      const result = [...members.values()].map((m: GuildMember) => ({
        id: m.id,
        username: m.user.tag,
        nickname: m.nickname,
        roles: m.roles.cache
          .filter((r) => r.name !== "@everyone")
          .map((r) => ({ id: r.id, name: r.name })),
      }));
      return structured({ members: result });
    },
  }),
  defineTool({
    name: "discord_set_nickname",
    description:
      "Set or clear a member's server nickname. Pass null (or the string 'null') to clear it. Requires the Manage Nicknames permission (or Change Nickname for the bot itself). The reason is recorded in the audit log.",
    annotations: {
      title: "Set nickname",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_id: snowflake.describe("Discord user ID (snowflake) of the member."),
      nickname: z
        .string()
        .max(32)
        .nullable()
        .describe("New nickname (max 32 characters), or null to clear it."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, user_id, nickname, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const member = await guild.members.fetch(user_id);
      const nick = nickname === null || nickname === "null" ? null : nickname;
      await member.setNickname(nick, reason);
      return {
        content: [
          {
            type: "text",
            text: nick
              ? `✅ Nickname for ${member.user.tag} set to "${nick}".`
              : `✅ Nickname cleared for ${member.user.tag}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_list_bans",
    description:
      "List the users banned from the server, with their ban reasons. Returns { bans: [...], nextCursor }. A page holds up to 1000 bans; if nextCursor is non-null, pass it back as `after` to fetch the next page. Requires the Ban Members permission. Read-only.",
    annotations: { title: "List bans", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      limit: intIn(1, DEFAULTS.MEMBERS_MAX)
        .default(DEFAULTS.MEMBERS_MAX)
        .describe("Max bans per page (1–1000). Default 1000."),
      after: snowflake
        .optional()
        .describe(
          "Pagination cursor: a user ID (snowflake). Pass the previous response's nextCursor to fetch the next page.",
        ),
    }),
    outputSchema: z.object({
      bans: z.array(
        z.object({
          user_id: z.string(),
          username: z.string(),
          reason: z.string().nullable(),
        }),
      ),
      nextCursor: z.string().nullable(),
    }),
    handle: async ({ guild_id, limit, after }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const bans = await guild.bans.fetch({ limit, after, cache: false });
      const result = [...bans.values()].map((ban) => ({
        user_id: ban.user.id,
        username: ban.user.tag,
        reason: ban.reason ?? null,
      }));
      const nextCursor = bans.size === limit ? (bans.lastKey() ?? null) : null;
      return structured({ bans: result, nextCursor });
    },
  }),
  defineTool({
    name: "discord_bulk_ban",
    description:
      "Ban many users in a single call, intended for raid mitigation. SAFE BY DEFAULT: dry_run is true unless explicitly set to false, so call it first to preview the exact list of user IDs that would be banned, then re-call with dry_run:false to actually ban them. Requires both the Ban Members and Manage Server permissions. Returns counts of banned vs failed users; Discord rejects the whole call with an error if no user could be banned. Use discord_ban_member for a single ban with finer control.",
    annotations: {
      title: "Bulk ban",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      user_ids: z
        .array(snowflake)
        .min(1)
        .max(200)
        .describe("Array of user IDs (snowflakes) to ban (max 200 per call, a Discord API limit)."),
      delete_message_seconds: intIn(0, 604800)
        .default(0)
        .describe(
          "Also delete each user's messages from the last N seconds (0–604800, i.e. up to 7 days). Default 0.",
        ),
      dry_run: z
        .boolean()
        .default(true)
        .describe(
          "If true (default), only returns the user IDs that would be banned without banning anyone. Set false to actually ban.",
        ),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, user_ids, delete_message_seconds, dry_run, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      if (dry_run) {
        return {
          content: [
            {
              type: "text",
              text: `🔍 Dry run: ${user_ids.length} users would be banned:\n${JSON.stringify(user_ids, null, 2)}`,
            },
          ],
        };
      }
      const result = await guild.members.bulkBan(user_ids, {
        deleteMessageSeconds: delete_message_seconds,
        reason,
      });
      return {
        content: [
          {
            type: "text",
            text: `✅ Bulk ban complete: ${result.bannedUsers.length} banned, ${result.failedUsers.length} failed.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_prune_members",
    description:
      "Remove members who have been inactive (no roles, not seen) for a number of days. SAFE BY DEFAULT: dry_run is true unless explicitly set to false, so call it first to preview the count, then re-call with dry_run:false to actually remove them. Removal is irreversible (members must rejoin). Requires the Kick Members permission.",
    annotations: {
      title: "Prune inactive members",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      days: intIn(1, 30).describe("Inactivity threshold in days (1–30)."),
      roles: z
        .array(snowflake)
        .optional()
        .describe(
          "Optional role IDs (snowflakes) to include; by default only members with no roles are counted.",
        ),
      dry_run: z
        .boolean()
        .default(true)
        .describe(
          "If true (default), only returns the count that would be pruned without removing anyone. Set false to actually prune.",
        ),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ guild_id, days, roles, dry_run, reason }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const pruned = await guild.members.prune({
        days,
        dry: dry_run,
        roles: roles ?? undefined,
        reason,
      });
      return {
        content: [
          {
            type: "text",
            text: dry_run
              ? `🔍 Dry run: ${pruned} members would be pruned (${days} days inactive).`
              : `✅ ${pruned} members pruned (${days} days inactive).`,
          },
        ],
      };
    },
  }),
];

export default defineModule(tools);
