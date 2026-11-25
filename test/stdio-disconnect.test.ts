import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { describe, test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const ROOT = join(__dirname, "..");
const CONNECTED = pathToFileURL(join(__dirname, "fixtures", "connected.ts")).href;

const request = (id: number, method: string, params = {}) =>
  JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

const INITIALIZE = request(1, "initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "1" },
});

const ARGS = ["--import", "tsx", "--import", CONNECTED, "src/index.ts"];
const OPTIONS = {
  cwd: ROOT,
  env: { ...process.env, DISCORD_TOKEN: "test", DISCORD_MCP_TRANSPORT: "stdio" },
};

async function startServer(t: TestContext) {
  const child = spawn(process.execPath, ARGS, OPTIONS);
  t.after(() => child.kill("SIGKILL"));
  child.stderr.resume();
  child.stdout.setEncoding("utf8");
  child.stdin.write(INITIALIZE);
  await once(child.stdout, "data", { signal: AbortSignal.timeout(20_000) });
  return child;
}

describe("stdio disconnect", { concurrency: true }, () => {
  test("exits once the client closes stdin", { timeout: 40_000 }, async (t) => {
    const child = await startServer(t);
    const exited = once(child, "exit", { signal: AbortSignal.timeout(15_000) });
    child.stdin.end();
    assert.deepEqual(await exited, [0, null]);
  });

  test("exits when stdin is the null device", { timeout: 40_000 }, async (t) => {
    const child = spawn(process.execPath, ARGS, { ...OPTIONS, stdio: "ignore" });
    t.after(() => child.kill("SIGKILL"));
    const exited = once(child, "exit", { signal: AbortSignal.timeout(20_000) });
    assert.deepEqual(await exited, [0, null]);
  });

  test("exits once every pipe to the client is broken", { timeout: 40_000 }, async (t) => {
    const child = await startServer(t);
    const exited = once(child, "exit", { signal: AbortSignal.timeout(15_000) });
    child.stdout.destroy();
    child.stderr.destroy();
    child.stdin.destroy();
    assert.deepEqual(await exited, [0, null]);
  });

  test("answers a request still in flight when stdin closes", { timeout: 40_000 }, async (t) => {
    const child = await startServer(t);
    const answered = once(child.stdout, "data", { signal: AbortSignal.timeout(10_000) });
    const exited = once(child, "exit", { signal: AbortSignal.timeout(15_000) });
    child.stdin.end(request(2, "tools/call", { name: "discord_list_guilds" }));
    const [line] = await answered;
    assert.equal(JSON.parse(line).id, 2);
    assert.match(line, /simulated login failure/);
    assert.deepEqual(await exited, [0, null]);
  });

  test("keeps serving a client that closes only stderr", { timeout: 40_000 }, async (t) => {
    const child = await startServer(t);
    child.stderr.destroy();
    await delay(6_500);
    const answered = once(child.stdout, "data", { signal: AbortSignal.timeout(5_000) });
    child.stdin.write(request(2, "ping"));
    const [line] = await answered;
    assert.equal(JSON.parse(line).id, 2);
    assert.equal(child.exitCode, null);
  });
});
