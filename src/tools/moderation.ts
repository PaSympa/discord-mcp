import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for server moderation (audit log). */
export const definitions = [
  {
    name: "discord_get_audit_log",
    description: "Fetch the guild audit log (who did what and when).",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        limit: { type: "number", description: "1–100, default 25." },
        action_type: { type: "number", description: "Optional: filter by Discord action type ID." },
      },
      required: ["guild_id"],
    },
  },
];

/**
 * Handles moderation tools: fetches the guild audit log
 * with optional filtering by action type.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_get_audit_log": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const logs = await guild.fetchAuditLogs({
        limit: Math.min(Number(args.limit ?? 25), 100),
        type: args.action_type as number | undefined,
      });
      const result = logs.entries.map((entry) => ({
        id: entry.id, action: entry.action,
        executor: entry.executor?.tag, target: entry.targetId,
        reason: entry.reason, createdAt: entry.createdAt.toISOString(),
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
