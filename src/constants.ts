/** Shared constants used across tool modules. */

/** Per-fetch cap for most Discord list endpoints (messages, reactions, events); members/bans use DEFAULTS.MEMBERS_MAX. */
export const MAX_FETCH_LIMIT = 100;

/** Per-fetch cap for the channel pins endpoint, which is half the usual list cap. */
export const MAX_PINS_LIMIT = 50;

/** Default and maximum fetch limits by context. */
export const DEFAULTS = {
  MESSAGES: 20,
  MEMBERS: 50,
  MEMBERS_MAX: 1000,
  LIMIT: 25,
} as const;

/** Valid auto-archive durations in minutes. */
export const AUTO_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080] as const;

/**
 * Sweep intervals and lifetimes, in seconds. Sweepers rather than `makeCache` limits:
 * bounding GuildManager, ChannelManager, GuildChannelManager, RoleManager or
 * PermissionOverwriteManager breaks them (UnsupportedCacheOverwriteWarning).
 */
export const SWEEP = {
  messages: { interval: 300, lifetime: 900 },
  users: { interval: 600 },
  guildMembers: { interval: 900 },
  threads: { interval: 600, lifetime: 3600 },
  invites: { interval: 900 },
} as const;
