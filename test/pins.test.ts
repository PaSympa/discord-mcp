import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

// Every fixture message was sent long before any of them was pinned, so a cursor
// taken from the wrong field is visible in the assertions below.
const SENT_AT = "2025-06-15T00:00:00.000Z";
const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";

afterEach(() => mock.restoreAll());

interface PinFixture {
  id: string;
  pinnedAt: string;
}

/** Stubs the channel lookup and records the options every fetchPins receives. */
function capturePinFetches(hasMore: boolean, items: PinFixture[]): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetchPins: async (options: Record<string, unknown>) => {
        calls.push(options);
        return {
          hasMore,
          items: items.map(({ id, pinnedAt }) => ({
            message: {
              id,
              author: { tag: "someone" },
              content: `pinned ${id}`,
              createdAt: new Date(SENT_AT),
            },
            pinnedAt: new Date(pinnedAt),
          })),
        };
      },
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return calls;
}

const fetchPinned = () => messages.handlers.get("discord_fetch_pinned_messages")!;

function payload(result: { structuredContent?: unknown }): {
  messages: { id: string; timestamp: string; pinnedAt: string }[];
  hasMore: boolean;
  nextBefore: string | null;
} {
  return result.structuredContent as never;
}

// Newest-pinned first, which is the order Discord returns.
const PAGE: PinFixture[] = [
  { id: "1", pinnedAt: "2026-03-03T00:00:00.000Z" },
  { id: "2", pinnedAt: "2026-02-02T00:00:00.000Z" },
  { id: "3", pinnedAt: "2026-01-01T00:00:00.000Z" },
];

test("fetch_pinned_messages advertises limit and before as optional additions", () => {
  const definition = messages.definitions.find((d) => d.name === "discord_fetch_pinned_messages");
  assert.ok(definition, "discord_fetch_pinned_messages should be defined");
  const schema = definition.inputSchema as {
    required: string[];
    additionalProperties: boolean;
    properties: Record<string, { description?: string; maximum?: number; default?: number }>;
  };
  assert.deepEqual(schema.required, ["channel_id"], "paging inputs must not become required");
  assert.equal(schema.additionalProperties, false);
  for (const field of ["limit", "before"]) {
    assert.ok(schema.properties[field], `${field} must be advertised`);
    assert.ok(
      (schema.properties[field].description ?? "").length > 0,
      `${field} must document its format`,
    );
  }
  assert.equal(schema.properties.limit.maximum, 50, "the pins endpoint caps a page at 50, not 100");
  assert.equal(schema.properties.limit.default, 50);
});

test("fetch_pinned_messages sends no cursor and declines the cache by default", async () => {
  const calls = capturePinFetches(false, PAGE);
  await fetchPinned()({ channel_id: CHANNEL });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, 50);
  assert.equal(calls[0].cache, false, "pins must not fill the message cache");
  assert.ok(!("before" in calls[0]), "an absent cursor must not be sent as an undefined key");
});

test("fetch_pinned_messages passes before through as a Date", async () => {
  const calls = capturePinFetches(false, PAGE);
  await fetchPinned()({ channel_id: CHANNEL, before: "2026-02-02T00:00:00.000Z", limit: 10 });
  assert.ok(calls[0].before instanceof Date, "discord.js expects a DateResolvable");
  assert.equal((calls[0].before as Date).toISOString(), "2026-02-02T00:00:00.000Z");
  assert.equal(calls[0].limit, 10);
});

test("fetch_pinned_messages reports the next cursor only when a page was truncated", async () => {
  capturePinFetches(true, PAGE);
  const truncated = payload(await fetchPinned()({ channel_id: CHANNEL }));
  assert.equal(truncated.hasMore, true);
  assert.equal(
    truncated.nextBefore,
    "2026-01-01T00:00:00.000Z",
    "the cursor is the oldest pinnedAt on the page, not the newest",
  );
  assert.equal(truncated.messages.length, 3);

  mock.restoreAll();
  capturePinFetches(false, PAGE);
  const complete = payload(await fetchPinned()({ channel_id: CHANNEL }));
  assert.equal(complete.hasMore, false);
  assert.equal(complete.nextBefore, null, "a complete page must not invite another call");
});

test("fetch_pinned_messages cursors on pinnedAt, not on when the message was sent", async () => {
  capturePinFetches(true, PAGE);
  const result = payload(await fetchPinned()({ channel_id: CHANNEL }));
  const oldest = result.messages.at(-1)!;
  assert.equal(oldest.timestamp, SENT_AT, "timestamp still reports when the message was sent");
  assert.equal(oldest.pinnedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(result.nextBefore, oldest.pinnedAt, "the cursor must follow pinnedAt");
  assert.notEqual(
    result.nextBefore,
    oldest.timestamp,
    "cursoring on the sent time would re-fetch or skip pins",
  );
});

test("fetch_pinned_messages handles a channel with no pins", async () => {
  capturePinFetches(false, []);
  const empty = payload(await fetchPinned()({ channel_id: CHANNEL }));
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.hasMore, false);
  assert.equal(empty.nextBefore, null);
});

test("fetch_pinned_messages never reports hasMore without a cursor to follow", async () => {
  // Discord should not answer has_more over an empty page, but a caller looping on
  // hasMore would spin forever if it ever did.
  capturePinFetches(true, []);
  const result = payload(await fetchPinned()({ channel_id: CHANNEL }));
  assert.equal(result.nextBefore, null);
  assert.equal(result.hasMore, false, "hasMore must imply a usable nextBefore");
});

test("fetch_pinned_messages rejects an offset-less before and an over-large limit", async () => {
  const calls = capturePinFetches(false, PAGE);
  for (const args of [
    { channel_id: CHANNEL, before: "2026-02-02T00:00:00" },
    { channel_id: CHANNEL, before: "2026-02-02" },
    { channel_id: CHANNEL, before: "last tuesday" },
    { channel_id: CHANNEL, limit: 51 },
    { channel_id: CHANNEL, limit: 0 },
  ]) {
    await assert.rejects(() => fetchPinned()(args), ZodError, JSON.stringify(args));
  }
  assert.equal(calls.length, 0, "invalid arguments must not reach the Discord API");
});
