import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

test("initialize advertises the title, website and icons that server.json declares", async () => {
  const client = await connectedClient();
  const info = client.getServerVersion();
  const manifest = JSON.parse(readFileSync(join(__dirname, "..", "server.json"), "utf8"));
  assert.equal(info?.title, manifest.title);
  assert.equal(info?.websiteUrl, manifest.websiteUrl);
  assert.deepEqual(info?.icons, manifest.icons);
  for (const icon of manifest.icons) assert.match(icon.src, /^https:\/\/.{1,247}$/);
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

test("tools that overwrite existing settings are annotated destructive", async () => {
  const client = await connectedClient();
  const { tools } = await client.listTools();
  for (const name of ["discord_update_membership_screening", "discord_lock_channel_permissions"])
    assert.equal(tools.find((t) => t.name === name)?.annotations?.destructiveHint, true, name);
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

test("a client cancellation aborts the signal the tool's requests carry", async () => {
  const { discord } = await import("../src/client.js");
  const { mock } = await import("node:test");
  const { Collection, SnowflakeUtil } = await import("discord.js");
  // ensureConnected latches once isReady is true: this test must run after the login-path one.
  mock.method(discord, "isReady", () => true as never);
  const recent = [2, 1].map((hours) => {
    const createdTimestamp = Date.now() - hours * 60 * 60 * 1000;
    const id = SnowflakeUtil.generate({ timestamp: createdTimestamp }).toString();
    return {
      id,
      author: { id: "1" },
      webhookId: null,
      createdAt: new Date(createdTimestamp),
      createdTimestamp,
    };
  });
  const channel = {
    id: "333333333333333333",
    name: "chan",
    guildId: "111111111111111111",
    guild: { members: { me: null } },
    isDMBased: () => false,
    isTextBased: () => true,
    messages: { fetch: async () => new Collection(recent.map((m) => [m.id, m])) },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  let reached!: (signal: AbortSignal) => void;
  const requestSignal = new Promise<AbortSignal>((resolve) => (reached = resolve));
  mock.method(discord.rest, "post", (_route: string, { signal }: { signal: AbortSignal }) => {
    reached(signal);
    return new Promise((_, reject) =>
      signal.addEventListener("abort", () => reject(new Error("aborted"))),
    );
  });

  const client = await connectedClient();
  const controller = new AbortController();
  const call = client.callTool(
    {
      name: "discord_bulk_delete_messages",
      arguments: { channel_id: channel.id, message_ids: recent.map((m) => m.id), dry_run: false },
    },
    undefined,
    { signal: controller.signal },
  );
  const signal = await requestSignal;
  assert.equal(signal.aborted, false);
  controller.abort();
  await assert.rejects(call);
  for (let i = 0; i < 100 && !signal.aborted; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(signal.aborted, true, "notifications/cancelled reaches the request in flight");
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

  const accessErr = new DiscordAPIError(
    { code: 50001, message: "Missing Access" },
    50001,
    403,
    "GET",
    "https://discord.com/api/v10/channels/1/messages/2",
    {},
  );
  assert.match(formatToolError(accessErr), /lacks Read Message History to fetch a single message/);

  const banErr = new DiscordAPIError(
    { code: 500000, message: "Failed to ban users" },
    500000,
    400,
    "POST",
    "https://discord.com/api/v10/guilds/1/bulk-ban",
    {},
  );
  assert.match(
    formatToolError(banErr),
    /Failed to ban users\. None of the users were banned\. Known causes: IDs that match no user, or users already banned\.$/,
  );

  assert.equal(formatToolError(new Error("boom")), "boom");
});
