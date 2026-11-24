// src/tools/index.ts builds its registry on first import, so import this before it.
// Both are set explicitly: the .env file src/client.ts loads never overrides a set variable.
process.env.DISCORD_MCP_READ_ONLY = "true";
process.env.DISCORD_MCP_TOOLSETS = "all";
