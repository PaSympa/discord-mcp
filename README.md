<div align="center">

# Discord MCP Server

**A lightweight, multi-guild Discord MCP server with 60+ tools**

[![npm](https://img.shields.io/npm/v/@pasympa/discord-mcp)](https://www.npmjs.com/package/@pasympa/discord-mcp)
[![License](https://img.shields.io/github/license/PaSympa/discord-mcp)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2)](https://discord.js.org)
[![MCP](https://img.shields.io/badge/MCP-compatible-purple)](https://modelcontextprotocol.io)

[![discord-mcp MCP server](https://glama.ai/mcp/servers/PaSympa/discord-mcp/badges/score.svg)](https://glama.ai/mcp/servers/PaSympa/discord-mcp)

Manage your entire Discord server from **Claude Desktop**, **Claude Code**, **Cursor**, **VS Code Copilot**, or any MCP-compatible client.
Messages, channels, roles, permissions, moderation, forums, webhooks — all through natural language.

</div>

---

## Why this one?

- **60+ tools** — messages, channels, roles, permissions, moderation, forums, webhooks, embeds, and more
- **Multi-guild** — works across multiple servers, no `GUILD_ID` lock-in
- **Lightweight** — TypeScript + Node.js, ~25kB package, ~73MB Docker image (vs 400MB+ for Java alternatives)
- **Modular** — clean architecture, easy to extend with new tools
- **Two install methods** — npm or Docker, your choice

---

## Quick Start

Add this to your MCP client config and replace `YOUR_TOKEN_HERE` with your bot token:

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["-y", "@pasympa/discord-mcp"],
      "env": {
        "DISCORD_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

No install needed — `npx` handles everything.

> Don't have a bot yet? See [Creating Your Discord Bot](#creating-your-discord-bot).

---

## Configuration

<details>
<summary><strong>Claude Desktop</strong></summary>

Add the config above to your `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Restart Claude Desktop after saving.

</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add discord -e DISCORD_TOKEN=YOUR_TOKEN_HERE -- npx -y @pasympa/discord-mcp
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Add the config above to `~/.cursor/mcp.json`. See [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol) for details.

</details>

<details>
<summary><strong>VS Code / GitHub Copilot</strong></summary>

Add to your `.vscode/mcp.json`:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "discord-token",
      "description": "Discord Bot Token",
      "password": true
    }
  ],
  "servers": {
    "discord": {
      "command": "npx",
      "args": ["-y", "@pasympa/discord-mcp"],
      "env": {
        "DISCORD_TOKEN": "${input:discord-token}"
      }
    }
  }
}
```

See [VS Code MCP docs](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) for details.

</details>

<details>
<summary><strong>Docker</strong></summary>

```json
{
  "mcpServers": {
    "discord": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "DISCORD_TOKEN=YOUR_TOKEN_HERE",
        "pasympa/discord-mcp:latest"
      ]
    }
  }
}
```

</details>

<details>
<summary><strong>From source</strong></summary>

```bash
git clone https://github.com/PaSympa/discord-mcp
cd discord-mcp
npm install && npm run build
```

```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["/absolute/path/to/discord-mcp/dist/index.js"],
      "env": {
        "DISCORD_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

</details>

<details>
<summary><strong>.env file (alternative)</strong></summary>

Instead of passing the token in the MCP config, create a `.env` file at the project root:

```
DISCORD_TOKEN=YOUR_TOKEN_HERE
```

The server loads `.env` automatically via `dotenv`.

</details>

---

## Creating Your Discord Bot

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. **New Application** > give it a name
3. **Bot** tab > **Reset Token** > copy the token
4. Enable **Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent
5. **OAuth2 > URL Generator**:
   - Scopes: `bot`
   - Permissions: `Send Messages`, `Read Message History`, `Manage Channels`, `Manage Roles`, `Kick Members`, `Ban Members`, `Moderate Members`, `View Audit Log`, `Manage Messages`, `Manage Threads`, `Add Reactions`, `Manage Guild`, `Manage Webhooks`
6. Copy the generated URL and invite the bot to your server

---

## Available Tools (60)

### Discovery & Navigation

| Tool | Description |
|---|---|
| `discord_list_guilds` | List all servers the bot is connected to |
| `discord_get_guild_info` | Get detailed guild info (name, members, channels, roles, boosts) |
| `discord_list_channels` | List all channels in a guild grouped by category |
| `discord_find_channel_by_name` | Find a channel by name (partial match) |

### Messages (13 tools)

| Tool | Description |
|---|---|
| `discord_read_messages` | Read the last N messages from a text channel |
| `discord_send_message` | Send a plain text message |
| `discord_reply_message` | Reply to a specific message |
| `discord_edit_message` | Edit a message sent by the bot |
| `discord_delete_message` | Delete a specific message |
| `discord_add_reaction` | Add a reaction emoji to a message |
| `discord_create_thread` | Create a thread from a message or standalone |
| `discord_bulk_delete_messages` | Delete multiple messages at once (2-100) |
| `discord_send_embed` | Send a rich embed with all options |
| `discord_edit_embed` | Edit an embed previously sent by the bot |
| `discord_send_multiple_embeds` | Send up to 10 embeds in a single message |
| `discord_pin_message` | Pin or unpin a message |
| `discord_search_messages` | Search messages by keyword (last 100) |

### Channels (5 tools)

| Tool | Description |
|---|---|
| `discord_create_channel` | Create a text, voice channel or category |
| `discord_delete_channel` | Delete a channel |
| `discord_edit_channel` | Edit name, topic, slowmode |
| `discord_move_channel` | Move a channel into/out of a category |
| `discord_clone_channel` | Clone a channel with its permissions |

### Channel Permissions (6 tools)

| Tool | Description |
|---|---|
| `discord_get_channel_permissions` | List all permission overwrites on a channel |
| `discord_set_role_permission` | Allow/deny permissions for a role on a channel |
| `discord_set_member_permission` | Allow/deny permissions for a member on a channel |
| `discord_reset_channel_permissions` | Remove all overwrites (reset to inherited) |
| `discord_copy_permissions` | Copy overwrites from one channel to another |
| `discord_audit_permissions` | Full permission audit for all channels |

### Members (6 tools)

| Tool | Description |
|---|---|
| `discord_list_members` | List guild members with their roles |
| `discord_get_member_info` | Detailed member info (roles, permissions, join date) |
| `discord_kick_member` | Kick a member |
| `discord_ban_member` | Ban a member (optionally delete recent messages) |
| `discord_unban_member` | Unban a user |
| `discord_timeout_member` | Timeout a member (0 to remove) |

### Roles (7 tools)

| Tool | Description |
|---|---|
| `discord_list_roles` | List all roles with permissions and member count |
| `discord_create_role` | Create a new role |
| `discord_edit_role` | Edit a role (name, color, permissions, hoist, mentionable) |
| `discord_delete_role` | Delete a role |
| `discord_add_role` | Assign a role to a member |
| `discord_remove_role` | Remove a role from a member |
| `discord_get_role_members` | List all members with a specific role |

### Forums (10 tools)

| Tool | Description |
|---|---|
| `discord_get_forum_channels` | List all forum channels in a guild |
| `discord_create_forum_channel` | Create a new forum channel |
| `discord_create_forum_post` | Create a post/thread in a forum |
| `discord_get_forum_post` | Get a post's details and messages |
| `discord_list_forum_threads` | List threads (active + archived) |
| `discord_reply_to_forum` | Reply to a forum post |
| `discord_delete_forum_post` | Delete a forum thread |
| `discord_get_forum_tags` | Get available tags |
| `discord_set_forum_tags` | Set/update tags on a forum |
| `discord_update_forum_post` | Update title, archived, locked, tags |

### Webhooks (5 tools)

| Tool | Description |
|---|---|
| `discord_create_webhook` | Create a webhook on a channel |
| `discord_send_webhook_message` | Send via webhook (custom username/avatar, embeds) |
| `discord_edit_webhook` | Edit a webhook's name, avatar, or channel |
| `discord_delete_webhook` | Delete a webhook |
| `discord_list_webhooks` | List webhooks for a channel or guild |

### Moderation & Screening

| Tool | Description |
|---|---|
| `discord_get_audit_log` | Fetch the guild audit log |
| `discord_get_membership_screening` | Get the membership screening form |
| `discord_update_membership_screening` | Update screening rules for new members |

### Stats

| Tool | Description |
|---|---|
| `discord_get_server_stats` | Server stats: members, channels, roles, boost level |

---

## Usage Examples

```
"List all servers the bot is in"
"Read the last 10 messages in #general"
"Send 'Hello everyone!' to the announcements channel"
"Create a forum channel called 'feedback' with tags Bug, Feature, Question"
"Show the full permission audit for the server"
"Create a webhook on #notifications and send a test message"
"Ban user 112233445566 and delete their messages from the last 3 days"
```

---

## Finding Discord IDs

Enable **Developer Mode** in Discord:
`Settings > Advanced > Developer Mode`

Then **right-click** on a server, channel, or user > **Copy ID**.

---

## Project Structure

```
discord-mcp/
├── src/
│   ├── index.ts             ← Entry point (MCP server + transport)
│   ├── client.ts            ← Discord client + shared helpers
│   └── tools/
│       ├── index.ts         ← Tool registry
│       ├── types.ts         ← Shared TypeScript interfaces
│       ├── discovery.ts     ← Guild/channel discovery
│       ├── messages.ts      ← Message CRUD, reactions, threads, embeds
│       ├── channels.ts      ← Channel management
│       ├── permissions.ts   ← Permission overwrites
│       ├── members.ts       ← Member management
│       ├── roles.ts         ← Role CRUD and assignment
│       ├── moderation.ts    ← Audit log
│       ├── screening.ts     ← Membership screening
│       ├── stats.ts         ← Server statistics
│       ├── forums.ts        ← Forum channels, posts, tags
│       └── webhooks.ts      ← Webhook management
├── Dockerfile
├── .dockerignore
├── package.json
├── tsconfig.json
└── README.md
```

### Adding a new tool

1. Create a new file in `src/tools/` (e.g. `events.ts`)
2. Export `definitions` (tool schemas) and `handle()` (tool logic)
3. Import and add it to the `modules` array in `src/tools/index.ts`

---

## Security

- Never commit your Discord token to Git
- Use environment variables or a `.env` file (not versioned)
- Give the bot only the permissions it needs

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Follow the modular structure — see [Adding a new tool](#adding-a-new-tool)
4. Commit your changes and open a pull request

---

## License

MIT — see [LICENSE](LICENSE) for details.
