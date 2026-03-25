# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Email the maintainer or use [GitHub Security Advisories](https://github.com/PaSympa/discord-mcp/security/advisories/new)
3. Include a description of the vulnerability and steps to reproduce

## Bot Token Security

- Never commit your Discord bot token to version control
- Use environment variables or a `.env` file (already in `.gitignore`)
- Rotate your token immediately if it is ever exposed
- Give the bot only the permissions it needs for your use case
