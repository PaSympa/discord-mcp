/**
 * Streamable HTTP entry point, opt-in with DISCORD_MCP_TRANSPORT=http: plain node:http,
 * a static bearer token, and one stateless MCP server plus transport per POST on /mcp.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from "node:http";
import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const MCP_PATH = "/mcp";
const LOCALHOST_NAMES = ["localhost", "127.0.0.1", "[::1]"];
const LOOPBACK = /^(?:localhost|127(?:\.\d{1,3}){3}|::1)$/i;
const MIN_TOKEN_LENGTH = 32;
/** RFC 6750 b64token: the only characters a Bearer credential can carry. */
const B64TOKEN = /^[A-Za-z0-9\-._~+/]+=*$/;
const BEARER = /^Bearer +(\S+) *$/i;
const HOSTNAME = /^(?:[a-z0-9._-]+|\[[0-9a-f:.]+\])$/i;

export interface HttpConfig {
  host: string;
  port: number;
  token: string;
  /** Hostnames accepted in the Host header, the localhost names included. */
  allowedHosts: string[];
}

/**
 * Reads the DISCORD_MCP_HTTP_* variables. Errors name the variable but never echo the token.
 * @throws {Error} If the token is missing, short, outside the b64token alphabet or equal to
 * DISCORD_TOKEN, or if the port or an allowed host is malformed.
 */
export function readHttpConfig(): HttpConfig {
  const token = readToken();
  return {
    host: process.env.DISCORD_MCP_HTTP_HOST?.trim() || "127.0.0.1",
    port: readPort(),
    token,
    allowedHosts: readAllowedHosts(),
  };
}

function readToken(): string {
  const token = process.env.DISCORD_MCP_HTTP_TOKEN ?? "";
  if (token.trim() === "") {
    throw new Error(
      "DISCORD_MCP_HTTP_TOKEN is required when DISCORD_MCP_TRANSPORT is http. Generate one with: openssl rand -hex 32",
    );
  }
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(
      `DISCORD_MCP_HTTP_TOKEN is too short: use at least ${MIN_TOKEN_LENGTH} characters. Generate one with: openssl rand -hex 32`,
    );
  }
  if (!B64TOKEN.test(token)) {
    throw new Error(
      "DISCORD_MCP_HTTP_TOKEN may only contain letters, digits and - . _ ~ + /, then optional trailing = signs (RFC 6750). Check for a space or a trailing newline.",
    );
  }
  // discord.js strips a "Bot " or "Bearer " prefix from DISCORD_TOKEN before it logs in.
  const botToken = process.env.DISCORD_TOKEN?.trim().replace(/^(?:Bot|Bearer)\s*/i, "");
  if (botToken && token === botToken) {
    throw new Error(
      "DISCORD_MCP_HTTP_TOKEN must differ from DISCORD_TOKEN: every HTTP client would hold the bot token. Generate one with: openssl rand -hex 32",
    );
  }
  return token;
}

function readPort(): number {
  const raw = process.env.DISCORD_MCP_HTTP_PORT?.trim() || "3000";
  const port = Number(raw);
  if (!/^\d{1,5}$/.test(raw) || port > 65535) {
    throw new Error(
      `Invalid DISCORD_MCP_HTTP_PORT: "${raw}". Use a port number up to 65535, such as 3000.`,
    );
  }
  return port;
}

function readAllowedHosts(): string[] {
  const extra = (process.env.DISCORD_MCP_HTTP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const hostname = HOSTNAME.test(entry) ? hostnameOf(entry) : undefined;
      if (!hostname) {
        throw new Error(
          `Invalid DISCORD_MCP_HTTP_ALLOWED_HOSTS entry: "${entry}". List hostnames without scheme, port or wildcard, such as discord-mcp.example.com, and IPv6 addresses in brackets, such as [::1].`,
        );
      }
      return hostname;
    });
  return [...new Set([...LOCALHOST_NAMES, ...extra])];
}

/** The hostname in a Host header value, lowercased and without its port, read as the SDK reads it. */
function hostnameOf(host: string): string | undefined {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return undefined;
  }
}

/** A startup warning when the server listens beyond loopback but allows only the localhost names. */
export function exposureWarning({ host, allowedHosts }: HttpConfig): string | undefined {
  if (LOOPBACK.test(host) || allowedHosts.length > LOCALHOST_NAMES.length) return undefined;
  return (
    `Warning: DISCORD_MCP_HTTP_HOST=${host} accepts connections beyond loopback, but only the Host names ${LOCALHOST_NAMES.join(", ")} are allowed. ` +
    "List the names that clients or a reverse proxy send in DISCORD_MCP_HTTP_ALLOWED_HOSTS, and reach the server from other machines over HTTPS only."
  );
}

/**
 * Listens for MCP requests on /mcp. Before the body is read, the request must pass, in
 * order: the path (404), the Host header (403), the absence of an Origin header (403),
 * the bearer token (401) and the method (405). The SDK transport then checks the rest
 * and enforces its 4 MiB body limit.
 * @param createMcpServer - Builds a fresh MCP server: a stateless transport serves one request.
 */
export function startHttpServer(
  config: HttpConfig,
  createMcpServer: () => McpServer,
): Promise<Server> {
  const expected = sha256(config.token);
  const allowedHosts = new Set(config.allowedHosts);

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.url?.split("?")[0] !== MCP_PATH) {
      return refuse(res, 404, `Not Found: the MCP endpoint is ${MCP_PATH}.`);
    }
    const hostname = hostnameOf(req.headers.host ?? "");
    if (!hostname) return refuse(res, 403, "Forbidden: missing or invalid Host header.");
    if (!allowedHosts.has(hostname)) {
      return refuse(res, 403, `Forbidden: Host "${hostname}" is not allowed.`);
    }
    // DNS rebinding: a web page reaches this server only with an Origin header, and no CORS is granted.
    if (req.headers.origin !== undefined) {
      return refuse(res, 403, "Forbidden: requests with an Origin header are refused.");
    }
    const authorization = req.headers.authorization;
    if (!authorization || !/^Bearer(?: |$)/i.test(authorization)) {
      return refuse(res, 401, "Unauthorized: missing bearer token.", {
        "WWW-Authenticate": "Bearer",
      });
    }
    const token = BEARER.exec(authorization)?.[1];
    // Both sides are SHA-256 digests of the same length: the comparison leaks neither the token nor its length.
    if (token === undefined || !timingSafeEqual(sha256(token), expected)) {
      return refuse(res, 401, "Unauthorized: invalid bearer token.", {
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      });
    }
    // Stateless: the SDK would answer a GET with an SSE stream that nothing closes, and there is no session to DELETE.
    if (req.method !== "POST") {
      return refuse(res, 405, "Method Not Allowed: this endpoint accepts POST only.", {
        Allow: "POST",
      });
    }

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    transport.onerror = (err) => console.error(`MCP HTTP transport error: ${err.message}`);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  }

  const httpServer = createServer((req, res) => {
    route(req, res).catch((err: unknown) => {
      console.error("MCP HTTP request failed:", err instanceof Error ? err.message : err);
      if (res.headersSent) res.destroy();
      else refuse(res, 500, "Internal Server Error");
    });
  });
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(config.port, config.host, () => {
      httpServer.off("error", reject);
      resolve(httpServer);
    });
  });
}

function refuse(
  res: ServerResponse,
  status: number,
  message: string,
  headers: OutgoingHttpHeaders = {},
): void {
  // Connection: close stops a refused client from streaming a body that nothing reads.
  res.writeHead(status, { ...headers, "Content-Type": "application/json", Connection: "close" });
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }));
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
