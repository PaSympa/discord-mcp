import { z } from "zod";
import { discord } from "../client.js";
import { defineTool, defineModule, guildId, intIn, structured } from "./define.js";

const auditLogEntry = z.object({
  id: z.string(),
  action: z.number(),
  executor: z.string().nullable(),
  target: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

/** Tool definitions for server moderation (audit log). */
const tools = [
  defineTool({
    name: "discord_get_audit_log",
    description:
      "Fetch the server's audit log, the record of administrative actions (bans, kicks, role/channel changes, etc.) with who performed them and when. Requires the View Audit Log permission. Returns { entries: [...] } with id, action, executor, target, reason, createdAt. Read-only.",
    annotations: { title: "Get audit log", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      limit: intIn(1, 100)
        .default(25)
        .describe("How many recent entries to fetch (1–100). Default 25."),
      // No enum from discord.js: its AuditLogEvent list grows between releases of a transitive
      // dependency, so tools/list would change without a release of this server.
      action_type: z
        .int()
        .min(1)
        .optional()
        .describe(
          "Optional Discord AuditLogEvent numeric ID to filter by. Common IDs: 12 = ChannelDelete, 20 = MemberKick, 22 = MemberBanAdd, 23 = MemberBanRemove, 24 = MemberUpdate (nickname, timeout), 25 = MemberRoleUpdate, 32 = RoleDelete, 72 = MessageDelete. Discord's full list has more. Omit for all action types.",
        ),
    }),
    outputSchema: z.object({ entries: z.array(auditLogEntry) }),
    handle: async ({ guild_id, limit, action_type }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const logs = await guild.fetchAuditLogs({
        limit,
        type: action_type,
      });
      const entries = logs.entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        executor: entry.executor?.tag ?? null,
        target: entry.targetId,
        reason: entry.reason,
        createdAt: entry.createdAt.toISOString(),
      }));
      return structured({ entries });
    },
  }),
];

export default defineModule(tools);
