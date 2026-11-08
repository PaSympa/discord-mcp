import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

const ROOT = join(__dirname, "..");
const ENTRY = join(ROOT, "src", "index.ts");
const KEEPALIVE = join(__dirname, "fixtures", "keepalive.mjs");
const STARTUP_MS = 5_000;
const EXIT_MS = 5_000;

/**
 * Boots the stdio entry point, resolving once it reports itself as running.
 *
 * The keepalive preload stands in for discord.js's gateway socket: a referenced
 * handle that keeps the event loop alive. Without it the process would drain and
 * exit on its own once stdin ends, masking the bug these tests cover — login is
 * lazy, so no real gateway opens here.
 */
function startServer(): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["--import", KEEPALIVE, "--import", "tsx", ENTRY], {
    cwd: ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, DISCORD_TOKEN: "placeholder.not.used" },
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("server never reported itself running"));
    }, STARTUP_MS);
    child.stderr!.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("running on stdio")) {
        clearTimeout(timer);
        resolve(child);
      }
    });
    child.once("error", reject);
  });
}

/** Waits for exit and reports how; rejects if the child is still alive at the deadline. */
function waitForExit(
  child: ChildProcess,
  ms: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("server still alive at the deadline"));
    }, ms);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

// Regression: StdioServerTransport subscribes only to stdin's 'data'/'error', so EOF
// went unnoticed, and any active handle (the gateway socket in production) kept the
// event loop alive — a dead client left the server running indefinitely.
test("exits cleanly when stdin reaches EOF, even with an active handle open", async () => {
  const child = await startServer();
  child.stdin!.end();

  const { code, signal } = await waitForExit(child, EXIT_MS);
  assert.equal(signal, null, "expected a self-initiated exit, not a signal kill");
  assert.equal(code, 0, "expected the clean-shutdown exit code");
});

test("exits cleanly on SIGTERM", async () => {
  const child = await startServer();
  child.kill("SIGTERM");

  const { code, signal } = await waitForExit(child, EXIT_MS);
  assert.equal(signal, null, "expected the SIGTERM handler to exit, not a signal kill");
  assert.equal(code, 0, "expected the clean-shutdown exit code");
});
