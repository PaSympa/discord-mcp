# Changelog

## [Unreleased]

### Added

- `discord_list_channel_threads` lists the threads in a text or announcement channel: every active thread plus paginated archived ones, public or private, each flagged with whether it is private. `discord_create_thread` could already start a thread there, but only `discord_list_forum_threads` could enumerate any, and it covers forums alone, so a thread created outside a forum could not be found again without already knowing its id. The result uses the same `hasMore` and `nextBefore` shape as `discord_list_forum_threads`. Contributed by [@nobel6018](https://github.com/nobel6018) in [#123](https://github.com/PaSympa/discord-mcp/pull/123)

### Fixed

- The archived-threads `limit` floor is 2, not 1. Discord answers `limit: 1` with `400 limit[NUMBER_TYPE_MIN]: int value should be greater than or equal to 2`, and the floor is absent from the endpoint's documented query parameters, so `discord_list_forum_threads` advertised a value the API rejects. Contributed by [@nobel6018](https://github.com/nobel6018) in [#123](https://github.com/PaSympa/discord-mcp/pull/123)

## [2.2.0] - 2026-09-03

### Added

- `discord_read_messages` accepts the `before`, `after` and `around` cursors Discord's messages endpoint supports, plus a `since` convenience, so a channel can be read past the 100-message per-call cap. Page backwards by re-calling with `before` set to the id of the oldest message received; `since` takes an ISO 8601 date or a date-time with an explicit offset and is converted to the equivalent `after` snowflake. At most one cursor per call, matching Discord's endpoint, and instants before the Discord epoch or in the future clamp to those bounds rather than sending an invalid id. Contributed by [@nobel6018](https://github.com/nobel6018) in [#110](https://github.com/PaSympa/discord-mcp/pull/110)
- `discord_get_message_attachments` lists a message's file attachments: filename, original title (Discord strips non-ASCII characters from the filename), download url, content type, size, image dimensions, alt-text description, voice-message duration and waveform, spoiler flag. Discord signs attachment CDN urls with a 24-hour expiry and does not re-sign on every fetch; re-call the tool if a stored url has expired. Contributed by [@nobel6018](https://github.com/nobel6018) in [#117](https://github.com/PaSympa/discord-mcp/pull/117)
- `discord_search_guild_messages` searches every channel of a guild through Discord's search index and returns the matches with their channel; `discord_search_messages` stays the channel-scoped scan. Contributed by [@tavurth](https://github.com/tavurth) in [#100](https://github.com/PaSympa/discord-mcp/pull/100), with the allow-list check and cached channel names from [#103](https://github.com/PaSympa/discord-mcp/pull/103)

### Changed

- `discord_set_role_permission` warns in its description that denying View Channel to @everyone also locks the bot out unless it holds an allow overwrite of its own
- `discord_get_server_stats` describes `botsInCache` as a lower bound and `humans` as an upper bound, since both come from a member cache that is swept
- Error messages no longer contain an em dash: validation failures read `Invalid arguments. field: reason` (the separator was an em dash) and Discord API hints follow the code and status after a period. The eleven tool descriptions that carried one are reworded the same way

### Security

- npm audit is clean again: fast-uri 3.1.7 (four high advisories) and qs 6.16.0 (two moderate), both transitive through the MCP SDK, resolve within semver

## [2.1.1] - 2026-08-04

### Security

- npm audit is clean for the first time: the two @hono/node-server moderates accepted since June are resolved by MCP SDK 1.30.0 widening its dependency range, and six freshly published transitive advisories (undici, ip-address, fast-uri, hono, @hono/node-server, brace-expansion) are fixed within semver

### Fixed

- Long-running servers no longer grow without bound. The `GuildMessages` intent is no longer requested (nothing subscribes to `MessageCreate`, yet it cached every message together with its author `User` and `GuildMember`), sweepers are configured for the caches tool calls fill (`users`, `guildMembers`, `messages`, `invites`, plus a tightened `threads`), and a login timeout can no longer start a second login that respawns the shard and replays every guild into the caches. Reported by [@Quentin-M](https://github.com/Quentin-M) in [#89](https://github.com/PaSympa/discord-mcp/pull/89), whose production data (~52 GB/day per container) made the diagnosis possible
- `discord_list_roles` reports real member counts from the API instead of counting whatever happened to be cached, which was frequently zero (closes [#82](https://github.com/PaSympa/discord-mcp/issues/82))
- `discord_audit_permissions` resolves member names from its own fetch results, so a cache sweep can no longer blank them mid-report
- `discord_get_role_members` accumulates each page as it is fetched instead of re-reading a cache that a sweep can empty between pages
- `discord_get_forum_post` reports a current message count instead of a stale one
- Message fetches no longer populate the per-channel message cache, so `discord_get_reactions` and `discord_remove_reactions` read a fresh reaction snapshot instead of one frozen at first fetch. Contributed by [@Quentin-M](https://github.com/Quentin-M) in [#89](https://github.com/PaSympa/discord-mcp/pull/89)

## [2.1.0] - 2026-07-13

### Changed

- Tool inputs reject unknown argument keys instead of silently stripping them, and every `inputSchema` advertises `additionalProperties: false`. Callers passing extra keys now get `Invalid arguments — Unrecognized key: "…"`
- The Docker image runs on Node 26 (was Node 24)

### Added

- The Docker image is declared in the MCP Registry manifest (`server.json` OCI package) and carries the `io.modelcontextprotocol.server.name` label the registry requires; the registry publish job now waits for the Docker push
- The npm tarball ships `SECURITY.md` and the `Dockerfile`, so tarball-based security scanners see the security policy and the container option

## [2.0.0] - 2026-06-21

### Breaking

- Every tool input is validated by a zod schema that also derives the advertised `inputSchema` (single source of truth). Numeric inputs are strictly bounded: out-of-range, non-integer, or string numbers are rejected with a clear error instead of being coerced/clamped
- Embed and role colors are hex-only (`#RRGGBB`); named colors ("Red") and raw integers are rejected
- All URL inputs must be `http(s)` (`javascript:`, `ftp:`, … rejected); the constraint is advertised as a `pattern` in the schema
- Scheduled-event datetimes must be ISO 8601 with an explicit offset or `Z`; offset-less strings are rejected, and event `entity_type`/`status` enums are case-sensitive uppercase (`status` no longer accepts `SCHEDULED` — no transition back to it exists)
- `discord_delete_channel` and `discord_bulk_delete_messages` are safe-by-default: `dry_run` defaults to `true` (advertised in the schema), so existing callers preview instead of deleting until they pass `dry_run:false`. The bulk-delete dry run reports the real deletable count (14-day rule applied)
- Unknown tool names and unexpected `tools/list` cursors are JSON-RPC protocol errors (`-32602`) instead of `isError` results, and validation failures surface as `Invalid arguments — field: message`
- Read tools (32) now advertise `outputSchema` and return `structuredContent`; conforming outputs are normalised (unknown keys dropped) and non-conforming output is converted to an error instead of being shipped. `discord_fetch_webhook_message` `timestamp` is an ISO string (was mistyped as a number)
- `discord_set_nickname` now requires the `nickname` field (string or null) — omitting it used to silently clear the nickname; `discord_bulk_ban` caps `user_ids` at 200 (Discord API limit) and `discord_set_role_position` requires `position >= 1` (and rejects positions above the server's highest role instead of silently doing nothing)
- `discord_set_role_icon` requires at least one of `icon`/`unicode_emoji` (both omitted used to report success without doing anything); `discord_create_event_invite` rejects `channel_id` on non-EXTERNAL events (it was silently ignored); embed arrays advertise and enforce `maxItems: 10`; invalid permission flag names are rejected with the culprit named instead of crashing with an opaque internal error
- The `events` toolset is renamed `scheduled_events`
- Node 20 support dropped (`engines: ">=22.0.0"`) — Node 20 reached end-of-life on 2026-04-30 and no longer receives security fixes

### Added

- `DISCORD_MCP_TOOLSETS`: expose only selected toolsets (comma-separated, case-insensitive, `all` keyword). Unknown names abort startup instead of silently exposing all 97 tools
- `DISCORD_ALLOWED_GUILDS`: guild allow-list enforced at the schema for `guild_id` inputs AND centrally on every channel/thread/webhook/invite fetch, so channel-addressed calls cannot bypass it (token-webhook flows verify the webhook's guild when the list is active)
- `DISCORD_MESSAGE_CONTENT` / `DISCORD_GUILD_MEMBERS`: opt out of the privileged gateway intents at connect time (avoids the 4014 startup failure when the portal toggles are off; REST data access is governed by the portal toggles alone)
- O(1) tool dispatch with duplicate-name detection at load (cross-module and within-module)

### Fixed

- Message tools (read, delete, pin, search…) now work in announcement channels, which the channel guard previously rejected
- A Discord READY arriving after the 30s login timeout no longer wedges the server permanently

## [1.7.3] - 2026-06-11

### Fixed

- Security: refreshed the dependency lockfile (8 npm audit findings → 0, including `ws` — the websocket library on the gateway hot path). npm consumers always resolved fresh in-range dependencies and were unaffected; the Docker image embeds the lockfile, so this release rebuilds it with the patched versions
- Release pipeline: the Docker publish job now requires the npm job (lint, tests, tag↔version guard) instead of publishing unconditionally on any tag

## [1.7.2] - 2026-06-10

### Fixed

- MCP Registry namespace case: GitHub OIDC grants publish rights on `io.github.PaSympa/*` (exact GitHub account casing), but `mcpName` / `server.json` used lowercase `io.github.pasympa`, so the registry publish of 1.7.1 was rejected with a 403. Both now use `io.github.PaSympa/discord-mcp`

## [1.7.1] - 2026-06-10

### Added

- Published to the official MCP Registry (registry.modelcontextprotocol.io), surfaced on the GitHub MCP Registry (github.com/mcp): `mcpName` ownership marker in `package.json` and a `server.json` registry manifest
- Release workflow now publishes to the MCP Registry automatically (GitHub OIDC, no extra secrets) after the npm publish, and guards that the pushed tag matches `package.json`
- `npm version` now syncs `server.json` automatically, so a single `npm version patch|minor|major` keeps every version location aligned

## [1.7.0] - 2026-05-29

### Fixed

- `discord_get_role_members` no longer silently truncates at 1000 members. Discord has no "members of a role" endpoint, so it now paginates the full roster (1000/page, capped at 20 pages) before filtering, and returns a `truncated` flag when the cap is hit on very large servers
- `discord_list_bans` is now paginated. A single fetch only ever returned the first page (≤1000) while the description claimed it fetched all; it now returns `{ bans, nextCursor }` and accepts an `after` cursor
- `discord_fetch_pinned_messages` migrated from the deprecated `MessageManager#fetchPinned()` (removed in discord.js v15) to `fetchPins()`, and now also returns `pinnedAt`
- `discord_timeout_member` and `discord_prune_members` validate their numeric inputs (`duration_minutes`, `days`) instead of casting blindly, rejecting NaN / out-of-range values with a clear error

### Changed

- Renamed the `ready` gateway listener to `clientReady` — forward-compatible with discord.js v15 (where `ready` no longer fires) and silences the v14 deprecation warning
- Connection robustness: login now races a 30s READY timeout (no more indefinite hangs), resets its in-flight state on failure so the next call retries, and registers `error` / `shardError` / `invalidated` listeners (an unhandled client error could previously crash the process). REST retries/timeout configured; process-level `unhandledRejection` / `uncaughtException` handlers added
- Tool errors now surface the underlying `DiscordAPIError` code + HTTP status with a plain-language hint (e.g. 50013 → missing permission, 10008 → unknown message) instead of a bare message
- Cursor pagination on large lists: `discord_list_members`, `discord_get_event_subscribers`, and `discord_list_forum_threads` now return a cursor (`nextCursor` / `nextBefore` + `hasMore`) and accept `after` / `before` to page, instead of silently returning only the first page. These tools now return an object (`{ items, nextCursor }`) rather than a bare array
- Uniform snowflake validation: `getTextChannel` / `getGuildChannel` validate `channel_id` internally, and `user_id` / `role_id` are validated in the member and role tools (and `discord_delete_channel`), so malformed IDs give a clear error instead of an opaque API failure
- Numeric inputs (`limit`, `count`, `delete_message_days`, audit-log/forum/DM limits, …) are coerced and clamped via shared `clampInt` / `validateInt` helpers, preventing NaN from reaching the Discord API
- Read-only message fetches (`discord_read_messages`, `discord_search_messages`) pass `{ cache: false }` to avoid unbounded message-cache growth
- `discord_bulk_ban` is now safe-by-default with a `dry_run` flag (previews the resolved user IDs; set `dry_run:false` to actually ban), mirroring `discord_prune_members`, and validates each user ID

## [1.6.2] - 2026-05-29

### Fixed

- `discord_get_reactions` / `discord_remove_reactions` now resolve custom emoji passed as `name:id`. The reaction cache is keyed by the emoji id (custom) or the unicode char (standard) — not the `name:id` form the tool schema accepts — so custom-emoji lookups previously failed with "No reaction found" even when the reaction existed. A new `findReaction()` helper normalizes the emoji to the cache key (handles `name:id`, `<:name:id>`, `<a:name:id>`, raw id, and unicode) (#25)
- The role tools (`discord_edit_role`, `discord_delete_role`, `discord_get_role_members`, `discord_set_role_position`, `discord_set_role_icon`) now return a clear "Role not found" error for an unknown `role_id` instead of crashing on a null dereference — removed the misleading `as Role` cast that hid the `| null` return of `guild.roles.fetch()` (#25)

### Changed

- Dropped the unused `GuildModeration` and `GuildInvites` gateway intents. All ban/invite operations are REST-only and no code subscribes to their gateway events, so requesting them only widened the gateway footprint. `MessageContent`, `GuildMembers`, and `GuildScheduledEvents` are kept (actually consumed) (#25)
- Extracted a shared `buildEmbed()` + `EMBED_FIELD_PROPS` into `src/embeds.ts`, removing three drifting copies across the message, DM, and webhook tools (#25)
- Added a `deserializePermissions()` helper (inverse of `serializePermissions`), reused by `discord_create_role` and `discord_edit_role` instead of an inline `PermissionsBitField` expression duplicated twice (#25)

## [1.6.1] - 2026-05-29

### Fixed

- `discord_pin_message` description no longer claims "Requires the Manage Messages permission". Discord introduced a dedicated **Pin Messages** permission in early 2026 (separate from Manage Messages), and discord.js dropped the Manage Messages check from `Message#pinnable`. The tool now points at the correct permission so the model expects the right one (#21)

## [1.6.0] - 2026-05-28

### Added

- MCP tool `annotations` on all 97 tools (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, `title`) so clients can apply safety policies and parallelize read-only calls
- `ToolAnnotations` type and optional `annotations` field on `ToolDefinition`

### Changed

- Enriched every tool description with usage guidance, required Discord permissions, side effects / destructive behavior, and return value — improving agent reliability and directory tool-definition-quality scores
- Documented every input-schema parameter (100% coverage), including nested embed/field properties, with formats and constraints
- Extracted shared embed schema fragments (`EMBED_FIELD_PROPS`, `WEBHOOK_EMBED_PROPS`) to keep repeated definitions in sync
- CONTRIBUTING: documented the tool-definition quality bar (description, annotations, parameter docs)

## [1.5.1] - 2026-05-27

### Fixed

- `getTextChannel` now accepts `ThreadChannel` (forum / public / private / announcement threads) in addition to `TextChannel`, unblocking all message tools on threads: `discord_edit_message`, `discord_delete_message`, `discord_add_reaction`, `discord_read_messages`, `discord_pin_message`, `discord_fetch_pinned_messages`, `discord_bulk_delete_messages`, `discord_search_messages`, `discord_send_embed`, `discord_edit_embed`, `discord_send_multiple_embeds`, `discord_forward_message` (#17, #18)
- `discord_create_thread` now throws a clear error if the parent `channel_id` is itself a thread (standalone thread creation requires a `TextChannel`; use `message_id` to start a thread from a message instead)

## [1.5.0] - 2026-05-04

### Added

- Full DM toolset (6 new tools, 97 total): `discord_send_dm_embed`, `discord_edit_dm`, `discord_edit_dm_embed`, `discord_delete_dm`, `discord_read_dms`, `discord_reply_dm`
- All DM tools take `user_id` directly and are self-contained in `dm.ts`

## [1.4.1] - 2026-04-06

### Added

- `discord_send_dm` tool for sending direct messages by user ID (auto-creates DM channel)
- Input validation (`validateId`) on DM tool

### Changed

- README: DM tool section, tool count bumped to 91, project structure updated

### Fixed

- Removed `dist/` from git tracking (now in `.gitignore`)

## [1.4.0] - 2025-03-25

### Added

- 20 new tools enhancing existing categories (90 total)
- Messages: crosspost, remove/get reactions, fetch pinned, forward
- Members: search, set nickname, list bans, bulk ban, prune
- Webhooks: edit/delete/fetch webhook messages
- Channels: set position, follow announcement, lock permissions, NSFW flag
- Roles: set position, set icon
- Invites: list channel-specific invites
- Scheduled Events: create event invite

### Fixed

- `discord_list_bans` now handles empty ban lists gracefully

## [1.3.0] - 2025-03-24

### Added

- 10 new tools (70 total)
- Scheduled Events: list, get, create, edit, delete, get subscribers (6 tools)
- Invites: list, get, create, delete (4 tools)
- `GuildScheduledEvents` and `GuildInvites` gateway intents

## [1.2.0] - 2025-03-20

### Added

- Forum tools: 10 tools for forum channels, posts, tags, threads
- Webhook tools: 5 tools for webhook management
- Docker support with multi-stage build
- Glama badge for MCP server listing

## [1.1.0] - 2025-03-18

### Added

- Initial release with 60 tools
- Messages, channels, roles, permissions, moderation, screening, stats
