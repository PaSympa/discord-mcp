#!/usr/bin/env node
/**
 * Discord MCP Server: entry point, on stdio unless DISCORD_MCP_TRANSPORT=http selects the
 * Streamable HTTP server in `http.ts`. Server construction lives in `server.ts` (testable
 * via in-memory transport); the Discord client in `client.ts`.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { join } from "path";
import { discord } from "./client.js";
import { createServer } from "./server.js";

const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
const version: string = pkg.version;

/** How long in-flight HTTP responses may run after SIGINT or SIGTERM before the process exits. */
const SHUTDOWN_GRACE_MS = 5_000;

let httpServer: Server | undefined;

/** Reads DISCORD_MCP_TRANSPORT, trimmed and case-insensitive. Unset or empty means stdio. */
function selectTransport(): "stdio" | "http" {
  const raw = process.env.DISCORD_MCP_TRANSPORT?.trim() ?? "";
  const value = raw.toLowerCase();
  if (value === "" || value === "stdio") return "stdio";
  if (value === "http") return "http";
  throw new Error(
    `Invalid DISCORD_MCP_TRANSPORT: "${raw}". Accepted: stdio (the default) or http.`,
  );
}

async function main() {
  if (selectTransport() === "http") return serveHttp();
  const transport = new StdioServerTransport();
  await createServer(version).connect(transport);
  console.error(`Discord MCP Server v${version} running on stdio.`);
}

async function serveHttp() {
  // Imported on demand, so that stdio never loads the HTTP stack.
  const { exposureWarning, readHttpConfig, startHttpServer } = await import("./http.js");
  const config = readHttpConfig();
  httpServer = await startHttpServer(config, () => createServer(version));
  const { port } = httpServer.address() as AddressInfo;
  const host = config.host.includes(":") ? `[${config.host}]` : config.host;
  console.error(
    `Discord MCP Server v${version} listening on http://${host}:${port}/mcp. Allowed Host names: ${config.allowedHosts.join(", ")}.`,
  );
  const warning = exposureWarning(config);
  if (warning) console.error(warning);
}

function shutdown() {
  console.error("Shutting down Discord MCP Server...");
  if (!httpServer) {
    discord.destroy();
    process.exit(0);
  }
  // Tool calls still in flight need the Discord client: destroy it once their responses are sent.
  setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  httpServer.close(() => void discord.destroy());
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("unhandledRejection", (reason) => console.error("Unhandled rejection:", reason));
process.on("uncaughtException", (err) => console.error("Uncaught exception:", err));

main().catch((err) => {
  console.error("Fatal:", err);
  discord.destroy();
  process.exit(1);
});
