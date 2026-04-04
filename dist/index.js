#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Discord MCP Server — Entry point.
 *
 * Sets up the MCP server over stdio, registers tool definitions from
 * the modular `tools/` directory, and routes incoming tool calls.
 * The Discord client is initialized in `client.ts`.
 */
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const fs_1 = require("fs");
const path_1 = require("path");
const client_js_1 = require("./client.js");
const index_js_2 = require("./tools/index.js");
const pkg = JSON.parse((0, fs_1.readFileSync)((0, path_1.join)(__dirname, "..", "package.json"), "utf-8"));
const version = pkg.version;
// ─── MCP Server ────────────────────────────────────────────────────────────────
const server = new index_js_1.Server({ name: "discord-mcp", version }, { capabilities: { tools: {} } });
// ─── Tool Definitions ──────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: (0, index_js_2.getAllDefinitions)(),
}));
// ─── Tool Handler ───────────────────────────────────────────────────────────────
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
        await (0, client_js_1.ensureConnected)();
        return await (0, index_js_2.handleTool)(name, args);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `❌ Error: ${message}` }], isError: true };
    }
});
// ─── Start ─────────────────────────────────────────────────────────────────────
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
    console.error(`Discord MCP Server v${version} running on stdio.`);
}
function shutdown() {
    console.error("Shutting down Discord MCP Server...");
    client_js_1.discord.destroy();
    process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
main().catch((err) => { console.error("Fatal:", err); client_js_1.discord.destroy(); process.exit(1); });
//# sourceMappingURL=index.js.map