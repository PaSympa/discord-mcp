import { DiscordAPIError } from "discord.js";
import { ZodError } from "zod";

/** Plain-language hints for the Discord API error codes most likely to surface through these tools. */
const DISCORD_ERROR_HINTS: Record<number, string> = {
  10003: "Unknown channel; check channel_id.",
  10004: "Unknown guild; the bot is not in that server or guild_id is wrong.",
  10008: "Unknown message; wrong message_id, or it was already deleted.",
  10011: "Unknown role; check role_id.",
  10013: "Unknown user; check user_id.",
  10026: "Unknown ban; the user is not banned.",
  50001: "Missing access; the bot is not in the guild or cannot see this channel.",
  50013: "Missing permissions; the bot lacks the permission this action requires.",
  50035: "Invalid form body; one or more arguments are invalid.",
};

/** Formats an error for the MCP client, surfacing DiscordAPIError code/status and an actionable hint. */
export function formatToolError(err: unknown): string {
  if (err instanceof ZodError) {
    const detail = err.issues
      .map((i) => {
        const path = i.path.join(".");
        return path ? `${path}: ${i.message}` : i.message;
      })
      .join("; ");
    return `Invalid arguments. ${detail}`;
  }
  if (err instanceof DiscordAPIError) {
    const code = Number(err.code);
    const hint = DISCORD_ERROR_HINTS[code];
    const base = `Discord API error ${err.code} (HTTP ${err.status}): ${err.message}`;
    return hint ? `${base}. ${hint}` : base;
  }
  return err instanceof Error ? err.message : String(err);
}
