import "./env-setup.js";
import "./read-only-env.js";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { discord } from "../src/client.js";
import { createServer } from "../src/server.js";
import { hasTool, readOnlyMode, selectModules, selectTools } from "../src/tools/index.js";

type SelectionEnv = { DISCORD_MCP_READ_ONLY?: string; DISCORD_MCP_TOOLSETS?: string };

/** Runs fn with exactly these selection variables set (a missing one is unset), then restores both. */
function withEnv(env: SelectionEnv, fn: () => void): void {
  const keys = ["DISCORD_MCP_READ_ONLY", "DISCORD_MCP_TOOLSETS"] as const;
  const saved = keys.map((key) => [key, process.env[key]] as const);
  const apply = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  try {
    for (const key of keys) apply(key, env[key]);
    fn();
  } finally {
    for (const [key, value] of saved) apply(key, value);
  }
}

const sortedNames = (defs: { name: string }[]) => defs.map((d) => d.name).sort();

async function connectedClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer("0.0.0-test");
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

test("DISCORD_MCP_READ_ONLY takes only the documented values, trimmed and case-insensitive", () => {
  const accepted: [string | undefined, boolean][] = [
    [undefined, false],
    ["", false],
    ["  ", false],
    ["false", false],
    ["0", false],
    ["no", false],
    ["off", false],
    [" OFF ", false],
    ["No", false],
    ["true", true],
    ["1", true],
    ["yes", true],
    ["on", true],
    [" TRUE ", true],
    ["Yes", true],
  ];
  for (const [value, expected] of accepted) {
    withEnv({ DISCORD_MCP_READ_ONLY: value }, () =>
      assert.equal(readOnlyMode(), expected, JSON.stringify(value)),
    );
  }
  for (const value of ["maybe", "2", "enabled", "tru", "true,false"]) {
    withEnv({ DISCORD_MCP_READ_ONLY: value }, () =>
      assert.throws(
        () => selectTools(),
        {
          message: `Invalid DISCORD_MCP_READ_ONLY: "${value}". Accepted: true, 1, yes, on to enable it; false, 0, no, off to disable it.`,
        },
        value,
      ),
    );
  }
});

test("read-only mode keeps exactly the readOnlyHint tools, each with its own handler", () => {
  withEnv({}, () => {
    const off = selectTools();
    assert.deepEqual(
      sortedNames(off.definitions),
      sortedNames(selectModules().flatMap((m) => m.definitions)),
      "off filters nothing",
    );
    assert.deepEqual([...off.handlers.keys()].sort(), sortedNames(off.definitions));
  });
  withEnv({ DISCORD_MCP_READ_ONLY: "true" }, () => {
    const modules = selectModules();
    const { definitions, handlers } = selectTools();
    const expected = modules
      .flatMap((m) => m.definitions)
      .filter((d) => d.annotations?.readOnlyHint === true);
    assert.equal(definitions.length, 35, "update this pin when adding or removing a read tool");
    assert.deepEqual(sortedNames(definitions), sortedNames(expected));
    assert.deepEqual([...handlers.keys()].sort(), sortedNames(definitions));
    for (const mod of modules) {
      for (const [name, handler] of mod.handlers) {
        if (handlers.has(name)) assert.equal(handlers.get(name), handler, name);
      }
    }
  });
});

test("read-only mode narrows DISCORD_MCP_TOOLSETS instead of replacing it", () => {
  withEnv({ DISCORD_MCP_READ_ONLY: "on", DISCORD_MCP_TOOLSETS: "discovery,messages" }, () => {
    const names = sortedNames(selectTools().definitions);
    const expected = selectModules()
      .flatMap((m) => m.definitions)
      .filter((d) => d.annotations?.readOnlyHint === true);
    assert.deepEqual(names, sortedNames(expected));
    assert.ok(names.includes("discord_read_messages"), "a read tool of a selected toolset stays");
    assert.ok(!names.includes("discord_send_message"), "a write tool of a selected toolset goes");
    assert.ok(!names.includes("discord_list_roles"), "a read tool of another toolset stays out");
  });
});

test("read-only mode fails fast when the selected toolsets hold no read-only tool", () => {
  withEnv({ DISCORD_MCP_TOOLSETS: "channels" }, () => {
    assert.equal(selectTools().definitions.length, selectModules()[0].definitions.length);
  });
  withEnv({ DISCORD_MCP_READ_ONLY: "true", DISCORD_MCP_TOOLSETS: "channels" }, () => {
    assert.throws(
      () => selectTools(),
      /^Error: DISCORD_MCP_READ_ONLY leaves no tool to expose: .*\("channels"\) have no read-only tool\./,
    );
  });
});

test("a read-only server lists only read tools, and every listed tool is callable", async () => {
  const client = await connectedClient();
  const { tools } = await client.listTools();
  await client.close();
  assert.equal(tools.length, 35);
  assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true));
  const listed = new Set(tools.map((t) => t.name));
  withEnv({}, () => {
    for (const def of selectModules().flatMap((m) => m.definitions)) {
      assert.equal(
        hasTool(def.name),
        listed.has(def.name),
        `${def.name}: listed and callable differ`,
      );
    }
  });
});

test("a read-only server refuses a write tool as unknown, before any Discord call", async () => {
  mock.method(discord, "isReady", () => false as never);
  const login = mock.method(discord, "login", async () => {
    throw new Error("login refused (test)");
  });
  const client = await connectedClient();
  try {
    await assert.rejects(
      () =>
        client.callTool({
          name: "discord_send_message",
          arguments: { channel_id: "123456789012345678", content: "must not be sent" },
        }),
      (err: unknown) =>
        err instanceof McpError &&
        err.code === ErrorCode.InvalidParams &&
        err.message.includes("Unknown tool: discord_send_message"),
    );
    assert.equal(login.mock.callCount(), 0, "the refused write must not reach the Discord client");
    const read = (await client.callTool({ name: "discord_list_guilds", arguments: {} })) as {
      isError?: boolean;
      content: { text?: string }[];
    };
    assert.equal(read.isError, true);
    assert.match(read.content[0].text ?? "", /login refused \(test\)/);
    assert.equal(login.mock.callCount(), 1, "a read tool still reaches the Discord client");
  } finally {
    await client.close();
    mock.restoreAll();
  }
});
