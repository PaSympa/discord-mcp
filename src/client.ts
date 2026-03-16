import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  TextChannel,
  GuildChannel,
  PermissionsBitField,
} from "discord.js";

// ─── Discord Client ────────────────────────────────────────────────────────────
// Initializes the Discord.js client with the required gateway intents
// and exposes shared helper functions used across all tool modules.
// ────────────────────────────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
if (!DISCORD_TOKEN) {
  console.error("❌  DISCORD_TOKEN env variable is required.");
  process.exit(1);
}

export const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
});

let discordReady = false;
discord.once("clientReady", () => {
  discordReady = true;
  console.error(`✅  Discord bot connected as ${discord.user?.tag}`);
});

discord.login(DISCORD_TOKEN);

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Ensures the Discord client has completed its login handshake.
 * @throws {Error} If the client is not yet connected.
 */
export function assertReady() {
  if (!discordReady) throw new Error("Discord bot is not connected yet. Retry in a moment.");
}

/**
 * Fetches a channel by ID and guarantees it is a text channel.
 * @param channelId - Discord snowflake ID of the channel.
 * @returns The resolved TextChannel instance.
 * @throws {Error} If the channel does not exist or is not a text channel.
 */
export async function getTextChannel(channelId: string): Promise<TextChannel> {
  const channel = await discord.channels.fetch(channelId);
  if (!channel || !(channel instanceof TextChannel))
    throw new Error(`Channel ${channelId} is not a text channel or doesn't exist.`);
  return channel;
}

/**
 * Fetches a channel by ID and guarantees it is a guild channel (text, voice, or category).
 * @param channelId - Discord snowflake ID of the channel.
 * @returns The resolved GuildChannel instance.
 * @throws {Error} If the channel does not exist or is not a guild channel.
 */
export async function getGuildChannel(channelId: string): Promise<GuildChannel> {
  const channel = await discord.channels.fetch(channelId);
  if (!channel || !(channel instanceof GuildChannel))
    throw new Error(`Channel ${channelId} is not a guild channel or doesn't exist.`);
  return channel;
}

/**
 * Validates that a value is a proper Discord snowflake ID (17-20 digit number).
 * @param value - The raw value to validate.
 * @param label - A human-readable label used in the error message (e.g. "guild_id").
 * @returns The validated ID as a string.
 * @throws {Error} If the value is not a valid snowflake.
 */
export function validateId(value: unknown, label: string): string {
  const id = String(value ?? "");
  if (!/^\d{17,20}$/.test(id)) throw new Error(`Invalid ${label}: "${id}". Must be a Discord snowflake ID (17-20 digits).`);
  return id;
}

/**
 * Converts a PermissionsBitField into a human-readable array of permission names.
 * @param perms - The bitfield to serialize.
 * @returns Array of permission flag names (e.g. ["SendMessages", "ViewChannel"]).
 */
export function serializePermissions(perms: Readonly<PermissionsBitField>): string[] {
  return Object.keys(PermissionsBitField.Flags).filter((flag) =>
    perms.has(flag as keyof typeof PermissionsBitField.Flags)
  );
}
