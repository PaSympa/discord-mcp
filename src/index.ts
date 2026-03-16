#!/usr/bin/env node
/**
 * Discord MCP Server — Entry point.
 *
 * Sets up the MCP server over stdio, registers tool definitions from
 * the modular `tools/` directory, and routes incoming tool calls.
 * The Discord client is initialized in `client.ts`.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { assertReady, discord } from "./client.js";
import { getAllDefinitions, handleTool } from "./tools/index.js";

// ─── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "discord-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllDefinitions(),
}));

// ─── Tool Handler ───────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  assertReady();
  const { name, arguments: args = {} } = req.params;

  try {
    return await handleTool(name, args);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `❌ Error: ${message}` }], isError: true };
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Discord MCP Server v1.0 running on stdio.");
}

function shutdown() {
  console.error("Shutting down Discord MCP Server...");
  discord.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => { console.error("Fatal:", err); discord.destroy(); process.exit(1); });
