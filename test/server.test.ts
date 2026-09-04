import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { ZodError, z } from "zod";
import { DiscordAPIError } from "discord.js";
import { createServer } from "../src/server.js";
import { formatToolError } from "../src/errors.js";

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer("0.0.0-test");
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test("unknown tool is a JSON-RPC InvalidParams protocol error, not a tool result", async () => {
  const client = await connectedClient();
  await assert.rejects(
    () => client.callTool({ name: "discord_nonexistent", arguments: {} }),
    (err: unknown) => err instanceof McpError && err.code === ErrorCode.InvalidParams,
  );
  await client.close();
});

test("tools/list serves every definition and rejects unexpected cursors", async () => {
  const client = await connectedClient();
  const { tools } = await client.listTools();
  assert.equal(tools.length, 100, "update this pin when adding/removing tools");
  await assert.rejects(
    () => client.listTools({ cursor: "bogus" }),
    (err: unknown) => err instanceof McpError && err.code === ErrorCode.InvalidParams,
  );
  await client.close();
});

test("a handler failure surfaces as an isError result, not a protocol error", async () => {
  const { discord } = await import("../src/client.js");
  const { mock } = await import("node:test");
  mock.method(discord, "isReady", () => false as never);
  mock.method(discord, "login", async () => {
    throw new Error("login refused (test)");
  });
  const client = await connectedClient();
  const res = (await client.callTool({
    name: "discord_list_guilds",
    arguments: {},
  })) as { isError?: boolean; content: { text?: string }[] };
  assert.equal(res.isError, true);
  assert.match(res.content[0].text ?? "", /login refused \(test\)|DISCORD_TOKEN/);
  await client.close();
  mock.restoreAll();
});

test("formatToolError flattens ZodError paths and surfaces Discord hints", () => {
  const zerr = z.object({ channel_id: z.string() }).safeParse({ channel_id: 1 });
  assert.ok(!zerr.success);
  const msg = formatToolError(zerr.error as ZodError);
  assert.match(msg, /^Invalid arguments\. channel_id: /);

  const derr = new DiscordAPIError(
    { code: 50013, message: "Missing Permissions" },
    50013,
    403,
    "DELETE",
    "https://discord.com/api/v10/x",
    {},
  );
  const dmsg = formatToolError(derr);
  assert.match(dmsg, /50013/);
  assert.match(dmsg, /Missing permissions; the bot lacks/);

  assert.equal(formatToolError(new Error("boom")), "boom");
});
