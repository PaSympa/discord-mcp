import { test } from "node:test";
import assert from "node:assert/strict";
import { selectModules, hasTool } from "../src/tools/index.js";
import { assertAllowedGuild, isGuildAllowed } from "../src/client.js";

test("selectModules exposes everything when unset or `all`", () => {
  delete process.env.DISCORD_MCP_TOOLSETS;
  const all = selectModules().length;
  process.env.DISCORD_MCP_TOOLSETS = "all";
  assert.equal(selectModules().length, all);
  delete process.env.DISCORD_MCP_TOOLSETS;
});

test("selectModules picks exactly the listed toolsets, case-insensitive", () => {
  process.env.DISCORD_MCP_TOOLSETS = "Discovery, MESSAGES";
  try {
    const selected = selectModules();
    assert.equal(selected.length, 2);
    const names = selected.flatMap((m) => m.definitions.map((d) => d.name));
    assert.ok(names.includes("discord_list_guilds"), "discovery toolset selected");
    assert.ok(names.includes("discord_read_messages"), "messages toolset selected");
    assert.ok(!names.includes("discord_ban_member"), "destructive member tools must be gated off");
  } finally {
    delete process.env.DISCORD_MCP_TOOLSETS;
  }
});

test("selectModules fails fast on unknown or empty selections", () => {
  for (const value of ["messsages", "discovery messages", ",,"]) {
    process.env.DISCORD_MCP_TOOLSETS = value;
    try {
      assert.throws(() => selectModules(), /Invalid DISCORD_MCP_TOOLSETS/, value);
    } finally {
      delete process.env.DISCORD_MCP_TOOLSETS;
    }
  }
});

function assertStrictObjectSchemas(node: unknown, tool: string, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => assertStrictObjectSchemas(v, tool, `${path}[${i}]`));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const schema = node as Record<string, unknown>;
  if (schema.type === "object" && schema.properties !== undefined) {
    assert.equal(
      schema.additionalProperties,
      false,
      `${tool} at ${path}: object schema must advertise additionalProperties: false`,
    );
  }
  for (const [key, value] of Object.entries(schema)) {
    assertStrictObjectSchemas(value, tool, `${path}.${key}`);
  }
}

test("every tool's inputSchema forbids unknown keys at every nesting level", () => {
  delete process.env.DISCORD_MCP_TOOLSETS;
  for (const mod of selectModules()) {
    for (const def of mod.definitions) {
      assert.equal(
        (def.inputSchema as Record<string, unknown>).additionalProperties,
        false,
        `${def.name} root must advertise additionalProperties: false`,
      );
      assertStrictObjectSchemas(def.inputSchema, def.name, "inputSchema");
    }
  }
});

test("hasTool reflects the registry", () => {
  assert.ok(hasTool("discord_list_guilds"));
  assert.ok(!hasTool("discord_nonexistent"));
});

test("assertAllowedGuild enforces the allow-list lazily and ignores null", () => {
  process.env.DISCORD_ALLOWED_GUILDS = "111111111111111111";
  try {
    assert.ok(isGuildAllowed("111111111111111111"));
    assert.throws(() => assertAllowedGuild("222222222222222222"), /allow-list/);
    assertAllowedGuild(null);
    assertAllowedGuild(undefined);
  } finally {
    delete process.env.DISCORD_ALLOWED_GUILDS;
  }
  assertAllowedGuild("222222222222222222");
});
