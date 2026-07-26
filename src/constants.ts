/** Shared constants used across tool modules. */

/** Per-fetch cap for most Discord list endpoints (messages, reactions, events); members/bans use DEFAULTS.MEMBERS_MAX. */
export const MAX_FETCH_LIMIT = 100;

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
 * Bounded cache sizes for the Discord.js client.
 *
 * discord.js defaults to near-unlimited caches (500K guilds, 10K messages/channel,
 * unlimited channels/roles). For an MCP server that fetches data on-demand with
 * `cache: false` on most reads, these bounds keep memory predictable while
 * retaining hot data for repeated tool calls within a session.
 *
 * Keys match the cache manager names used by Options.cacheWithLimits().
 * Non-configurable caches (GuildManager, ChannelManager, RoleManager) are
 * commented out in discord.js's Caches interface but still use the makeCache
 * factory at runtime — they are included here and cast at the call site.
 *
 * Sizes are intentionally tight — the MCP request/response cycle is stateless,
 * so cache hits across calls are rare. LRU eviction handles the rest.
 */
export const CACHE_LIMITS = {
  // Non-configurable via CacheWithLimitsOptions (commented out in Caches interface)
  GuildManager: 100,
  ChannelManager: 100,
  RoleManager: 200,
  // Configurable caches
  MessageManager: 1000,
  GuildMessageManager: 1000,
  GuildMemberManager: 500,
  PresenceManager: 0,
  GuildBanManager: 100,
  GuildEmojiManager: 100,
  GuildStickerManager: 100,
  GuildScheduledEventManager: 100,
  ThreadManager: 100,
  ThreadMemberManager: 100,
  ReactionManager: 0,
  ReactionUserManager: 0,
  StageInstanceManager: 100,
  VoiceStateManager: 100,
  UserManager: 100,
  EntitlementManager: 100,
  AutoModerationRuleManager: 0,
  ApplicationCommandManager: 100,
  ApplicationEmojiManager: 100,
  BaseGuildEmojiManager: 100,
  GuildInviteManager: 100,
  DMMessageManager: 100,
  GuildForumThreadManager: 100,
  GuildTextThreadManager: 100,
} as const;
