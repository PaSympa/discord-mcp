import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import { ensureConnected } from "./client.js";
import { formatToolError } from "./errors.js";
import { getAllDefinitions, handleTool, hasTool } from "./tools/index.js";

/**
 * Builds the MCP server with the tool list/call handlers wired in, leaving the
 * transport to the caller: stdio in production, in-memory in tests.
 */
export function createServer(version: string): Server {
  const server = new Server({ name: "discord-mcp", version }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async (req) => {
    if (req.params?.cursor !== undefined)
      throw new McpError(ErrorCode.InvalidParams, "Invalid cursor: tools/list is not paginated.");
    return { tools: getAllDefinitions() };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    if (!hasTool(name)) throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);

    try {
      await ensureConnected();
      return await handleTool(name, args);
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `❌ Error: ${formatToolError(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
