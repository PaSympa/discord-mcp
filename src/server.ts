import {
  ProtocolError,
  ProtocolErrorCode,
  Server,
  type ServerContext,
} from "@modelcontextprotocol/server";

import { ensureConnected } from "./client.js";
import { formatToolError } from "./errors.js";
import { getAllDefinitions, handleTool, hasTool } from "./tools/index.js";

// Served from main: replacing a file updates every client without a release, renaming it breaks them.
const ASSETS = "https://raw.githubusercontent.com/PaSympa/discord-mcp/main/.github/assets";

/**
 * Sends `notifications/progress` for a request whose client passed a progress token, and
 * nothing otherwise. It goes through the request's own `notify`: on stateless HTTP only
 * the request's stream reaches the client. A failed send is dropped, never thrown.
 */
function progressReporter(req: ServerContext["mcpReq"]): (progress: number, total: number) => void {
  const progressToken = req._meta?.progressToken;
  if (progressToken === undefined) return () => {};
  const send = async (progress: number, total: number) =>
    req.notify({ method: "notifications/progress", params: { progressToken, progress, total } });
  return (progress, total) => {
    send(progress, total).catch(() => {});
  };
}

/**
 * Builds the MCP server with the tool list/call handlers wired in, leaving the
 * transport to the caller: stdio in production, in-memory in tests.
 */
export function createServer(version: string): Server {
  const server = new Server(
    {
      name: "discord-mcp",
      title: "discord-mcp",
      version,
      websiteUrl: "https://pasympa.github.io/discord-mcp/",
      icons: [
        { src: `${ASSETS}/logo.svg`, mimeType: "image/svg+xml" },
        { src: `${ASSETS}/logo-512.png`, mimeType: "image/png" },
      ],
    },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler("tools/list", async (req) => {
    if (req.params?.cursor !== undefined)
      throw new ProtocolError(
        ProtocolErrorCode.InvalidParams,
        "Invalid cursor: tools/list is not paginated.",
      );
    return { tools: getAllDefinitions() };
  });

  server.setRequestHandler("tools/call", async (req, ctx) => {
    const { name, arguments: args = {} } = req.params;
    if (!hasTool(name))
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, `Unknown tool: ${name}`);

    try {
      await ensureConnected();
      return await handleTool(name, args, {
        signal: ctx.mcpReq.signal,
        progress: progressReporter(ctx.mcpReq),
      });
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `❌ Error: ${formatToolError(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
