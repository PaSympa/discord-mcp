# Discord MCP (community)

Administer and moderate a Discord server from Claude Code through a bot you own. The plugin runs the discord-mcp server from npm, pinned to the plugin's version, and adds two skills.

Not affiliated with or endorsed by Discord. This plugin is not the Discord channel plugin: it does not forward Discord messages into your session. It gives Claude tools to read and manage a server.

## Requirements

- Claude Code. The tools load in the terminal, the IDE extensions and the Code tab of Claude Desktop. In Claude chat and Cowork, only the skills load.
- Node.js 22 or later, for `npx`.
- A Discord bot in your server. Create it in the Discord Developer Portal and copy its token. Enable the Server Members and Message Content intents there if you need member lists and message text.

## Setup

In a Claude Code session, on version 2.1.275 or later:

```text
/plugin install discord-mcp --marketplace PaSympa/discord-mcp
```

Then enter the bot token when Claude Code asks. Claude Code stores it in your system's secure credential store, not in `settings.json`. If you skip that prompt, the server stays off until you set the token.

To set or change the token and the other settings, run `/plugin configure discord-mcp@<marketplace>`, with the marketplace you installed from, such as `pasympa`. Restart Claude Code after you set or change the token.

Settings:

- Toolsets: limit the tools to the areas you need, such as `discovery,messages`.
- Read-only mode: expose only the tools that change nothing.
- Allowed guilds: reject every call that targets a server ID you did not list.
- Message Content and Server Members intents: turn them off if they are off in the Developer Portal.

If you already added discord-mcp with `claude mcp add`, remove that entry. Otherwise every tool loads twice.

## Skills

- `/discord-mcp:channel-digest` summarizes a channel, thread or forum: topics, decisions, open questions and messages that need a moderator. It posts a recap only after you approve its text.
- `/discord-mcp:moderation-sweep` reviews a channel for spam, scams, raids and abuse, and proposes numbered actions. Nothing is applied before you approve, and mass actions are previewed with a dry run first.

## Example prompts

- "Summarize what happened in #support this week and list the questions nobody answered."
- "A spam raid just hit #general. Preview the cleanup, then remove it."
- "Show me every role with Administrator and every channel where @everyone is denied View Channel."
- "Schedule a community call next Friday at 8 PM and announce it in #announcements."

## Data and privacy

The server runs on your machine. It connects to the Discord API with your bot's token and sends nothing to the maintainer: no telemetry, no analytics. It writes nothing to disk.

It also reaches two other places. At launch, `npx` downloads the pinned package from npm. A role icon, webhook avatar or event cover given by URL is downloaded from that URL, then uploaded to Discord.

What Claude reads from Discord enters your conversation and goes to your model provider under its own terms. Full details: [privacy policy](https://pasympa.github.io/discord-mcp/privacy/).

## Safety

The bot can only do what its Discord permissions allow. Bulk delete, bulk ban, member prune and channel delete run as a dry run unless you confirm. Every tool declares whether it is read-only or destructive.

## Links

- Documentation: https://pasympa.github.io/discord-mcp/
- Source and full tool list: https://github.com/PaSympa/discord-mcp
- Issues: https://github.com/PaSympa/discord-mcp/issues
- License: MIT
