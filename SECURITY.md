# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Use [GitHub Security Advisories](https://github.com/PaSympa/discord-mcp/security/advisories/new) (private report to the maintainer)
3. Include a description of the vulnerability and steps to reproduce

## Bot Token Security

- Never commit your Discord bot token to version control
- Use environment variables or a `.env` file (already in `.gitignore`)
- Rotate your token immediately if it is ever exposed
- Give the bot only the permissions it needs for your use case

## HTTP Mode

By default the server speaks MCP over stdio and opens no port. `DISCORD_MCP_TRANSPORT=http` turns on a Streamable HTTP endpoint at `/mcp` instead.

- Every request must carry `Authorization: Bearer <DISCORD_MCP_HTTP_TOKEN>`. The server does not start without that token, with one shorter than 32 characters, or with one equal to `DISCORD_TOKEN`. `openssl rand -hex 32` gives a suitable one. Anyone who holds it acts as your bot.
- The server listens on `127.0.0.1:3000` by default, which accepts connections from this machine only.
- A request needs a `Host` of `localhost`, `127.0.0.1`, `[::1]` or a name in `DISCORD_MCP_HTTP_ALLOWED_HOSTS`. Any request with an `Origin` header is refused, so a web page cannot reach the server, even through DNS rebinding.
- The token is static: there is no OAuth. The server speaks plain HTTP. Never publish the port on the Internet. To reach it from another machine, put it behind a reverse proxy or a tunnel that terminates TLS.

Details: [Security over HTTP](README.md#security-over-http) in the README.
