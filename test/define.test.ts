import { test } from "node:test";
import assert from "node:assert/strict";
import { ZodError, z } from "zod";
import { snowflake, guildId, defineTool, defineModule, structured } from "../src/tools/define.js";
import messages from "../src/tools/messages.js";

const VALID_ID = "123456789012345678";

test("snowflake accepts a valid ID and rejects malformed ones", () => {
  assert.equal(snowflake.parse(VALID_ID), VALID_ID);
  assert.throws(() => snowflake.parse("123"), ZodError);
  assert.throws(() => snowflake.parse("not-an-id"), ZodError);
  assert.throws(() => snowflake.parse(42), ZodError);
});

test("derived inputSchema is a bare object schema with no $schema key", () => {
  const read = messages.definitions.find((d) => d.name === "discord_read_messages");
  assert.ok(read, "discord_read_messages should be defined");
  const schema = read.inputSchema as Record<string, unknown>;
  assert.equal(schema.type, "object");
  assert.ok(!("$schema" in schema), "$schema must be stripped from inputSchema");
  const props = schema.properties as Record<string, unknown>;
  assert.ok(props.channel_id && props.limit, "properties should be derived from the zod schema");
  assert.deepEqual(schema.required, ["channel_id"]);
});

test("field descriptions propagate from .describe() into the inputSchema", () => {
  const send = messages.definitions.find((d) => d.name === "discord_send_message");
  const props = (send!.inputSchema as { properties: Record<string, { description?: string }> })
    .properties;
  assert.ok((props.content.description ?? "").length > 0, "field description must propagate");
});

test("handle rejects invalid args before reaching the Discord API", async () => {
  // A malformed channel_id fails zod validation synchronously, with no network call.
  await assert.rejects(
    () => messages.handlers.get("discord_read_messages")!({ channel_id: "bad" }),
    ZodError,
  );
});

test("a module exposes no handler for a tool it does not own", () => {
  assert.equal(messages.handlers.get("discord_not_a_messages_tool"), undefined);
});

test("bounded integer fields advertise integer + min/max + default in the inputSchema", () => {
  const read = messages.definitions.find((d) => d.name === "discord_read_messages");
  const limit = (read!.inputSchema as { properties: Record<string, Record<string, unknown>> })
    .properties.limit;
  assert.equal(limit.type, "integer");
  assert.equal(limit.minimum, 1);
  assert.equal(limit.maximum, 100);
  assert.equal(limit.default, 20);
});

test("handle rejects out-of-range and non-integer numbers before reaching the Discord API", async () => {
  // Valid channel_id, but the bound/integer check on limit fails synchronously with no network call.
  const readMessages = messages.handlers.get("discord_read_messages")!;
  await assert.rejects(() => readMessages({ channel_id: VALID_ID, limit: 500 }), ZodError);
  await assert.rejects(() => readMessages({ channel_id: VALID_ID, limit: 0 }), ZodError);
  await assert.rejects(() => readMessages({ channel_id: VALID_ID, limit: 3.7 }), ZodError);
});

test("structured() mirrors data into both a text block and structuredContent", () => {
  const res = structured({ items: [{ id: "1" }] });
  assert.deepEqual(res.structuredContent, { items: [{ id: "1" }] });
  assert.equal(res.content[0].type, "text");
  assert.deepEqual(JSON.parse(res.content[0].text), { items: [{ id: "1" }] });
});

test("outputSchema is derived (object root) and exposed on the definition", () => {
  const mod = defineModule([
    defineTool({
      name: "t_out",
      description: "x",
      schema: z.object({}),
      outputSchema: z.object({ items: z.array(z.object({ id: z.string() })) }),
      handle: async () => structured({ items: [{ id: "1" }] }),
    }),
  ]);
  const schema = mod.definitions[0].outputSchema as Record<string, unknown>;
  assert.equal(schema.type, "object");
  assert.ok(!("$schema" in schema), "$schema must be stripped from outputSchema");
  assert.ok(
    (schema.properties as Record<string, unknown>).items,
    "output properties derived from the zod schema",
  );
});

test("structuredContent conforming to outputSchema is normalised; extra keys are dropped", async () => {
  const mod = defineModule([
    defineTool({
      name: "t_norm",
      description: "x",
      schema: z.object({}),
      outputSchema: z.object({ id: z.string() }),
      handle: async () => structured({ id: "1", extra: "dropped" }),
    }),
  ]);
  const res = await mod.handlers.get("t_norm")!({});
  assert.deepEqual(res.structuredContent, { id: "1" });
});

test("non-conforming structuredContent becomes an isError result, never ships", async () => {
  const mod = defineModule([
    defineTool({
      name: "t_bad",
      description: "x",
      schema: z.object({}),
      outputSchema: z.object({ id: z.string() }),
      handle: async () => structured({ id: 42 }),
    }),
  ]);
  const res = await mod.handlers.get("t_bad")!({});
  assert.equal(res.isError, true);
  assert.equal(res.structuredContent, undefined);
});

test("unknown argument keys are rejected and advertised via additionalProperties: false", async () => {
  const mod = defineModule([
    defineTool({
      name: "t_strict",
      description: "x",
      schema: z.object({ a: z.string() }),
      handle: async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    }),
  ]);
  const schema = mod.definitions[0].inputSchema as Record<string, unknown>;
  assert.equal(schema.additionalProperties, false);
  await assert.rejects(() => mod.handlers.get("t_strict")!({ a: "x", extra: 1 }), ZodError);
});

test("defineModule throws on duplicate tool names within a module", () => {
  const dup = () =>
    defineTool({
      name: "t_dup",
      description: "x",
      schema: z.object({}),
      handle: async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    });
  assert.throws(() => defineModule([dup(), dup()]), /Duplicate tool name in module: t_dup/);
});

test("guildId enforces DISCORD_ALLOWED_GUILDS lazily", () => {
  process.env.DISCORD_ALLOWED_GUILDS = "111111111111111111";
  try {
    assert.ok(guildId.safeParse("111111111111111111").success);
    assert.ok(!guildId.safeParse("222222222222222222").success);
  } finally {
    delete process.env.DISCORD_ALLOWED_GUILDS;
  }
  assert.ok(guildId.safeParse("222222222222222222").success, "no restriction when unset");
});
