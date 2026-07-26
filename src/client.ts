import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  GuildChannel,
  Options,
  PermissionsBitField,
  type GuildTextBasedChannel,
} from "discord.js";
import { SWEEP } from "./constants.js";

/**
 * Initializes the Discord.js client with the gateway intents (privileged ones
 * are opt-out via env) and exposes shared helpers used across all tool modules.
 */

// ─── Discord Client ────────────────────────────────────────────────────────────

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

/** Maximum time to wait for the gateway to reach READY before giving up. */
const LOGIN_TIMEOUT_MS = 30_000;

/**
 * Reads a boolean env flag, defaulting to `true`. Set to false/0/no/off to disable.
 * Used to opt out of the two privileged intents when they are not enabled in the
 * Discord Developer Portal (otherwise the gateway closes with code 4014 on connect).
 */
function envEnabled(name: string): boolean {
  const value = process.env[name];
  return value === undefined || !/^(false|0|no|off)$/i.test(value.trim());
}

const messageContentEnabled = envEnabled("DISCORD_MESSAGE_CONTENT");
const guildMembersEnabled = envEnabled("DISCORD_GUILD_MEMBERS");

export const discord = new Client({
  // No GuildMessages: nothing consumes MessageCreate, yet it caches every message plus
  // its author. GuildMembers must stay — GUILD_MEMBER_REMOVE is the only eviction event.
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildScheduledEvents,
    ...(messageContentEnabled ? [GatewayIntentBits.MessageContent] : []),
    ...(guildMembersEnabled ? [GatewayIntentBits.GuildMembers] : []),
  ],
  rest: { retries: 3, timeout: 15_000 },
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: SWEEP.messages,
    threads: SWEEP.threads,
    users: {
      interval: SWEEP.users.interval,
      filter: () => (user) => user.id !== user.client.user?.id,
    },
    guildMembers: {
      interval: SWEEP.guildMembers.interval,
      filter: () => (member) => member.id !== member.client.user?.id,
    },
    // Nothing reads guild.invites.cache back, and fetch() never clears stale entries.
    invites: { interval: SWEEP.invites.interval, filter: () => () => true },
  },
});

let discordReady = false;
let loginPromise: Promise<void> | null = null;

// Without an 'error' listener, an emitted client error crashes the Node process.
discord.on(Events.Error, (err) => console.error("Discord client error:", err.message));
discord.on(Events.ShardError, (err) => console.error("Discord shard error:", err.message));
discord.on(Events.Invalidated, () => {
  console.error(
    "Discord session invalidated — connection is dead; the next tool call will re-login.",
  );
  discordReady = false;
  loginPromise = null;
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Lazily connects to Discord on first tool call.
 * Allows the MCP server to start and respond to ListTools without a connection.
 */
export async function ensureConnected(): Promise<void> {
  if (discordReady) return;
  // A late READY (after the 30s timeout cleared the listener) must not wedge the
  // server forever: trust the client state, not only our flag.
  if (discord.isReady()) {
    discordReady = true;
    return;
  }

  if (!DISCORD_TOKEN) {
    throw new Error("DISCORD_TOKEN is required. Set it in your MCP client config or a .env file.");
  }

  // Cleared only once the attempt settles: a second login replays every guild into the caches.
  if (!loginPromise) {
    loginPromise = (async () => {
      let timer: NodeJS.Timeout | undefined;
      let onReady!: () => void;
      const ready = new Promise<void>((resolve, reject) => {
        onReady = () => {
          clearTimeout(timer);
          resolve();
        };
        timer = setTimeout(() => {
          discord.off(Events.ClientReady, onReady);
          reject(
            new Error(
              `Discord did not reach READY within ${LOGIN_TIMEOUT_MS / 1000}s. Check the token and that the Server Members / Message Content privileged intents are enabled in the Developer Portal, or disable them via DISCORD_GUILD_MEMBERS=false / DISCORD_MESSAGE_CONTENT=false.`,
            ),
          );
        }, LOGIN_TIMEOUT_MS);
        discord.once(Events.ClientReady, onReady);
      });
      ready.catch(() => {});

      try {
        await discord.login(DISCORD_TOKEN);
      } catch (err) {
        clearTimeout(timer);
        discord.off(Events.ClientReady, onReady);
        throw new Error(`Discord login failed: ${(err as Error).message}`, { cause: err });
      }
      await ready;
      discordReady = true;
      console.error(`✅  Discord bot connected as ${discord.user?.tag}`);
    })();
    loginPromise.catch(() => {
      loginPromise = null;
    });
  }

  await loginPromise;
}

/** Reads DISCORD_ALLOWED_GUILDS lazily so module import order cannot freeze an empty list. */
function allowedGuilds(): string[] {
  return (process.env.DISCORD_ALLOWED_GUILDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

/** True when DISCORD_ALLOWED_GUILDS contains at least one guild ID. */
export function allowListActive(): boolean {
  return allowedGuilds().length > 0;
}

/** True if the guild is in DISCORD_ALLOWED_GUILDS — or when no allow-list is configured (empty list allows all guilds). */
export function isGuildAllowed(guildId: string): boolean {
  const list = allowedGuilds();
  return list.length === 0 || list.includes(guildId);
}

/**
 * Central allow-list gate for resources reached without a guild_id input
 * (channel/thread/webhook IDs resolve to a guild only after fetching).
 */
export function assertAllowedGuild(guildId: string | null | undefined): void {
  if (guildId && !isGuildAllowed(guildId))
    throw new Error(`Guild ${guildId} is not in the DISCORD_ALLOWED_GUILDS allow-list.`);
}

/** Fetches a channel and enforces the guild allow-list before returning it. */
export async function fetchChannelChecked(channelId: string, force = false) {
  const channel = await discord.channels.fetch(channelId, { force });
  if (channel && "guildId" in channel) assertAllowedGuild(channel.guildId);
  return channel;
}

/**
 * Fetches a channel by ID and guarantees it is a guild channel that holds
 * messages: text, announcement, voice/stage text, or a thread of any kind.
 * @param channelId - Discord snowflake ID of the channel.
 * @throws {Error} If the channel does not exist or is not a message-capable guild channel.
 */
export async function getTextChannel(channelId: string): Promise<GuildTextBasedChannel> {
  const id = validateId(channelId, "channel_id");
  const channel = await fetchChannelChecked(id);
  if (!channel || channel.isDMBased() || !channel.isTextBased())
    throw new Error(`Channel ${id} is not a message-capable guild channel or doesn't exist.`);
  return channel;
}

/**
 * Fetches a channel by ID and guarantees it is a non-thread guild channel
 * (text, voice, category, announcement, stage, forum…).
 * @param channelId - Discord snowflake ID of the channel.
 * @throws {Error} If the channel does not exist or is not a guild channel.
 */
export async function getGuildChannel(channelId: string): Promise<GuildChannel> {
  const id = validateId(channelId, "channel_id");
  const channel = await fetchChannelChecked(id);
  if (!channel || !(channel instanceof GuildChannel))
    throw new Error(`Channel ${id} is not a guild channel or doesn't exist.`);
  return channel;
}

/**
 * Parses permission flag names from an array or a JSON-encoded array string
 * (some MCP clients serialize arrays), validating every name against
 * PermissionsBitField.Flags so unknown flags fail with the culprit named.
 */
export function parsePermissionNames(value: string[] | string | undefined): string[] {
  if (value === undefined) return [];
  let names: unknown = value;
  if (typeof value === "string") {
    try {
      names = JSON.parse(value);
    } catch {
      throw new Error(
        `Invalid permission list: "${value}" is not a JSON array. Pass an array like ["SendMessages"].`,
      );
    }
  }
  if (!Array.isArray(names) || !names.every((n) => typeof n === "string"))
    throw new Error("Invalid permission list: expected an array of permission flag names.");
  for (const name of names) {
    if (!(name in PermissionsBitField.Flags))
      throw new Error(
        `Unknown permission flag: "${name}". Use Discord PermissionsBitField flag names like "SendMessages".`,
      );
  }
  return names;
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
  if (!/^\d{17,20}$/.test(id))
    throw new Error(`Invalid ${label}: "${id}". Must be a Discord snowflake ID (17-20 digits).`);
  return id;
}

/**
 * Converts a PermissionsBitField into a human-readable array of permission names.
 * @param perms - The bitfield to serialize.
 * @returns Array of permission flag names (e.g. ["SendMessages", "ViewChannel"]).
 */
export function serializePermissions(perms: Readonly<PermissionsBitField>): string[] {
  return Object.keys(PermissionsBitField.Flags).filter((flag) =>
    perms.has(flag as keyof typeof PermissionsBitField.Flags),
  );
}

/**
 * Builds a PermissionsBitField from an array of permission flag names.
 * Inverse of {@link serializePermissions}.
 * @param names - Permission flag names (e.g. ["SendMessages", "ViewChannel"]).
 * @returns A PermissionsBitField with those flags set.
 */
export function deserializePermissions(names: string[]): PermissionsBitField {
  return new PermissionsBitField(
    names.map((p) => PermissionsBitField.Flags[p as keyof typeof PermissionsBitField.Flags]),
  );
}
