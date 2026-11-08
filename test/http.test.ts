import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { request, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { exposureWarning, readHttpConfig, startHttpServer } from "../src/http.js";
import { createServer } from "../src/server.js";
import { getAllDefinitions, selectTools } from "../src/tools/index.js";

const root = join(__dirname, "..");
const TOKEN = randomBytes(24).toString("hex");
const LOCALHOST_NAMES = ["localhost", "127.0.0.1", "[::1]"];
const AUTH = { Authorization: `Bearer ${TOKEN}` };
const MCP_HEADERS = {
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};
const LIST_TOOLS = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

const ENV_KEYS = [
  "DISCORD_TOKEN",
  "DISCORD_MCP_HTTP_TOKEN",
  "DISCORD_MCP_HTTP_HOST",
  "DISCORD_MCP_HTTP_PORT",
  "DISCORD_MCP_HTTP_ALLOWED_HOSTS",
  "DISCORD_MCP_TOOLSETS",
  "DISCORD_MCP_READ_ONLY",
] as const;
type Env = Partial<Record<(typeof ENV_KEYS)[number], string>>;

/** Runs fn with exactly these variables set among ENV_KEYS (a missing one is unset), then restores them. */
function withEnv<T>(env: Env, fn: () => T): T {
  const saved = ENV_KEYS.map((key) => [key, process.env[key]] as const);
  const apply = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    for (const key of ENV_KEYS) apply(key, env[key]);
    return fn();
  } finally {
    for (const [key, value] of saved) apply(key, value);
  }
}

const toolNames = (env: Env) => withEnv(env, () => selectTools().definitions.map((d) => d.name));

test("readHttpConfig defaults to 127.0.0.1:3000 and the localhost Host names", () => {
  assert.deepEqual(withEnv({ DISCORD_MCP_HTTP_TOKEN: TOKEN }, readHttpConfig), {
    host: "127.0.0.1",
    port: 3000,
    token: TOKEN,
    allowedHosts: LOCALHOST_NAMES,
  });
});

test("readHttpConfig reads the address, the port and extra Host names, normalized", () => {
  const env = {
    DISCORD_MCP_HTTP_TOKEN: TOKEN,
    DISCORD_MCP_HTTP_HOST: " 0.0.0.0 ",
    DISCORD_MCP_HTTP_PORT: "8080",
    DISCORD_MCP_HTTP_ALLOWED_HOSTS: " MCP.Example.com, n8n_net ,,localhost,[0:0::1]",
  };
  assert.deepEqual(withEnv(env, readHttpConfig), {
    host: "0.0.0.0",
    port: 8080,
    token: TOKEN,
    allowedHosts: [...LOCALHOST_NAMES, "mcp.example.com", "n8n_net"],
  });
});

test("http mode refuses a missing, short, malformed or reused token, without echoing it", () => {
  const bot = randomBytes(30).toString("base64url");
  const refusals: [Env, RegExp][] = [
    [{}, /^DISCORD_MCP_HTTP_TOKEN is required when DISCORD_MCP_TRANSPORT is http\./],
    [{ DISCORD_MCP_HTTP_TOKEN: "   " }, /is required/],
    [{ DISCORD_MCP_HTTP_TOKEN: "x".repeat(31) }, /is too short: use at least 32 characters/],
    [{ DISCORD_MCP_HTTP_TOKEN: `${TOKEN}\n` }, /may only contain letters, digits and/],
    [{ DISCORD_MCP_HTTP_TOKEN: `${TOKEN.slice(0, 24)} ${TOKEN.slice(24)}` }, /may only contain/],
    [{ DISCORD_MCP_HTTP_TOKEN: `${TOKEN}%` }, /may only contain/],
    [{ DISCORD_MCP_HTTP_TOKEN: `${TOKEN}=a` }, /may only contain/],
    [{ DISCORD_MCP_HTTP_TOKEN: bot, DISCORD_TOKEN: bot }, /must differ from DISCORD_TOKEN/],
    [
      { DISCORD_MCP_HTTP_TOKEN: bot, DISCORD_TOKEN: ` Bot ${bot} ` },
      /must differ from DISCORD_TOKEN/,
    ],
  ];
  for (const [env, message] of refusals) {
    withEnv(env, () =>
      assert.throws(readHttpConfig, (err: Error) => {
        assert.match(err.message, message);
        const token = env.DISCORD_MCP_HTTP_TOKEN?.trim();
        if (token) assert.ok(!err.message.includes(token), `the error echoes ${token}`);
        return true;
      }),
    );
  }
  const b64token = `${"Az09-._~+/".repeat(4)}==`;
  withEnv({ DISCORD_MCP_HTTP_TOKEN: b64token }, () =>
    assert.equal(readHttpConfig().token, b64token),
  );
});

test("readHttpConfig refuses a malformed port or allowed host", () => {
  for (const port of ["abc", "-1", "3000.5", "3e3", "65536", "123456", "0x50"]) {
    withEnv({ DISCORD_MCP_HTTP_TOKEN: TOKEN, DISCORD_MCP_HTTP_PORT: port }, () =>
      assert.throws(readHttpConfig, {
        message: `Invalid DISCORD_MCP_HTTP_PORT: "${port}". Use a port number up to 65535, such as 3000.`,
      }),
    );
  }
  const entries = [
    "*.example.com",
    "example.com:443",
    "example.com:80",
    "https://example.com",
    "example.com/mcp",
    "user@example.com",
    "::1",
    "exa mple.com",
  ];
  for (const entry of entries) {
    withEnv(
      { DISCORD_MCP_HTTP_TOKEN: TOKEN, DISCORD_MCP_HTTP_ALLOWED_HOSTS: `ok.example, ${entry}` },
      () =>
        assert.throws(readHttpConfig, (err: Error) =>
          err.message.startsWith(`Invalid DISCORD_MCP_HTTP_ALLOWED_HOSTS entry: "${entry}". `),
        ),
    );
  }
});

test("listening beyond loopback with only the localhost Host names logs a warning", () => {
  const config = { port: 3000, token: TOKEN, allowedHosts: LOCALHOST_NAMES };
  for (const host of ["127.0.0.1", "127.0.0.2", "::1", "localhost"]) {
    assert.equal(exposureWarning({ ...config, host }), undefined, host);
  }
  assert.match(
    exposureWarning({ ...config, host: "0.0.0.0" }) ?? "",
    /^Warning: DISCORD_MCP_HTTP_HOST=0\.0\.0\.0 /,
  );
  const proxied = {
    ...config,
    host: "0.0.0.0",
    allowedHosts: [...LOCALHOST_NAMES, "mcp.example.com"],
  };
  assert.equal(exposureWarning(proxied), undefined);
});

let server: Server;
let port: number;
const logs = mock.method(console, "error", () => {});

before(async () => {
  server = await startHttpServer(
    {
      host: "127.0.0.1",
      port: 0,
      token: TOKEN,
      allowedHosts: [...LOCALHOST_NAMES, "mcp.example.com"],
    },
    () => createServer("0.0.0-test"),
  );
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  logs.mock.restore();
});

type Reply = { status: number; headers: IncomingHttpHeaders; body: string };

/**
 * One raw request on a fresh connection, so that any Host or Origin header can be sent. With
 * `unfinished`, the body is written but never ended: the answer must come before the body does.
 */
function send(
  options: {
    method?: string;
    path?: string;
    headers?: Record<string, string>;
    body?: string;
    unfinished?: Buffer[];
  } = {},
): Promise<Reply> {
  const { method = "POST", path = "/mcp", headers = {}, body, unfinished } = options;
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
        req.destroy();
      });
    });
    req.on("error", reject);
    if (!unfinished) return req.end(body);
    req.flushHeaders();
    for (const chunk of unfinished) req.write(chunk);
  });
}

const rpcError = (message: string) => ({
  jsonrpc: "2.0",
  error: { code: -32000, message },
  id: null,
});
const corsHeaders = (reply: Reply) =>
  Object.keys(reply.headers).filter((h) => h.startsWith("access-control-"));

test("a missing or wrong bearer token gets 401 with a Bearer challenge", async () => {
  const basic = Buffer.from(`user:${TOKEN}`).toString("base64");
  const refusals: [Record<string, string>, string, string][] = [
    [{}, "Bearer", "Unauthorized: missing bearer token."],
    [{ Authorization: `Basic ${basic}` }, "Bearer", "Unauthorized: missing bearer token."],
    [
      { Authorization: `Bearer ${TOKEN}x` },
      'Bearer error="invalid_token"',
      "Unauthorized: invalid bearer token.",
    ],
    [
      { Authorization: `Bearer ${TOKEN.slice(1)}` },
      'Bearer error="invalid_token"',
      "Unauthorized: invalid bearer token.",
    ],
    [
      { Authorization: `Bearer ${TOKEN} more` },
      'Bearer error="invalid_token"',
      "Unauthorized: invalid bearer token.",
    ],
    [
      { Authorization: "Bearer" },
      'Bearer error="invalid_token"',
      "Unauthorized: invalid bearer token.",
    ],
  ];
  for (const [headers, challenge, message] of refusals) {
    const reply = await send({ headers: { ...MCP_HEADERS, ...headers }, body: LIST_TOOLS });
    assert.equal(reply.status, 401, JSON.stringify(headers));
    assert.equal(reply.headers["www-authenticate"], challenge);
    assert.equal(reply.headers.connection, "close");
    assert.deepEqual(JSON.parse(reply.body), rpcError(message));
  }

  const inQuery = await send({
    path: `/mcp?access_token=${TOKEN}`,
    headers: MCP_HEADERS,
    body: LIST_TOOLS,
  });
  assert.equal(inQuery.status, 401, "a token in the query string must not count");
  assert.equal(
    (await send({ method: "GET" })).status,
    401,
    "the token is checked before the method",
  );

  const lowercase = await send({
    headers: { ...MCP_HEADERS, Authorization: `bearer  ${TOKEN}` },
    body: LIST_TOOLS,
  });
  assert.equal(lowercase.status, 200, "the scheme is case-insensitive");
});

test("a foreign Host gets 403, whatever the token; the port and the case do not matter", async () => {
  for (const host of [
    "evil.example",
    `evil.example:${port}`,
    "127.0.0.1.nip.io",
    "localhost.evil.example",
  ]) {
    const reply = await send({
      headers: { ...MCP_HEADERS, ...AUTH, Host: host },
      body: LIST_TOOLS,
    });
    assert.equal(reply.status, 403, host);
    assert.equal(reply.headers.connection, "close");
    const hostname = host.split(":")[0];
    assert.deepEqual(
      JSON.parse(reply.body),
      rpcError(`Forbidden: Host "${hostname}" is not allowed.`),
    );
  }
  for (const host of [
    `localhost:${port}`,
    `LOCALHOST:${port}`,
    `127.0.0.1:${port}`,
    `[::1]:${port}`,
    "MCP.example.com",
    "mcp.example.com:443",
  ]) {
    const reply = await send({
      headers: { ...MCP_HEADERS, ...AUTH, Host: host },
      body: LIST_TOOLS,
    });
    assert.equal(reply.status, 200, host);
  }
});

test("any Origin gets 403, and no response grants CORS", async () => {
  for (const origin of [
    "https://evil.example",
    "null",
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ]) {
    const reply = await send({
      headers: { ...MCP_HEADERS, ...AUTH, Origin: origin },
      body: LIST_TOOLS,
    });
    assert.equal(reply.status, 403, origin);
    assert.deepEqual(
      JSON.parse(reply.body),
      rpcError("Forbidden: requests with an Origin header are refused."),
    );
    assert.deepEqual(corsHeaders(reply), []);
  }
  const preflight = await send({
    method: "OPTIONS",
    headers: {
      Origin: "https://evil.example",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  });
  assert.equal(preflight.status, 403);
  assert.deepEqual(corsHeaders(preflight), []);
  const served = await send({ headers: { ...MCP_HEADERS, ...AUTH }, body: LIST_TOOLS });
  assert.equal(served.status, 200);
  assert.deepEqual(corsHeaders(served), []);
});

test("GET, DELETE and the other methods get 405 before the transport", async () => {
  for (const method of ["GET", "DELETE", "PUT", "PATCH", "OPTIONS", "HEAD"]) {
    const reply = await send({ method, headers: { ...AUTH, Accept: "text/event-stream" } });
    assert.equal(reply.status, 405, method);
    assert.equal(reply.headers.allow, "POST");
    assert.equal(reply.headers.connection, "close");
  }
});

test("only /mcp is served: every other path gets 404, OAuth discovery included", async () => {
  const paths = [
    "/",
    "/mcp/",
    "/MCP",
    "/sse",
    "/messages",
    "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server",
  ];
  for (const path of paths) {
    const reply = await send({ path, headers: { ...MCP_HEADERS, ...AUTH }, body: LIST_TOOLS });
    assert.equal(reply.status, 404, path);
    assert.deepEqual(JSON.parse(reply.body), rpcError("Not Found: the MCP endpoint is /mcp."));
  }
});

test("a body over the SDK's 4 MiB limit gets 413, declared or streamed", async () => {
  const limit = 4 * 1024 * 1024;
  const tooLarge = rpcError(`Payload Too Large: Request body must not exceed ${limit} bytes`);
  const declared = await send({
    headers: { ...MCP_HEADERS, ...AUTH, "Content-Length": String(limit + 1) },
    unfinished: [],
  });
  assert.equal(declared.status, 413, "a declared length over the limit is refused unread");
  assert.deepEqual(JSON.parse(declared.body), tooLarge);

  const streamed = await send({
    headers: { ...MCP_HEADERS, ...AUTH, "Transfer-Encoding": "chunked" },
    unfinished: [
      ...Array.from({ length: 4 }, () => Buffer.alloc(1024 * 1024, " ")),
      Buffer.from(" "),
    ],
  });
  assert.equal(streamed.status, 413, "the read stops one byte past the limit");
  assert.deepEqual(JSON.parse(streamed.body), tooLarge);
});

test("a 2026-07-28 request gets the SDK's 400 unchanged, which Codex reads as a cue to fall back to initialize", async () => {
  // openai/codex rmcp-client, has_legacy_fallback_evidence: a 400 with code -32000, a null id, this
  // exact message prefix and only dated versions older than 2026-07-28. Do not pre-parse or rewrite it.
  const reply = await send({
    headers: { ...MCP_HEADERS, ...AUTH, "MCP-Protocol-Version": "2026-07-28" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "server/discover" }),
  });
  assert.equal(reply.status, 400);
  assert.equal(reply.headers["content-type"], "application/json");
  assert.equal(
    reply.body,
    '{"jsonrpc":"2.0","error":{"code":-32000,"message":"Bad Request: Unsupported protocol version: 2026-07-28 (supported versions: 2025-11-25, 2025-06-18, 2025-03-26, 2024-11-05, 2024-10-07)"},"id":null}',
  );
  assert.ok(
    logs.mock.calls.some((call) =>
      String(call.arguments[0]).includes("Unsupported protocol version: 2026-07-28"),
    ),
    "transport errors are logged",
  );
});

test("SDK clients initialize, list the tools and call them over HTTP with the token", async () => {
  const url = new URL(`http://127.0.0.1:${port}/mcp`);
  const expected = getAllDefinitions().map((d) => d.name);
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      const client = new Client({ name: "http-test", version: "0.0.0" });
      await client.connect(
        new StreamableHTTPClientTransport(url, { requestInit: { headers: AUTH } }),
      );
      assert.equal(client.getServerVersion()?.name, "discord-mcp");
      const { tools } = await client.listTools();
      assert.deepEqual(
        tools.map((tool) => tool.name),
        expected,
      );
      await assert.rejects(
        () => client.callTool({ name: "discord_nonexistent", arguments: {} }),
        (err: unknown) => err instanceof McpError && err.code === ErrorCode.InvalidParams,
      );
      await client.close();
    }),
  );

  const wrong = new Client({ name: "http-test", version: "0.0.0" });
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${randomBytes(24).toString("hex")}` } },
  });
  await assert.rejects(
    () => wrong.connect(transport),
    (err: unknown) => err instanceof StreamableHTTPError && err.code === 401,
  );
});

test("no log line carries the bearer token", () => {
  assert.ok(logs.mock.callCount() > 0);
  for (const call of logs.mock.calls) {
    assert.ok(!call.arguments.map(String).join(" ").includes(TOKEN), "a log line prints the token");
  }
});

/** The parent env minus every DISCORD_ and DOTENV_ variable, with a .env path that does not exist. */
function childEnv(env: Record<string, string>): NodeJS.ProcessEnv {
  const inherited = Object.entries(process.env).filter(([key]) => !/^(DISCORD_|DOTENV_)/.test(key));
  return {
    ...Object.fromEntries(inherited),
    DOTENV_CONFIG_PATH: join(root, ".env.does-not-exist"),
    ...env,
  };
}

/** Starts src/index.ts the way npx starts dist/index.js, collecting its stderr. */
function startIndex(env: Record<string, string>) {
  const child = spawn(process.execPath, ["--import", "tsx", join("src", "index.ts")], {
    cwd: root,
    env: childEnv(env),
    stdio: "pipe",
  });
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on("close", (code, signal) => resolve({ code, signal })),
  );
  return { child, closed, stderr: () => stderr };
}

async function listeningPort(run: ReturnType<typeof startIndex>): Promise<number> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const found = /listening on http:\/\/127\.0\.0\.1:(\d+)\/mcp\./.exec(run.stderr())?.[1];
    if (found) return Number(found);
    if (run.child.exitCode !== null) break;
    await sleep(50);
  }
  throw new Error(`The server never listened. stderr:\n${run.stderr()}`);
}

test(
  "startup stops on an unknown transport or a bad token, and never prints a token",
  { timeout: 60_000 },
  async () => {
    const bot = randomBytes(30).toString("base64url");
    const runs: [Record<string, string>, RegExp][] = [
      [
        { DISCORD_MCP_TRANSPORT: "sse" },
        /Invalid DISCORD_MCP_TRANSPORT: "sse"\. Accepted: stdio \(the default\) or http\./,
      ],
      [
        { DISCORD_MCP_TRANSPORT: "http" },
        /DISCORD_MCP_HTTP_TOKEN is required when DISCORD_MCP_TRANSPORT is http\./,
      ],
      [
        {
          DISCORD_MCP_TRANSPORT: "http",
          DISCORD_MCP_HTTP_TOKEN: "short-secret-0123456789",
          DISCORD_TOKEN: bot,
        },
        /DISCORD_MCP_HTTP_TOKEN is too short/,
      ],
      [
        { DISCORD_MCP_TRANSPORT: " HTTP ", DISCORD_MCP_HTTP_TOKEN: bot, DISCORD_TOKEN: bot },
        /DISCORD_MCP_HTTP_TOKEN must differ from DISCORD_TOKEN/,
      ],
    ];
    await Promise.all(
      runs.map(async ([env, message]) => {
        const run = startIndex(env);
        const { code } = await run.closed;
        assert.equal(code, 1, run.stderr());
        assert.match(run.stderr(), message);
        for (const secret of [env.DISCORD_MCP_HTTP_TOKEN, env.DISCORD_TOKEN]) {
          if (secret) assert.ok(!run.stderr().includes(secret), "stderr prints a token");
        }
      }),
    );
  },
);

test(
  "http mode outlives a closed stdin, applies toolsets and read-only mode, and exits on SIGTERM",
  {
    timeout: 60_000,
    skip: process.platform === "win32" && "Windows cannot deliver SIGTERM to a handler",
  },
  async () => {
    const bot = randomBytes(30).toString("base64url");
    const selection = { DISCORD_MCP_TOOLSETS: "discovery,messages", DISCORD_MCP_READ_ONLY: "true" };
    const run = startIndex({
      DISCORD_MCP_TRANSPORT: "http",
      DISCORD_MCP_HTTP_TOKEN: TOKEN,
      DISCORD_MCP_HTTP_PORT: "0",
      DISCORD_TOKEN: bot,
      ...selection,
    });
    let killedAt: number;
    try {
      run.child.stdin.end();
      const childPort = await listeningPort(run);
      const client = new Client({ name: "http-test", version: "0.0.0" });
      const url = new URL(`http://127.0.0.1:${childPort}/mcp`);
      await client.connect(
        new StreamableHTTPClientTransport(url, { requestInit: { headers: AUTH } }),
      );
      const { tools } = await client.listTools();
      await client.close();
      assert.deepEqual(
        tools.map((tool) => tool.name),
        toolNames(selection),
      );
      assert.ok(tools.every((tool) => tool.annotations?.readOnlyHint === true));
      assert.equal(run.child.exitCode, null, "the server exited once its stdin closed");
    } finally {
      killedAt = Date.now();
      run.child.kill("SIGTERM");
    }
    assert.deepEqual(await run.closed, { code: 0, signal: null });
    assert.ok(Date.now() - killedAt < 4_000, "the shutdown waited for the 5 s backstop");
    assert.match(run.stderr(), /Shutting down Discord MCP Server/);
    assert.ok(
      !run.stderr().includes(TOKEN) && !run.stderr().includes(bot),
      "stderr prints a token",
    );
  },
);

test(
  "DISCORD_MCP_TRANSPORT=stdio, in any case, keeps the stdio server",
  { timeout: 60_000 },
  async () => {
    const run = startIndex({ DISCORD_MCP_TRANSPORT: " STDIO " });
    try {
      const reply = new Promise<string>((resolve) => {
        let out = "";
        run.child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
          out += chunk;
          if (out.includes("\n")) resolve(out.slice(0, out.indexOf("\n")));
        });
      });
      run.child.stdin.write(`${LIST_TOOLS}\n`);
      const { result } = JSON.parse(await reply);
      assert.equal(result.tools.length, toolNames({}).length);
    } finally {
      run.child.kill("SIGTERM");
    }
    await run.closed;
    assert.match(run.stderr(), /running on stdio\./);
  },
);
