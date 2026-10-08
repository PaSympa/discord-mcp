# Running the ChatGPT tunnel with launchd on macOS

Complete the [ChatGPT tunnel setup](chatgpt-tunnel.md) and a read-only Discord call before
installing a background service. This optional example runs one tunnel under your macOS
user account. It changes no Discord permissions or ChatGPT connections.

A LaunchAgent runs after login and stops at logout. It cannot keep a sleeping or powered-off
Mac reachable. Keep the host online and awake, and verify recovery after reboot and login.
See [Apple's launchd guide](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html).

## Store the environment outside Git

Create a private configuration directory and environment file:

```bash
mkdir -p "$HOME/.config/discord-mcp-tunnel"
chmod 700 "$HOME/.config/discord-mcp-tunnel"
touch "$HOME/.config/discord-mcp-tunnel/env"
chmod 600 "$HOME/.config/discord-mcp-tunnel/env"
```

Edit `~/.config/discord-mcp-tunnel/env` locally with the following shape, replacing the
placeholders. This file is sourced by a shell: use shell-compatible assignments and quote
values. Do not paste credentials into terminal commands or commit the file.

```bash
CONTROL_PLANE_TUNNEL_ID='tunnel_YOUR_TUNNEL_ID'
CONTROL_PLANE_API_KEY='YOUR_OPENAI_RUNTIME_API_KEY'
DISCORD_TOKEN='YOUR_DISCORD_BOT_TOKEN'
DISCORD_ALLOWED_GUILDS='FIRST_SERVER_ID,SECOND_SERVER_ID'
DISCORD_MCP_TOOLSETS='discovery'
DISCORD_MESSAGE_CONTENT=false
DISCORD_GUILD_MEMBERS=false
```

Choose management toolsets using the [main guide](chatgpt-tunnel.md#enable-management-tools).
The two intent flags above avoid requesting privileged gateway intents for discovery.
For message/member data, follow the [portal intent settings](../README.md#creating-your-discord-bot)
and [environment variable guidance](../README.md#environment-variables).

## Create a launcher with explicit paths

From your built repository checkout, record:

```bash
pwd -P
command -v node
command -v tunnel-client
```

Create `~/.config/discord-mcp-tunnel/run.sh` with the following contents. Replace all three
`/ABSOLUTE/...` paths using those results. `NODE_BIN_DIRECTORY` is the directory containing
the Node executable, such as the selected version's `bin` directory. Keep the quotes around
paths, including paths containing spaces.

```sh
#!/bin/sh
set -eu

export PATH="/ABSOLUTE/NODE_BIN_DIRECTORY:/usr/bin:/bin:/usr/sbin:/sbin"
set -a
. "$HOME/.config/discord-mcp-tunnel/env"
set +a

cd "/ABSOLUTE/PATH/TO/discord-mcp"
exec "/ABSOLUTE/PATH/TO/tunnel-client" "${1:-run}" --config tunnel-client.yaml
```

This does not depend on an interactive shell loading nvm, Homebrew, or another version
manager. Update the paths if the checkout or executables move. It exports both Discord and
control-plane variables to tunnel-client, which does not load `.env` itself.

```bash
chmod 700 "$HOME/.config/discord-mcp-tunnel/run.sh"
/bin/sh -n "$HOME/.config/discord-mcp-tunnel/run.sh"
"$HOME/.config/discord-mcp-tunnel/run.sh" doctor
"$HOME/.config/discord-mcp-tunnel/run.sh"
```

Verify readiness and a read-only call from ChatGPT, then stop this foreground process with
Ctrl+C before starting the LaunchAgent. The repository configuration uses
`127.0.0.1:8080`; if occupied, choose another loopback port in your local
`tunnel-client.yaml` and use that port in the checks below.

## Register the LaunchAgent

For a first installation, run this block in one terminal. `plutil` writes the property list
with correctly escaped absolute paths; it contains no credentials. If this label is already
installed, stop it using the commands below before replacing its files.

```bash
CONFIG_DIR="$HOME/.config/discord-mcp-tunnel"
LOG_DIR="$HOME/Library/Logs/discord-mcp-tunnel"
PLIST="$HOME/Library/LaunchAgents/io.github.pasympa.discord-mcp-tunnel.plist"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
chmod 700 "$LOG_DIR"
plutil -create xml1 "$PLIST"
plutil -insert Label -string io.github.pasympa.discord-mcp-tunnel "$PLIST"
plutil -insert ProgramArguments -array "$PLIST"
plutil -insert ProgramArguments.0 -string "$CONFIG_DIR/run.sh" "$PLIST"
plutil -insert RunAtLoad -bool true "$PLIST"
plutil -insert KeepAlive -bool true "$PLIST"
plutil -insert ThrottleInterval -integer 30 "$PLIST"
plutil -insert StandardOutPath -string "$LOG_DIR/stdout.log" "$PLIST"
plutil -insert StandardErrorPath -string "$LOG_DIR/stderr.log" "$PLIST"
plutil -insert Umask -integer 63 "$PLIST"
chmod 600 "$PLIST"
plutil -lint "$PLIST"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
```

`KeepAlive` restarts the process after exit; `ThrottleInterval` limits rapid restart loops.
`Umask` 63 is decimal for octal 077, keeping newly created log files private. Existing log
files retain their permissions. launchd does not rotate these files: configure log rotation
and retention for this directory before leaving the service unattended.

## Verify, restart, and stop

```bash
launchctl print "gui/$(id -u)/io.github.pasympa.discord-mcp-tunnel"
curl --fail http://127.0.0.1:8080/healthz
curl --fail http://127.0.0.1:8080/readyz
tail -n 50 "$HOME/Library/Logs/discord-mcp-tunnel/stderr.log"
```

The endpoints should return `live` and `ready`. Also ask ChatGPT to call
`discord_list_guilds` and verify the intended servers. Tool discovery and tunnel readiness
alone do not test the lazy Discord login.

After editing the environment file, restart the service and refresh ChatGPT's tools if the
toolset changed:

```bash
launchctl kickstart -k "gui/$(id -u)/io.github.pasympa.discord-mcp-tunnel"
```

Stop and unload the service, including its automatic restarts:

```bash
launchctl bootout "gui/$(id -u)/io.github.pasympa.discord-mcp-tunnel"
```

To prevent it loading at the next login, remove this service's plist after unloading it:

```bash
rm "$HOME/Library/LaunchAgents/io.github.pasympa.discord-mcp-tunnel.plist"
```

Unloading or removing the service does not delete the bot, tunnel, plugin, or credentials.
If retiring the connection entirely, revoke its dedicated credentials and remove its secret
file separately. Do not revoke credentials still used by a replacement host.

## Move to another Mac

Follow the [host migration steps](chatgpt-tunnel.md#persistent-operation-and-moving-hosts).
Install Node and tunnel-client for the new Mac's architecture and rebuild the same server
revision. Transfer the environment file securely and restore its private permissions.
Recreate the launcher and plist on the destination so they contain the new username and
binary/checkout paths; do not reuse a plist containing the old Mac's paths.

Unload the old LaunchAgent before starting the replacement. After the existing ChatGPT
plugin can call Discord through the new Mac, remove the old plist and secret copies.
Finally, test logout/login, reboot/login, process restart, and network recovery on the new
host before relying on it for ongoing work.
