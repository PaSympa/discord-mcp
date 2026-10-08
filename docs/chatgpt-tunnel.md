# Connecting ChatGPT through Secure MCP Tunnel

OpenAI's [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
can launch this server over stdio. `tunnel-client` connects outbound to OpenAI and forwards
ChatGPT's MCP requests to the local Discord MCP process. The server needs no HTTP listener,
public URL, or additional transport dependencies.

```text
ChatGPT <-> OpenAI Tunnel <-> tunnel-client <-> stdio <-> Discord MCP <-> Discord
```

This setup uses one Discord bot identity. Everyone with access to the connected plugin acts
with that bot's permissions, within the configured guild allow-list. It does not sign each
ChatGPT user into a separate Discord account.

## Prerequisites

- Node.js 22+ and npm.
- `tunnel-client` installed on `PATH`, following the
  [official setup instructions](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#set-up-tunnel-client).
  The commands and configuration below were checked with version `0.0.14`.
- A Discord bot token and a bot invited to your server. Follow
  [Creating Your Discord Bot](../README.md#creating-your-discord-bot), including the gateway
  intent settings.
- A tunnel created in [Platform tunnel settings](https://platform.openai.com/settings/organization/tunnels),
  associated with the ChatGPT workspace that will use it. Creating a tunnel requires
  Tunnels Read + Manage; running it requires Read + Use and a runtime API key.
- Permission to add and use a custom MCP server in your ChatGPT workspace.

## Build the checkout

```bash
git clone https://github.com/rokrokss/discord-mcp.git
cd discord-mcp
npm ci
npm run build
```

The commands below use this checkout's `dist/index.js`, not the upstream npm package.
Run them from the repository root. Rebuild after changing TypeScript source.

## Configure and start

Set these environment variables in the terminal that will run the tunnel. Replace every
placeholder with your own value; keep credentials out of committed files and shell history
(for example, inject them through your secret manager).

```bash
export CONTROL_PLANE_TUNNEL_ID="tunnel_YOUR_TUNNEL_ID"
export CONTROL_PLANE_API_KEY="YOUR_OPENAI_RUNTIME_API_KEY"
export DISCORD_TOKEN="YOUR_DISCORD_BOT_TOKEN"
export DISCORD_ALLOWED_GUILDS="YOUR_DISCORD_SERVER_ID"
export DISCORD_MCP_TOOLSETS="discovery"
```

`CONTROL_PLANE_API_KEY` authenticates the tunnel to OpenAI. `DISCORD_TOKEN` authenticates the
local server to Discord. Use a runtime API key, not an OpenAI admin key. Neither secret is
stored in [`tunnel-client.yaml`](../tunnel-client.yaml).

The Discord server also supports a local `.env` file, but **tunnel-client does not load that
file**. Export the `CONTROL_PLANE_*` variables in the parent environment even if you keep
Discord settings in `.env`.

Start with the read-only `discovery` toolset. Add `messages` or other
[toolsets](../README.md#environment-variables) when needed, then restart the tunnel and
refresh the plugin's tools in ChatGPT. A toolset can include writes and deletes; for example,
`messages` includes bulk deletion. Keep `DISCORD_ALLOWED_GUILDS` set to the intended guild IDs.

```bash
npm run tunnel:doctor
npm run tunnel
```

The first command checks the configuration; the second runs the tunnel in the foreground.
Keep it running during plugin creation and use. Stop it with Ctrl+C. For continuous use,
supervise it using the deployment options in the official tunnel guide.

The health/admin listener is local to `127.0.0.1:8080`. If that port is already in use,
pass `--health.listen-addr 127.0.0.1:8081` after `--` to both npm commands. This port serves
tunnel diagnostics, not a public Discord MCP endpoint.

## Connect and verify in ChatGPT

1. With the tunnel running, open [ChatGPT Plugins](https://chatgpt.com/plugins).
2. Select **+ → Add custom MCP server** and choose **Tunnel** under **Connection**.
3. Select your tunnel or enter its ID. Choose **No authentication** for this stdio server;
   the Discord bot credential stays in the local process and tunnel access is controlled
   through your OpenAI organization/workspace.
4. Create and install the plugin, then select it in a conversation.
5. Ask it to list the Discord servers the bot can access using `discord_list_guilds`.

Before testing in ChatGPT, inspect <http://127.0.0.1:8080/ui> and check:

```bash
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/readyz
```

Healthy tunnel diagnostics and successful tool discovery do not prove Discord connectivity.
This server logs into Discord on the first tool call and can wait up to 30 seconds for
gateway readiness. Verify the read-only `discord_list_guilds` call separately.

## Troubleshooting

- **`tunnel-client: command not found`:** install the official client and ensure it is on
  the `PATH` used by npm.
- **Missing `dist/index.js`:** run `npm ci` and `npm run build` in this checkout.
- **Tunnel missing from ChatGPT:** check the tunnel's workspace association and the
  operator's Tunnels Read + Use permissions.
- **Discord login fails:** check the bot token, invite, and privileged gateway intents.
  See the existing [environment variable guidance](../README.md#environment-variables).
- **Tool list has not changed:** restart the tunnel after changing `DISCORD_MCP_TOOLSETS`,
  then refresh the plugin in ChatGPT.

Secure MCP Tunnel is for private connections. Public plugin submission requires a stable,
public HTTPS MCP endpoint; see the [official tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).
