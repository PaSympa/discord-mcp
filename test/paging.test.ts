import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { SnowflakeUtil } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const OLDEST = "444444444444444444";

afterEach(() => mock.restoreAll());

/** Stubs the channel lookup and records the options every messages.fetch receives. */
function captureFetches(): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async (options: Record<string, unknown>) => {
        calls.push(options);
        return new Map();
      },
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return calls;
}

const read = () => messages.handlers.get("discord_read_messages")!;

test("read_messages advertises the paging cursors as optional additions", () => {
  const definition = messages.definitions.find((d) => d.name === "discord_read_messages");
  assert.ok(definition, "discord_read_messages should be defined");
  const schema = definition.inputSchema as {
    required: string[];
    additionalProperties: boolean;
    properties: Record<string, { description?: string }>;
  };
  assert.deepEqual(schema.required, ["channel_id"], "cursors must not become required");
  assert.equal(schema.additionalProperties, false);
  for (const field of ["before", "after", "since"]) {
    assert.ok(schema.properties[field], `${field} must be advertised`);
    assert.ok(
      (schema.properties[field].description ?? "").length > 0,
      `${field} must document its format`,
    );
  }
});

test("read_messages sends no cursor when none was requested", async () => {
  const calls = captureFetches();
  await read()({ channel_id: CHANNEL });
  assert.equal(calls.length, 1);
  assert.ok(!("before" in calls[0]), "an absent cursor must not be sent as an undefined key");
  assert.ok(!("after" in calls[0]), "an absent cursor must not be sent as an undefined key");
});

test("read_messages passes before through untouched", async () => {
  const calls = captureFetches();
  await read()({ channel_id: CHANNEL, before: OLDEST, limit: 100 });
  assert.equal(calls[0].before, OLDEST);
  assert.ok(!("after" in calls[0]));
  assert.equal(calls[0].limit, 100);
  assert.equal(calls[0].cache, false, "history reads must not fill the message cache");
});

test("read_messages converts since into an after snowflake", async () => {
  const calls = captureFetches();
  await read()({ channel_id: CHANNEL, since: "2026-08-01T00:00:00Z" });
  const after = calls[0].after;
  assert.equal(typeof after, "string");
  assert.equal(
    new Date(Number(SnowflakeUtil.timestampFrom(after as string))).toISOString(),
    "2026-08-01T00:00:00.000Z",
    "the synthetic cursor must carry the requested instant",
  );
  assert.ok(!("before" in calls[0]));
});

test("read_messages clamps a pre-epoch since instead of sending a negative id", async () => {
  const calls = captureFetches();
  await read()({ channel_id: CHANNEL, since: "1999-01-01" });
  const after = calls[0].after as string;
  assert.ok(BigInt(after) > 0n, `Discord rejects negative snowflakes, got ${after}`);
  assert.equal(
    Number(SnowflakeUtil.timestampFrom(after)),
    Number(SnowflakeUtil.epoch),
    "instants before the Discord epoch clamp to it",
  );
});

test("read_messages rejects more than one cursor", async () => {
  captureFetches();
  for (const args of [
    { channel_id: CHANNEL, before: OLDEST, after: OLDEST },
    { channel_id: CHANNEL, before: OLDEST, since: "2026-08-01" },
    { channel_id: CHANNEL, after: OLDEST, since: "2026-08-01" },
  ]) {
    await assert.rejects(() => read()(args), ZodError, JSON.stringify(args));
  }
});

test("read_messages rejects a since that is not a parsable date", async () => {
  captureFetches();
  await assert.rejects(() => read()({ channel_id: CHANNEL, since: "last tuesday" }), ZodError);
});
