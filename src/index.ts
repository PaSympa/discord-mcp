#!/usr/bin/env node
/**
 * Discord MCP Server: stdio entry point. Server construction lives in
 * `server.ts` (testable via in-memory transport); the Discord client in `client.ts`.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { join } from "path";
import { discord } from "./client.js";
import { createServer } from "./server.js";

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const version: string = pkg.version;

async function main() {
  const transport = new StdioServerTransport();
  await createServer(version).connect(transport);
  console.error(`Discord MCP Server v${version} running on stdio.`);
}

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error("Shutting down Discord MCP Server...");
  discord.destroy();
  process.exit(code);
}

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

// A stdio server must not outlive its client: stdin EOF means the session is over.
// StdioServerTransport only subscribes to stdin's 'data'/'error', so EOF never
// surfaces, and the Discord gateway socket keeps the event loop alive — leaving
// the process running long after its client has gone. ('end' is followed by
// 'close'; shutdown() is guarded so the pair is harmless.)
process.stdin.on("end", () => shutdown());
process.stdin.on("close", () => shutdown());

process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

main().catch((err) => {
  console.error("Fatal:", err);
  shutdown(1);
});
