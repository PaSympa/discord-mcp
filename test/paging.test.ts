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
  for (const field of ["before", "after", "around", "since"]) {
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
  assert.ok(!("around" in calls[0]), "an absent cursor must not be sent as an undefined key");
});

test("read_messages passes before through untouched", async () => {
  const calls = captureFetches();
  await read()({ channel_id: CHANNEL, before: OLDEST, limit: 100 });
  assert.equal(calls[0].before, OLDEST);
  assert.ok(!("after" in calls[0]));
  assert.equal(calls[0].limit, 100);
  assert.equal(calls[0].cache, false, "history reads must not fill the message cache");
});

test("read_messages passes around through untouched", async () => {
  const calls = captureFetches();
  await read()({ channel_id: CHANNEL, around: OLDEST });
  assert.equal(calls[0].around, OLDEST);
  assert.ok(!("before" in calls[0]));
  assert.ok(!("after" in calls[0]));
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
  const calls = captureFetches();
  for (const args of [
    { channel_id: CHANNEL, before: OLDEST, after: OLDEST },
    { channel_id: CHANNEL, before: OLDEST, around: OLDEST },
    { channel_id: CHANNEL, before: OLDEST, since: "2026-08-01" },
    { channel_id: CHANNEL, after: OLDEST, around: OLDEST },
    { channel_id: CHANNEL, after: OLDEST, since: "2026-08-01" },
    { channel_id: CHANNEL, around: OLDEST, since: "2026-08-01" },
    { channel_id: CHANNEL, before: OLDEST, after: OLDEST, around: OLDEST },
  ]) {
    await assert.rejects(
      () => read()(args),
      (error: unknown) => {
        assert.ok(error instanceof ZodError);
        assert.match(
          error.issues.map((issue) => issue.message).join(" "),
          /at most one/i,
          "the rejection must name the constraint, not just fail",
        );
        return true;
      },
      JSON.stringify(args),
    );
  }
  assert.equal(calls.length, 0, "an invalid cursor combination must not reach the Discord API");
});

test("read_messages accepts only timezone-stable since forms", async () => {
  const calls = captureFetches();
  // Each accepted form names one instant regardless of the server's TZ; the
  // assertion pins that instant so a regression to local-time parsing fails here.
  const accepted: [string, string][] = [
    ["2026-08-01", "2026-08-01T00:00:00.000Z"],
    ["2026-08-01T09:00:00Z", "2026-08-01T09:00:00.000Z"],
    ["2026-08-01T09:00:00.250Z", "2026-08-01T09:00:00.250Z"],
    ["2026-08-01T09:00:00+02:00", "2026-08-01T07:00:00.000Z"],
    ["2026-08-01T09:00:00-07:00", "2026-08-01T16:00:00.000Z"],
  ];
  for (const [since, instant] of accepted) {
    await read()({ channel_id: CHANNEL, since });
    const after = calls.at(-1)!.after as string;
    assert.equal(
      new Date(Number(SnowflakeUtil.timestampFrom(after))).toISOString(),
      instant,
      since,
    );
  }
  assert.equal(calls.length, accepted.length);

  // An offset-less date-time would be read in the server's local timezone, so it
  // is rejected along with everything that is not ISO 8601.
  for (const since of [
    "2026-08-01T09:00:00",
    "2026-08-01 09:00:00Z",
    "2026",
    "2026-08",
    "08/01/2026",
    "1754038800000",
    "last tuesday",
  ]) {
    await assert.rejects(
      () => read()({ channel_id: CHANNEL, since }),
      (error: unknown) => {
        assert.ok(error instanceof ZodError);
        assert.match(
          error.issues.map((issue) => issue.message).join(" "),
          /explicit offset/,
          "the rejection must say what an acceptable since looks like",
        );
        return true;
      },
      since,
    );
  }
  assert.equal(calls.length, accepted.length, "a rejected since must not reach the Discord API");
});
