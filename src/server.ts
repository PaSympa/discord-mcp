import {
  ProtocolError,
  ProtocolErrorCode,
  Server,
  type JSONRPCRequest,
  type Result,
  type ServerContext,
} from "@modelcontextprotocol/server";

import { ensureConnected } from "./client.js";
import { CONFIRM_TIMEOUT_MS, ConfirmationStop, Confirmations, confirmMode } from "./confirm.js";
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

/** Read at startup, so that an invalid value stops the server in HTTP mode too. */
const CONFIRM = confirmMode();

type Handler = (request: JSONRPCRequest, ctx: ServerContext) => Promise<Result>;

/**
 * A `Server` that hands each whole tools/call to `confirmations`. The SDK answers some
 * confirmations by itself, without running the tool handler again: only a hook around
 * its own handling sees those results.
 */
class DiscordServer extends Server {
  readonly confirmations = new Confirmations();

  protected override _wrapHandler(method: string, handler: Handler): Handler {
    const wrapped = super._wrapHandler(method, handler);
    if (method !== "tools/call") return wrapped;
    return (request, ctx) =>
      this.confirmations.settle(ctx.mcpReq.signal, () => wrapped(request, ctx));
  }
}

/**
 * Builds the MCP server with the tool list/call handlers wired in, leaving the
 * transport to the caller: stdio in production, in-memory in tests. `confirmTimeoutMs`
 * is how long a confirmation waits for the human.
 */
export function createServer(
  version: string,
  { confirmTimeoutMs = CONFIRM_TIMEOUT_MS } = {},
): Server {
  const server = new DiscordServer(
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
    { capabilities: { tools: {} }, inputRequired: { roundTimeoutMs: confirmTimeoutMs } },
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
    // Stateless HTTP serves each request without the initialize, so no capability is known there.
    const asks = CONFIRM && server.getClientCapabilities()?.elicitation?.form !== undefined;
    const confirm = asks ? server.confirmations.gate(ctx.mcpReq) : undefined;

    try {
      await ensureConnected();
      return await handleTool(name, args, {
        signal: ctx.mcpReq.signal,
        progress: progressReporter(ctx.mcpReq),
        confirm,
      });
    } catch (err: unknown) {
      if (err instanceof ConfirmationStop) return err.result;
      return {
        content: [{ type: "text", text: `❌ Error: ${formatToolError(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}
