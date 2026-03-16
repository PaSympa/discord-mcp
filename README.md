# Discord MCP Server

A MCP (Model Context Protocol) server that lets Claude control Discord:
read/send messages, manage members, roles, channels, and permissions.

---

## Prerequisites

- **Node.js** >= 18
- A **Discord Bot** with its token
- Claude Desktop (or any MCP-compatible client)

---

## Installation

```bash
cd discord-mcp

npm install

npm run build
```

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
   - Permissions: `Send Messages`, `Read Message History`, `Manage Channels`, `Manage Roles`, `Kick Members`, `Ban Members`, `Moderate Members`, `View Audit Log`, `Manage Messages`, `Manage Threads`, `Add Reactions`, `Manage Guild`
6. Copy the generated URL and invite the bot to your server

---

## Configuration

### Claude Desktop

Add this to your `claude_desktop_config.json`:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "discord": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/discord-mcp/dist/index.js"],
      "env": {
        "DISCORD_TOKEN": "YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### .env file (alternative)

Instead of passing the token in the MCP config, you can create a `.env` file at the project root:

```
DISCORD_TOKEN=YOUR_TOKEN_HERE
```

The server loads `.env` automatically via `dotenv`.

---

## Available MCP Tools (43 total)

### Discovery & Navigation

| Tool | Description |
|---|---|
| `discord_list_guilds` | List all servers the bot is connected to |
| `discord_get_guild_info` | Get detailed guild info (name, members, channels, roles, boosts) |
| `discord_list_channels` | List all channels in a guild grouped by category |
| `discord_find_channel_by_name` | Find a channel by name (partial match) |

### Messages

| Tool | Description |
|---|---|
| `discord_read_messages` | Read the last N messages from a text channel |
| `discord_send_message` | Send a plain text message |
| `discord_reply_message` | Reply to a specific message |
| `discord_edit_message` | Edit a message sent by the bot |
| `discord_add_reaction` | Add a reaction emoji to a message |
| `discord_create_thread` | Create a thread from a message or standalone |
| `discord_bulk_delete_messages` | Delete multiple messages at once (2-100) |
| `discord_send_embed` | Send a rich embed (title, description, color, fields, footer, image) |
| `discord_delete_message` | Delete a specific message |
| `discord_pin_message` | Pin or unpin a message |
| `discord_search_messages` | Search messages by keyword (last 100 messages) |

### Channels

| Tool | Description |
|---|---|
| `discord_create_channel` | Create a text, voice channel or category |
| `discord_delete_channel` | Delete a channel |
| `discord_edit_channel` | Edit name, topic (text only), slowmode (text only) |
| `discord_move_channel` | Move a channel into/out of a category |
| `discord_clone_channel` | Clone a channel with its permissions |

### Channel Permissions

| Tool | Description |
|---|---|
| `discord_get_channel_permissions` | List all permission overwrites on a channel |
| `discord_set_role_permission` | Allow/deny permissions for a role on a channel |
| `discord_set_member_permission` | Allow/deny permissions for a member on a channel |
| `discord_reset_channel_permissions` | Remove all permission overwrites (reset to inherited) |
| `discord_copy_permissions` | Copy permission overwrites from one channel to another |
| `discord_audit_permissions` | Full permission audit report for all channels in a guild |

### Members

| Tool | Description |
|---|---|
| `discord_list_members` | List guild members with their roles |
| `discord_get_member_info` | Detailed member info (roles, permissions, join date, timeout) |
| `discord_kick_member` | Kick a member |
| `discord_ban_member` | Ban a member (optionally delete messages from last 0-7 days) |
| `discord_unban_member` | Unban a user |
| `discord_timeout_member` | Put a member in timeout (0 to remove) |

### Roles

| Tool | Description |
|---|---|
| `discord_list_roles` | List all roles with permissions and member count |
| `discord_create_role` | Create a new role |
| `discord_edit_role` | Edit a role (name, color, permissions, hoist, mentionable) |
| `discord_delete_role` | Delete a role |
| `discord_add_role` | Assign a role to a member |
| `discord_remove_role` | Remove a role from a member |
| `discord_get_role_members` | List all members with a specific role |

### Membership Screening

| Tool | Description |
|---|---|
| `discord_get_membership_screening` | Get the current membership screening form (rules/questions for new members) |
| `discord_update_membership_screening` | Update the screening form: welcome message + rules new members must agree to |

### Moderation

| Tool | Description |
|---|---|
| `discord_get_audit_log` | Fetch the guild audit log (who did what and when) |

### Stats

| Tool | Description |
|---|---|
| `discord_get_server_stats` | Server stats: members, channels, roles, boost level |

---

## Usage Examples

```
"List all servers the bot is in"
"Read the last 10 messages from channel 123456789"
"Send 'Hello everyone!' to the announcements channel"
"Reply to the last message in #general"
"React with a thumbs up to message 123456789"
"Create a thread called 'Discussion' from the last message"
"Delete the last 50 messages in #spam"
"Create a channel #new-project in server 987654321"
"List all members and their roles"
"Assign the Moderator role to user 112233445566"
"Ban user 112233445566 and delete their messages from the last 3 days"
"Timeout user 112233445566 for 30 minutes"
"Show the full permission audit for the server"
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
│   ├── index.ts             <- Entry point (MCP server + transport)
│   ├── client.ts            <- Discord client + shared helpers
│   └── tools/
│       ├── index.ts         <- Tool registry (aggregates all modules)
│       ├── types.ts         <- Shared TypeScript interfaces
│       ├── discovery.ts     <- Guild/channel discovery tools
│       ├── messages.ts      <- Message CRUD, reactions, threads
│       ├── channels.ts      <- Channel management tools
│       ├── permissions.ts   <- Permission overwrite tools
│       ├── members.ts       <- Member management tools
│       ├── roles.ts         <- Role CRUD and assignment tools
│       ├── moderation.ts    <- Audit log tools
│       ├── screening.ts     <- Membership screening tools
│       └── stats.ts         <- Server statistics tools
├── dist/                    <- Compiled output (generated by npm run build)
├── package.json
├── tsconfig.json
└── README.md
```

### Adding a new tool

1. Create a new file in `src/tools/` (e.g. `onboarding.ts`)
2. Export `definitions` (tool schemas) and `handle()` (tool logic)
3. Import and add it to the `modules` array in `src/tools/index.ts`

---

## Security

- Never commit your Discord token to Git
- Use environment variables or a `.env` file (not versioned)
- Give the bot only the permissions it needs
