import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { discord } from "../src/client.js";
import { messageText, textUpTo } from "../src/tools/define.js";
import { selectModules } from "../src/tools/index.js";
import type { ToolModule } from "../src/tools/types.js";
import messages from "../src/tools/messages.js";
import channels from "../src/tools/channels.js";
import roles from "../src/tools/roles.js";
import forums from "../src/tools/forums.js";
import webhooks from "../src/tools/webhooks.js";
import scheduledEvents from "../src/tools/scheduledEvents.js";
import dm from "../src/tools/dm.js";
import moderation from "../src/tools/moderation.js";

afterEach(() => mock.restoreAll());

type Schema = Record<string, unknown> & {
  properties?: Record<string, Schema>;
  items?: Schema;
  anyOf?: Schema[];
};

function inputSchema(mod: ToolModule, tool: string): Schema {
  const def = mod.definitions.find((d) => d.name === tool);
  assert.ok(def, `${tool} not found`);
  return def.inputSchema as Schema;
}

function schemaAt(schema: Schema, path: (string | number)[]): Schema {
  return path.reduce<Schema>((node, key) => {
    const next = typeof key === "number" ? node.items : node.properties?.[key];
    assert.ok(next, `no schema at ${path.join(".")}`);
    return next;
  }, schema);
}

/** Builds args holding `value` at `path`, e.g. ["embeds", 0, "fields"] gives { embeds: [{ fields }] }. */
function argsWith(path: (string | number)[], value: unknown): Record<string, unknown> {
  return path.reduceRight<unknown>(
    (inner, key) => (typeof key === "number" ? [inner] : { [key]: inner }),
    value,
  ) as Record<string, unknown>;
}

/** Runs a handler on args that miss a required ID, so parsing always fails before any request. */
async function issuesFor(mod: ToolModule, tool: string, args: Record<string, unknown>) {
  try {
    await mod.handlers.get(tool)!(args);
  } catch (err) {
    assert.ok(err instanceof ZodError, `${tool} must fail at parse time, got ${String(err)}`);
    return err.issues;
  }
  assert.fail(`${tool} accepted args without its required ID`);
}

const FIELD = { name: "n", value: "v" };

const LIMITS: [ToolModule, string, (string | number)[], number][] = [
  [messages, "discord_send_message", ["content"], 2000],
  [messages, "discord_reply_message", ["content"], 2000],
  [messages, "discord_edit_message", ["content"], 2000],
  [messages, "discord_create_thread", ["name"], 100],
  [messages, "discord_send_embed", ["fields"], 25],
  [messages, "discord_edit_embed", ["fields"], 25],
  [messages, "discord_send_multiple_embeds", ["embeds", 0, "fields"], 25],
  [channels, "discord_create_channel", ["name"], 100],
  [channels, "discord_edit_channel", ["name"], 100],
  [roles, "discord_create_role", ["name"], 100],
  [roles, "discord_edit_role", ["name"], 100],
  [forums, "discord_create_forum_channel", ["name"], 100],
  [forums, "discord_create_forum_post", ["title"], 100],
  [forums, "discord_create_forum_post", ["content"], 2000],
  [forums, "discord_reply_to_forum", ["content"], 2000],
  [forums, "discord_set_forum_tags", ["tags", 0, "name"], 20],
  [forums, "discord_update_forum_post", ["title"], 100],
  [webhooks, "discord_create_webhook", ["name"], 80],
  [webhooks, "discord_send_webhook_message", ["content"], 2000],
  [webhooks, "discord_send_webhook_message", ["embeds", 0, "fields"], 25],
  [webhooks, "discord_edit_webhook", ["name"], 80],
  [webhooks, "discord_edit_webhook_message", ["content"], 2000],
  [webhooks, "discord_edit_webhook_message", ["embeds", 0, "fields"], 25],
  [scheduledEvents, "discord_create_scheduled_event", ["name"], 100],
  [scheduledEvents, "discord_create_scheduled_event", ["description"], 1000],
  [scheduledEvents, "discord_edit_scheduled_event", ["name"], 100],
  [scheduledEvents, "discord_edit_scheduled_event", ["description"], 1000],
  [dm, "discord_send_dm", ["content"], 2000],
  [dm, "discord_send_dm_embed", ["fields"], 25],
  [dm, "discord_edit_dm", ["content"], 2000],
  [dm, "discord_edit_dm_embed", ["fields"], 25],
  [dm, "discord_reply_dm", ["content"], 2000],
];

for (const [mod, tool, path, max] of LIMITS) {
  const where = `${tool}.${path.join(".")}`;
  const isList = path.at(-1) === "fields";
  const sized = (n: number) => (isList ? Array.from({ length: n }, () => FIELD) : "x".repeat(n));

  test(`${where} advertises and enforces its limit of ${max}`, async () => {
    const node = schemaAt(inputSchema(mod, tool), path);
    assert.equal(node[isList ? "maxItems" : "maxLength"], max);
    assert.match(String(node.description), new RegExp(`(max|up to) ${max}\\b`, "i"));

    const over = await issuesFor(mod, tool, argsWith(path, sized(max + 1)));
    assert.ok(
      over.some((i) => JSON.stringify(i.path) === JSON.stringify(path)),
      `${max + 1} must be refused at ${where}`,
    );
    const at = await issuesFor(mod, tool, argsWith(path, sized(max)));
    assert.ok(
      !at.some((i) => JSON.stringify(i.path) === JSON.stringify(path)),
      `${max} must be accepted at ${where}`,
    );
  });
}

test("text limits count code points, as JSON Schema's maxLength does", () => {
  const emoji = "\u{1F600}";
  assert.ok(messageText.safeParse(emoji.repeat(2000)).success, "2000 emoji are 2000 characters");
  assert.ok(!messageText.safeParse(emoji.repeat(2001)).success);
  assert.ok(textUpTo(20).safeParse(emoji.repeat(20)).success);
  assert.ok(!textUpTo(20).safeParse("x".repeat(21)).success);
  assert.equal(
    textUpTo(20).safeParse("x".repeat(21)).error?.issues[0].message,
    "Must be at most 20 characters.",
  );
});

function describedProperties(schema: Schema, path: string, out: [string, Schema, string][]) {
  if (typeof schema.description === "string") out.push([path, schema, schema.description]);
  for (const [key, child] of Object.entries(schema.properties ?? {}))
    describedProperties(child, `${path}.${key}`, out);
  if (schema.items) describedProperties(schema.items, `${path}[]`, out);
}

test("every limit a parameter's text announces is carried by its schema", () => {
  delete process.env.DISCORD_MCP_TOOLSETS;
  const props: [string, Schema, string][] = [];
  for (const mod of selectModules())
    for (const def of mod.definitions)
      describedProperties(def.inputSchema as Schema, def.name, props);

  const variants = (s: Schema) => [s, ...(s.anyOf ?? [])];
  let checked = 0;
  for (const [path, schema, text] of props) {
    const chars = /\bmax (\d+) characters\b/i.exec(text);
    if (chars) {
      checked++;
      const n = Number(chars[1]);
      assert.ok(
        variants(schema).some((v) => v.maxLength === n),
        `${path} says max ${n} characters`,
      );
    }
    const items = /\b(?:up to|max) (\d+)\b/i.exec(text);
    if (items && !chars && variants(schema).some((v) => v.type === "array")) {
      checked++;
      const n = Number(items[1]);
      assert.ok(
        variants(schema).some((v) => v.maxItems === n),
        `${path} says up to ${n} items`,
      );
    }
    const range = /\((\d+)\s*[–-]\s*(\d+)[),]/.exec(text);
    if (range && schema.type === "integer") {
      checked++;
      assert.equal(schema.minimum, Number(range[1]), `${path} minimum`);
      assert.equal(schema.maximum, Number(range[2]), `${path} maximum`);
    }
  }
  assert.ok(checked >= LIMITS.length, `only ${checked} announced limits found`);
});

test("get_audit_log advertises action_type as a plain integer, with no enum from discord.js", async () => {
  const actionType = inputSchema(moderation, "discord_get_audit_log").properties!.action_type;
  assert.equal(actionType.type, "integer");
  assert.equal(actionType.minimum, 1);
  assert.equal(actionType.anyOf, undefined);
  assert.equal(actionType.enum, undefined);

  const fetchAuditLogs = mock.fn(async () => ({ entries: [] }));
  mock.method(discord.guilds, "fetch", async () => ({ fetchAuditLogs }));
  const run = moderation.handlers.get("discord_get_audit_log")!;
  // 16 and 33 are the IDs newer discord-api-types releases added to the enum.
  for (const type of [22, 16, 33, 999]) {
    const result = await run({ guild_id: "100000000000000001", action_type: type });
    assert.ok(!result.isError);
  }
  assert.deepEqual(
    fetchAuditLogs.mock.calls.map((c) => (c.arguments as unknown as [{ type: number }])[0].type),
    [22, 16, 33, 999],
  );
  for (const bad of [0, -1, 2.5, "22"])
    await assert.rejects(run({ guild_id: "100000000000000001", action_type: bad }), ZodError);
  assert.equal(fetchAuditLogs.mock.callCount(), 4);
});
