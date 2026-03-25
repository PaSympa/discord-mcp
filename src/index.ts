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

import { readFileSync } from "fs";
import { join } from "path";
import { ensureConnected, discord } from "./client.js";
import { getAllDefinitions, handleTool } from "./tools/index.js";

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const version: string = pkg.version;

// ─── MCP Server ────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "discord-mcp", version },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllDefinitions(),
}));

// ─── Tool Handler ───────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;

  try {
    await ensureConnected();
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
  console.error(`Discord MCP Server v${version} running on stdio.`);
}

function shutdown() {
  console.error("Shutting down Discord MCP Server...");
  discord.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((err) => { console.error("Fatal:", err); discord.destroy(); process.exit(1); });
