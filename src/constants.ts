/** Shared constants used across tool modules. */

/** Maximum number of items the Discord API returns per fetch. */
export const MAX_FETCH_LIMIT = 100;

/** Default fetch limits by context. */
export const DEFAULTS = {
  MESSAGES: 20,
  MEMBERS: 50,
  MEMBERS_MAX: 1000,
  LIMIT: 25,
} as const;

/** Valid auto-archive durations in minutes. */
export const AUTO_ARCHIVE_DURATIONS = [60, 1440, 4320, 10080] as const;
