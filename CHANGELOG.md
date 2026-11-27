# Changelog

## [Unreleased]

### Added

- `discord_bulk_add_role`, `discord_bulk_remove_role`, `discord_bulk_delete_messages` and `discord_create_thread` with `member_ids` send MCP progress notifications when the client passes a `progressToken`, over stdio and HTTP. A notification follows each member or message, counted out of all those the call acts on, Discord's refusals included, and a bulk delete request counts all its messages at once. Progress is for display only: the 40-second time budget and `remaining` work as before
- `discord_delete_channel`, `discord_bulk_delete_messages`, `discord_bulk_ban`, `discord_prune_members`, `discord_bulk_add_role` and `discord_bulk_remove_role` ask the user to confirm a call with `dry_run: false` before they change anything, over stdio, when the client declares form elicitation. The question sums up the call as its preview would: the channel, the number of messages and how many are older than 14 days, the number of users to ban, Discord's prune estimate with the days and roles, or the members a role change affects and those it leaves out. Only an answer with `confirm` set to `true` goes ahead. A decline, a cancel, `confirm` left false, no answer within 45 seconds or an error from the client ends the call with an `isError` result that says nothing was changed. The 40-second time budget of the batch tools starts after the answer. A role change or a bulk delete with nothing left to change does not ask. Clients that declare no form elicitation, URL elicitation only included, and HTTP mode keep today's behavior, and `tools/list` is unchanged. The plugin's moderation-sweep skill reports a call the user did not confirm instead of calling again
- `DISCORD_MCP_CONFIRM=false` turns the confirmation off, for runs where no one can answer, such as `claude -p` without an `Elicitation` hook. It defaults to `true` and takes true/false, 1/0, yes/no or on/off; any other value stops the server at startup. The Claude Code plugin and the Claude Desktop bundle offer it as the Confirm destructive calls setting

### Changed

- The server runs on the MCP TypeScript SDK v2 packages, `@modelcontextprotocol/server` 2.4 and `@modelcontextprotocol/node` 2.1, instead of `@modelcontextprotocol/sdk` 1.32. It keeps the low-level server, the stdio transport and the stateless HTTP transport, and `tools/list` is unchanged. Two error responses change on the wire. The `Unknown tool` and `Invalid cursor` errors keep code `-32602` but lose their `MCP error -32602: ` prefix. A `tools/call` whose `params` fail the MCP schema, such as missing `params`, a missing or non-string `name`, or `arguments` that is not an object, now gets `-32602` with `Invalid tools/call request: ` before the validation issues, instead of `-32603` with the bare issues. Other methods keep their error codes. When several requests arrive in one stdio read or one HTTP batch, their responses can come in a different order than before, with the same content. Requests sent one after another are answered in the same order as before, and JSON-RPC clients match responses by `id`. The production dependency tree drops from 118 installed packages to 32, without express, ajv or cors. The v2 packages are licensed Apache-2.0, where `@modelcontextprotocol/sdk` was MIT
- On stdio, once the server can no longer write to stdout, it stops reading requests instead of handling requests whose answers it cannot send. Tool calls still running at that point are cancelled through their abort signal, where they used to run to the end. It still exits once the client closes stdin, after the 5-second grace period
- In HTTP mode, a request body that is not valid JSON or not JSON-RPC is logged with the text of its 400 reply, as before. The SDK's parse error, which can quote the body, is not logged
- The plugin and the Docker image show the same name as the bundle and the MCP Registry, `discord-mcp`. The plugin's `displayName` and README title were Discord MCP (community), and the image's `org.opencontainers.image.title` label was Discord MCP Server

### Fixed

- `discord_timeout_member`, `discord_edit_embed`, `discord_edit_dm_embed`, `discord_edit_webhook_message` and `discord_set_forum_tags` are annotated `idempotentHint: false`. Repeating the same call moves a timeout's end or an embed's `timestamp` to the new time, and recreates under a new ID a forum tag whose name has a leading or trailing space, since Discord trims the name
- `discord_send_embed`, `discord_edit_embed`, `discord_send_multiple_embeds`, `discord_send_dm_embed`, `discord_edit_dm_embed`, `discord_send_webhook_message` and `discord_edit_webhook_message` refuse an embed text longer than Discord allows, and the error names the field. The limits are 256 characters for `title`, a field's `name` and `author.name`, 4096 for `description`, 1024 for a field's `value` and 2048 for `footer`, and `tools/list` advertises them as `maxLength`. Most emoji count as 2 characters, as discord.js counts them. The error used to say only "Received one or more errors"
- With `DISCORD_ALLOWED_GUILDS` set, `discord_delete_channel` refuses the DM channel of a user who is not a member of any listed guild, as the `dm` tools do, in a dry run too. It used to close that DM. It also refuses a group DM, whose recipients it cannot check
- `discord_list_channels` leaves active threads out of the category grouping. A thread used to be listed under a key named after its parent channel, which could merge with a real category of the same name. Threads remain available through `discord_list_channel_threads`. Contributed by [@prascli](https://github.com/prascli) in [#223](https://github.com/PaSympa/discord-mcp/pull/223)
- `discord_list_channels` no longer merges two categories with the same name. When a name repeats, each of those categories is keyed by its name and ID, such as `Events (123456789012345678)`. A category named `No Category` or `Hidden parent` gets its ID too, so its channels no longer mix with the channels outside a category or under a hidden one
- `discord_list_roles` lists only the permission flags set on each role. A role with Administrator used to list every flag. `discord_get_member_info` still lists every flag for an Administrator, as its description says
- `discord_set_channel_position` says when the order stays unchanged. For a position at or past the number of channels in the channel's group, it gives that number and says the channel kept its place. It used to say the channel moved
- The 30-second connection timeout also covers the Discord login itself. A login that never answered left every tool call waiting with no error. After 30 seconds the call now fails with the "did not reach READY" error. The login keeps running, and a later call uses it once it ends
- `discord_list_channels`, `discord_find_channel_by_name` and the `total` of `discord_get_server_stats` include channels of a type discord.js does not know yet, such as type 20. They used to be left out. Their `type` reads `Unknown(20)`, and `discord_list_channels` lists them under their category, after the known channels. The first two tools then read the channel list twice
- `discord_clone_channel` refuses a `new_name` longer than 100 characters before any call, as `discord_create_channel` and `discord_edit_channel` do, and `tools/list` advertises the limit as `maxLength`

## [2.5.0] - 2026-11-25

### Added

- A documentation site at https://pasympa.github.io/discord-mcp/: a guide from creating the bot to the first prompts, seven recipes, every configuration variable with its plugin and bundle setting, troubleshooting, a privacy page, the tool catalog and the toolset builder. It is generated from the README and the tool definitions, and `.github/workflows/pages.yml` deploys it on each push to `main`
- An Install in Claude Desktop button in the README and on the site. It downloads `discord-mcp.mcpb` from the latest GitHub Release
- The Claude Code plugin has an icon, a README, and the `displayName`, `documentationUrl`, `supportUrl` and `privacyPolicyUrl` fields a plugin directory reads
- `discord_bulk_add_role` and `discord_bulk_remove_role` add or remove one role for up to 50 members in one call, as a dry run by default. Both refuse @everyone, a managed role, a role not below the bot's highest role and a bot without Manage Roles before any change. The dry run sorts the users into `would_change`, `skipped` and `not_member`. A real call sorts them again, changes only the members who need it, and returns `done`, `failed` and `remaining`. Discord allows about 10 role changes per 10 seconds, so a call stops after about 40 seconds and returns the members it did not reach in `remaining`
- `discord_create_thread` takes `private: true` to create a standalone private thread, visible only to its members and moderators, and `invitable` to choose whether members without Manage Threads can add others. `member_ids` adds up to 50 people in the same call, within the call's 40-second time budget. A refused add is reported and leaves the thread in place, and a refusal that would fail every add, such as Missing Permissions, stops the adds. The result always gives the thread's ID first, then how many members were added and which ones Discord refused. When the adds stop early, it also lists the members not reached and the reason, and says to add them with `discord_add_thread_member`. `private` refuses `message_id`, since Discord branches only public threads from a message. The README invite link adds Create Private Threads. Contributed by [@thangnm93](https://github.com/thangnm93) in [#200](https://github.com/PaSympa/discord-mcp/pull/200)
- `discord_add_thread_member` and `discord_remove_thread_member` add and remove a member in any thread, the only way to bring someone into a private thread. Adding a member twice or removing a non-member changes nothing. If Discord refuses a change because the thread is archived, the thread is unarchived and the change retried, and it stays open. If the retry fails, the thread is archived again when Discord allows it, and the error says whether it is still open. An archived thread on which Discord accepts the change stays archived. Contributed by [@thangnm93](https://github.com/thangnm93) in [#200](https://github.com/PaSympa/discord-mcp/pull/200)
- `discord_create_poll`, `discord_get_poll_results`, `discord_end_poll` and `discord_get_poll_voters` create, read, end and list the voters of a native Discord poll, in a new `polls` toolset. A poll takes a question of up to 300 characters, up to 10 answers of 55 characters each and a duration of up to 768 hours. A malformed answer emoji is refused before the call instead of being dropped. `discord_end_poll` only works on the bot's own polls and cannot be undone. On a poll that has already ended or expired, it returns the results and changes nothing. `discord_get_poll_voters` pages with `after` and returns `hasMore` and `nextAfter`. Results are read from Discord, not from the message cache, which can keep an answer's old vote count. The README invite link adds Send Polls. Contributed by [@cryhot](https://github.com/cryhot) in [#144](https://github.com/PaSympa/discord-mcp/pull/144)
- `discord_send_embed` takes an optional `content`, plain text shown above the embed in the same message, as `discord_send_dm_embed` already does

### Changed

- The README and the Configuration page say the server reads `.env` from the folder the client starts it from, not the project root. The banners no longer show a tool count
- The plugin's `moderation-sweep` skill deletes the flagged message IDs with `message_ids`, reports `not_deletable`, and waits out `stopped.retry_after_seconds` before calling again with `remaining`. It says Discord records no audit log reason for `discord_delete_message`. The plugin runs `@pasympa/discord-mcp@2.5.0`
- `homepage` in `package.json`, `manifest.json` and `plugin.json`, and `websiteUrl` in `server.json` and the `initialize` response, point at the documentation site instead of the GitHub repository
- The README links the full one-minute demo hosted on the site, which shows the new logo
- The README says when the plugin's bot token takes effect. If you skip the prompt at install, the server stays off until you set the token with `/plugin configure discord-mcp@pasympa`, and Claude Code needs a restart after the token is set or changed
- The README banners and the social preview name Codex next to Claude, Cursor and VS Code
- `SECURITY.md` describes the HTTP mode: off by default, a required bearer token, loopback by default, and no TLS or OAuth of its own
- The README and the troubleshooting page say the invite link requests the permissions most tools use, not every permission the tools use. The README's Cursor link points at https://cursor.com/docs/mcp. Contributed by [@techkayacodes](https://github.com/techkayacodes) in [#212](https://github.com/PaSympa/discord-mcp/pull/212)
- The README's VS Code and Codex links point at their current MCP pages instead of permanent redirects, and the Install in Cursor button drops `/en/` from its URL
- GitHub release notes leave out Dependabot PRs and PRs labeled `release`, through `.github/release.yml`. CONTRIBUTING says to label the release PR
- `server.json` says to set `DISCORD_MCP_HTTP_HOST` to `0.0.0.0` in the Docker image, since 127.0.0.1 is unreachable from outside the container, and to publish the port on the host loopback only. It used to say to keep 127.0.0.1 unless the server runs in a container, without naming the address to use
- `discord_bulk_delete_messages` deletes exact message IDs. A real call takes `message_ids` and refuses `count`, which now only previews the most recent messages. Both dry runs return `would_delete` with each message's ID, author and age, and `not_deletable` for the messages the bot may not delete: a system message, or another member's without Manage Messages. A dry run with `message_ids` also lists the IDs `not_found` in the channel. The real call looks the IDs up again, never sends one it cannot delete, and returns `deleted`, `not_deletable`, `not_found`, `failed` and `remaining` in structured output. It used to delete the N most recent messages, so a message posted after the preview could be deleted in place of one the preview showed
- `discord_bulk_delete_messages` deletes messages older than 14 days one by one instead of skipping them, and deletes recent ones one by one when Discord refuses the bulk request. A call stops after about 40 seconds, or when the client cancels it, and returns the IDs it did not reach in `remaining` with the reason in `stopped`
- Tool descriptions write the boundary between neighboring tools in both directions. Each one names the tools it can be confused with and says when to use them instead: sending, replying, editing and deleting in channels, DMs and webhooks, threads and forum posts, permission overwrites, roles, sanctions, invites, announcements and polls. A test checks that every tool a description names names it back, and CONTRIBUTING states the rule. The first sentence of each description is unchanged, except `discord_create_thread`, which now names announcement channels, and `discord_bulk_delete_messages`, rewritten for `message_ids`. Some descriptions were wrong or incomplete. `discord_bulk_delete_messages` needs Manage Messages only to delete other members' messages or to use the bulk endpoint. `discord_list_members` and `discord_get_role_members` name the Server Members privileged intent they need, and `discord_list_forum_threads` its View Channel and Read Message History permissions. `discord_edit_message` and `discord_edit_dm` pointed to the embed tools for embed messages, while they change the text and keep the embeds. `discord_crosspost_message` now says a message already published returns a success. `discord_reply_to_forum` and `discord_delete_forum_post` say they accept any thread, and that the second deletes with no dry run, unlike `discord_delete_channel`. The seven `dm` tools say that with `DISCORD_ALLOWED_GUILDS` set, the user must be a member of a listed server. `discord_send_embed` announces its `content`, and `discord_create_thread` names announcement channels and the channels it refuses. The permission clauses of 14 tools are worded so that their page on the site lists every permission they name. `discord_list_bans` and `discord_list_invites` had no permission box, and `discord_get_channel_permissions` now says reading a hidden channel needs View Channel. `discord_send_message`, `discord_reply_message`, `discord_send_embed`, `discord_send_multiple_embeds` and `discord_create_poll` name Send Messages in Threads, which a thread needs instead of Send Messages, and `discord_remove_reactions` names the Read Message History permission its message lookup needs. The full set costs about 42k tokens, against 35k for the 100 tools of 2.4.0, and the README's profile sizes follow
- `discord_get_reactions` pages through every user who reacted, in user ID order. While `hasMore` is true, pass `nextAfter` back as `after` for the next page. It used to return at most 100 users with no way to reach the others. A full page of 100 costs one extra request to tell whether another page exists
- `discord_bulk_delete_messages`, `discord_bulk_add_role` and `discord_bulk_remove_role` return `stopped.retry_after_seconds` when Discord asks them to wait past the call's time budget, and the message says to wait that long before calling again. For messages older than 14 days, Discord allows about 40 single deletes, then asks for a pause of about 2 minutes
- 32 parameters whose text states a Discord limit carry it in their schema, as `maxLength` or `maxItems`, and refuse a longer value before the call reaches Discord. Message text stops at 2000 characters, channel, thread, role, forum post and event names at 100, webhook names at 80, forum tag names at 50 (the text used to say 20, which Discord does not enforce), event descriptions at 1000, and embed `fields` at 25. Characters are counted in code points, as JSON Schema counts `maxLength`, and `discord_set_nickname` counts its 32 characters the same way. The optional text above the embeds of `discord_send_embed`, `discord_send_multiple_embeds`, `discord_send_dm_embed` and `discord_edit_dm_embed` stops at 2000 characters too
- `discord_get_audit_log` advertises `action_type` as an integer from 1, without the list of event IDs it took from discord.js. That list grows with each discord-api-types release, so an npx install and the Docker image of the same version advertised different schemas. Any ID is still accepted, and the parameter's text names the common ones
- CI also tests on Node 26, the version the Docker image runs. A test fails when the Dockerfile moves to a Node version CI does not test, or when CI stops testing the oldest version `engines` accepts
- CONTRIBUTING lists the two files a new toolset also needs: its label in `site/content.json` and its name in the `DISCORD_MCP_TOOLSETS` description of both `server.json` packages. A test checks that `server.json` and the README name every toolset

### Fixed

- `discord_create_poll` counts its 300 and 55 character limits in code points, like the other bounded texts. With zod 4.3, which `package.json` still accepts, an emoji-heavy question the schema allows was refused
- `discord_set_member_permission` no longer fails with "Supplied parameter is not a User nor a Role" for a member missing from the bot's user cache, which is most members from startup and nearly all of them after the 10-minute cache sweep. It refuses a user who is not a member of the channel's server, and `discord_set_role_permission` refuses an ID that is not a role of that server instead of writing a member overwrite
- `discord_create_event_invite` refuses a `channel_id` from a server outside `DISCORD_ALLOWED_GUILDS`, or from any server other than the event's. It used to create the invite in that channel
- `discord_update_membership_screening` and `discord_lock_channel_permissions` are annotated `destructiveHint: true`. Passing `form_fields` to the first deletes any question field, and the second replaces all of the channel's permission overwrites
- The stdio server exits within 5 seconds of its client closing stdin, after finishing the requests it can. An open Discord connection used to keep it running with no client, so processes piled up, for example after dropped SSH sessions. Reported by [@lzrong0203](https://github.com/lzrong0203) in [#83](https://github.com/PaSympa/discord-mcp/pull/83). Contributed by [@Caisusandy](https://github.com/Caisusandy) in [#216](https://github.com/PaSympa/discord-mcp/pull/216)
- A client that closes stderr no longer sends the server into an endless loop that used a full CPU core and answered no further requests. Contributed by [@Caisusandy](https://github.com/Caisusandy) in [#216](https://github.com/PaSympa/discord-mcp/pull/216)
- With `DISCORD_ALLOWED_GUILDS` set, the seven `dm` tools refuse a user who is not a member of any listed guild, before a DM is opened or read. They used to reach any user, such as one the bot meets only in a server outside the list. The check needs no Server Members intent
- `discord_create_thread` creates a standalone thread in an announcement channel, as an announcement thread. It used to refuse the channel and call it a thread. `private: true` is refused there, since Discord creates only public threads in an announcement channel. The refusal of a voice or stage channel names that kind instead of calling it a thread
- On the site, the closing backslash of a shell command no longer wraps onto a line of its own on a phone, as it did in the Codex CLI block of the configuration page at 390 px. A word in a code block that is wider than the line now wraps inside it, and long variable names on the configuration page break after an underscore, so the guide and configuration pages no longer scroll sideways at 320 px
- The home page's client setup block is a section named by its heading, so screen readers announce "Add it to your client"
- `scripts/site-browser-check.mjs` runs to the end again. It checks the toolset builder on `/toolsets/`, where it moved, and covers the guide, recipes, configuration, troubleshooting and privacy pages
- The release dates of 1.1.0 to 1.5.1 in this changelog follow their npm publication: four said 2025 instead of 2026, 1.1.0 was released on 2026-03-20, 1.2.0 on 2026-03-21, 1.4.1 on 2026-03-25 and 1.5.1 on 2026-05-28

### Security

- `hono` 4.13.21 and `@hono/node-server` 2.1.11, which the MCP SDK uses for the HTTP mode, fix their security advisories. The Docker image is built from this lockfile, and `npm audit --omit=dev` reports no vulnerability

## [2.4.0] - 2026-11-15

### Added

- `server.json` declares every environment variable the server reads, so MCP Registry clients can prompt for them. `DISCORD_MCP_TOOLSETS`, `DISCORD_ALLOWED_GUILDS`, `DISCORD_MESSAGE_CONTENT` and `DISCORD_GUILD_MEMBERS` join `DISCORD_TOKEN` on both the npm and Docker packages
- `DISCORD_MCP_READ_ONLY=true` exposes only the 35 tools annotated `readOnlyHint: true`. Write tools are absent from `tools/list`, and `tools/call` rejects them as unknown tools. The mode narrows `DISCORD_MCP_TOOLSETS`. An invalid value, or a selection with no read-only tool left, stops the server at startup
- A Claude Desktop bundle, `discord-mcp.mcpb`, is attached to each GitHub Release and listed in the MCP Registry. Opening it installs the server and asks for the bot token; it runs on the Node.js built into Claude Desktop
- `DISCORD_MCP_TRANSPORT=http` serves MCP over Streamable HTTP on `/mcp`, for remote clients such as the OpenAI Responses API, Codex and n8n. Every request must carry the `DISCORD_MCP_HTTP_TOKEN` bearer token. The server listens on `127.0.0.1:3000` by default and refuses a foreign `Host` header and any `Origin`. stdio stays the default
- `discord_read_messages`, `discord_search_messages`, `discord_search_guild_messages`, `discord_fetch_pinned_messages`, `discord_get_forum_post` and `discord_read_dms` add `author_id` to every message, and `webhook_id` when a webhook, or an app replying to a command, sent it. A client can act on an author without searching members by name. `discord_read_messages` and `discord_fetch_pinned_messages` also return the channel's `guild_id`, enough to build a message link
- A Claude Code plugin, served from this repository as a plugin marketplace. In a session, run `/plugin marketplace add PaSympa/discord-mcp`, then `/plugin install discord-mcp@pasympa`; the install asks for the bot token. The plugin runs the npm release of the same version and adds two skills: a channel digest, and a moderation sweep that applies nothing before you confirm
- `discord_get_forum_tags` adds `emoji_id` to each tag, so a tag with a custom server emoji no longer reads like a tag without one

### Changed

- `discord_edit_message` and `discord_edit_embed` name the permissions they need: View Channel and Read Message History, plus Embed Links for `discord_edit_embed`
- The hint for Discord error 50001 also names a missing Read Message History, since Discord answers a single-message fetch without it with 50001
- New logo: a chat bubble crossed by circuit traces. It replaces the old one in the server icons, the Claude Desktop bundle icon, the README banners and the social preview
- The npm, MCP Registry and Docker image descriptions name Codex next to Claude, Cursor and VS Code
- 23 tool descriptions name the tool to use instead and state behavior the schemas do not show, so an agent picks the right tool among similar ones. Examples: `discord_get_guild_info` and `discord_get_server_stats` point at each other, `discord_update_membership_screening` warns that `form_fields` deletes question fields, and `discord_find_channel_by_name` describes its `{ matches }` result instead of a JSON array
- `discord_bulk_ban`'s dry run replies with the JSON structure `{ dry_run, would_ban }` instead of the prose "Dry run: N users would be banned". `would_ban` echoes the requested IDs unchecked: a real call can still fail some of them
- 41 tool descriptions were corrected against Discord's documentation and the server code. They name the permissions Discord checks, such as Read Message History for tools that fetch the message first and Create Events for scheduled events, and state limits they used to hide. `discord_delete_message` no longer promises an audit log reason, which Discord does not record for a message delete

### Fixed

- `discord_send_embed`, `discord_send_multiple_embeds` and `discord_edit_embed` refuse to run in a channel or thread where the bot lacks Embed Links, and the error names the permission and the channel. Discord used to post the text of a multi-embed message without its embeds, and leave an edited embed unchanged, while the tool reported success
- `discord_read_messages`, `discord_search_messages`, `discord_fetch_pinned_messages` and `discord_get_forum_post` fail with an error naming Read Message History and the channel when they get no messages and the bot lacks that permission there. Discord answers such a read with an empty list, so the tools reported an empty channel. `discord_bulk_delete_messages` refuses to run without it, where both modes used to report 0 messages
- `discord_copy_permissions` and `discord_clone_channel` refuse a source channel the bot cannot view. Discord can replace the overwrites of such a channel with a single @everyone View Channel deny, and copying that deny would lock the bot out of the result
- `discord_list_channels` and `discord_find_channel_by_name` leave out the `___hidden___` placeholders Discord shows for channels the bot cannot view, and `discord_find_channel_by_name` counts them in `hiddenChannels`. A search for a hidden channel came back empty with nothing to say the channel might exist
- `discord_lock_channel_permissions` refuses a channel whose parent category the bot cannot view. discord.js copies the category's cached overwrites, which Discord can replace with a single @everyone View Channel deny, and writing that deny would lock the bot out of the channel
- `discord_get_channel_permissions` refuses a channel Discord hides from the bot behind the `___hidden___` placeholder, and the error says to grant the bot View Channel on it. Discord gives such a channel a single @everyone View Channel deny in place of its real overwrites, and the tool returned that deny as the channel's overwrites
- `discord_audit_permissions` leaves out the `___hidden___` placeholders Discord shows for channels the bot cannot view, and counts them in `hiddenChannels`. From 2026-11-16, Discord's REST channel list omits those channels, so the audit would have reported each placeholder's @everyone View Channel deny as a real overwrite
- `discord_set_forum_tags` keeps the ID of each existing tag it lists again, matched by name case-insensitively as Discord itself does, so posts keep that tag. Every call used to recreate all tags under new IDs, which stripped them from existing posts
- `discord_set_forum_tags` keeps the emoji and moderated flag of a tag listed again without them. It used to send them as no emoji and `moderated: false`, so a moderator-only tag opened to everyone and a custom emoji was always lost. It accepts `emoji_id` for a custom emoji, `null` on `emoji_name` or `emoji_id` removes an emoji, and the reply names the tags created, deleted and changed, with the fields that changed
- `discord_remove_reactions` rejects `user_id` without `emoji`, and an empty `emoji`, before any request. Both used to remove every reaction from every user and report success
- `discord_bulk_ban` returns the IDs it banned and the IDs that failed, as `banned` and `failed` in structured output, instead of two counts. `failed` includes users who were already banned
- `discord_bulk_ban` says plainly that none of the users were banned when Discord answers error 500000, and names the known causes: IDs that match no user, or users already banned. It used to show only Discord's "Failed to ban users"
- `discord_get_scheduled_event` returns the interested count instead of `null`. It read the cached gateway copy of the event, which never carries `user_count`, while `discord_list_scheduled_events` already asked the API

## [2.3.0] - 2026-11-07

### Added

- `discord_read_messages`, `discord_search_messages`, `discord_search_guild_messages`, `discord_fetch_pinned_messages` and `discord_get_forum_post` return an `embeds` array with the title, author, description, url, fields and footer of each embed, so a bot post with empty `content` no longer reads as blank. Contributed by [@nobel6018](https://github.com/nobel6018) in [#124](https://github.com/PaSympa/discord-mcp/pull/124)
- `discord_list_channel_threads` lists the threads in a text or announcement channel: every active thread plus paginated archived ones, public or private, each flagged with whether it is private. Active threads were already visible, but archived ones outside a forum could not be listed, since `discord_list_forum_threads` covers forums alone. The result uses the same `hasMore` and `nextBefore` shape as `discord_list_forum_threads`. Contributed by [@nobel6018](https://github.com/nobel6018) in [#123](https://github.com/PaSympa/discord-mcp/pull/123)
- The server advertises a title, its website and its logo, in the `initialize` response and in `server.json`, for MCP clients and registries that display a server icon

### Changed

- The README leads with what you can ask, a three-step quick start, toolset profiles with their measured context cost, and one-click install for VS Code and Cursor
- The npm, MCP Registry and Docker image descriptions say what the server does instead of "95+ tools"

### Fixed

- `discord_fetch_pinned_messages` is now paginated instead of silently stopping at the first 50 pins. It takes `limit` (1-50) and a `before` cursor and returns `hasMore` and `nextBefore`, matching `discord_list_forum_threads`. The cursor compares against when a message was pinned, not when it was sent. `discord_get_reactions` no longer reads a stale snapshot after a pins call. Contributed by [@nobel6018](https://github.com/nobel6018) in [#122](https://github.com/PaSympa/discord-mcp/pull/122)
- `discord_pin_message` states the per-channel pin cap of 250, not the old 50. Contributed by [@nobel6018](https://github.com/nobel6018) in [#122](https://github.com/PaSympa/discord-mcp/pull/122)
- The archived-threads `limit` floor is 2, not 1. Discord answers `limit: 1` with `400 limit[NUMBER_TYPE_MIN]: int value should be greater than or equal to 2`, and the floor is absent from the endpoint's documented query parameters, so `discord_list_forum_threads` advertised a value the API rejects. Contributed by [@nobel6018](https://github.com/nobel6018) in [#123](https://github.com/PaSympa/discord-mcp/pull/123)

## [2.2.1] - 2026-11-06

### Security

- The production dependencies are refreshed, so `npm audit --omit=dev` is clean. The 2.2.0 lockfile, which the Docker image is built from, carried 10 advisories: 1 critical (proxy-addr), 4 high (MCP SDK, body-parser, undici, zod) and 5 moderate (hono, @hono/node-server, ip-address, fast-uri, qs). dotenv moves to 18

### Fixed

- `discord_get_reactions` and `discord_remove_reactions` no longer answer `No reaction found` on a message the server sent itself. They read a cached copy of the message whose reactions nothing refreshed, until the sweeper dropped it.

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

## [1.5.1] - 2026-05-28

### Fixed

- `getTextChannel` now accepts `ThreadChannel` (forum / public / private / announcement threads) in addition to `TextChannel`, unblocking all message tools on threads: `discord_edit_message`, `discord_delete_message`, `discord_add_reaction`, `discord_read_messages`, `discord_pin_message`, `discord_fetch_pinned_messages`, `discord_bulk_delete_messages`, `discord_search_messages`, `discord_send_embed`, `discord_edit_embed`, `discord_send_multiple_embeds`, `discord_forward_message` (#17, #18)
- `discord_create_thread` now throws a clear error if the parent `channel_id` is itself a thread (standalone thread creation requires a `TextChannel`; use `message_id` to start a thread from a message instead)

## [1.5.0] - 2026-05-04

### Added

- Full DM toolset (6 new tools, 97 total): `discord_send_dm_embed`, `discord_edit_dm`, `discord_edit_dm_embed`, `discord_delete_dm`, `discord_read_dms`, `discord_reply_dm`
- All DM tools take `user_id` directly and are self-contained in `dm.ts`

## [1.4.1] - 2026-03-25

### Added

- `discord_send_dm` tool for sending direct messages by user ID (auto-creates DM channel)
- Input validation (`validateId`) on DM tool

### Changed

- README: DM tool section, tool count bumped to 91, project structure updated

### Fixed

- Removed `dist/` from git tracking (now in `.gitignore`)

## [1.4.0] - 2026-03-25

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

## [1.3.0] - 2026-03-24

### Added

- 10 new tools (70 total)
- Scheduled Events: list, get, create, edit, delete, get subscribers (6 tools)
- Invites: list, get, create, delete (4 tools)
- `GuildScheduledEvents` and `GuildInvites` gateway intents

## [1.2.0] - 2026-03-21

### Added

- Forum tools: 10 tools for forum channels, posts, tags, threads
- Webhook tools: 5 tools for webhook management
- Docker support with multi-stage build
- Glama badge for MCP server listing

## [1.1.0] - 2026-03-20

### Added

- Initial release with 60 tools
- Messages, channels, roles, permissions, moderation, screening, stats
