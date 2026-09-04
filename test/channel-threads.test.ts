import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { ChannelType } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";

afterEach(() => mock.restoreAll());

interface ThreadFixture {
  id: string;
  name: string;
  type?: ChannelType;
  archivedAt?: string | null;
}

/** Minimal stand-in for discord.js Collection: the handler needs values() and last(). */
function collection(items: ThreadFixture[]) {
  const built = items.map((t) => ({
    id: t.id,
    name: t.name,
    type: t.type ?? ChannelType.PublicThread,
    archived: t.archivedAt !== undefined && t.archivedAt !== null,
    locked: false,
    messageCount: 3,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    archivedAt: t.archivedAt == null ? null : new Date(t.archivedAt),
  }));
  const map = new Map(built.map((t) => [t.id, t])) as Map<string, (typeof built)[number]> & {
    last(): (typeof built)[number] | undefined;
  };
  map.last = () => built.at(-1);
  return map;
}

interface Stub {
  activeCalls: number;
  archivedCalls: Record<string, unknown>[];
}

function stubChannel(opts: {
  type?: ChannelType;
  active?: ThreadFixture[];
  archived?: ThreadFixture[];
  hasMore?: boolean;
}): Stub {
  const stub: Stub = { activeCalls: 0, archivedCalls: [] };
  const channel = {
    name: "chan",
    guildId: GUILD,
    type: opts.type ?? ChannelType.GuildText,
    isDMBased: () => false,
    isTextBased: () => true,
    threads: {
      fetchActive: async () => {
        stub.activeCalls++;
        return { threads: collection(opts.active ?? []) };
      },
      fetchArchived: async (options: Record<string, unknown>) => {
        stub.archivedCalls.push(options);
        return { threads: collection(opts.archived ?? []), hasMore: opts.hasMore ?? false };
      },
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return stub;
}

const listThreads = () => messages.handlers.get("discord_list_channel_threads")!;

function payload(result: { structuredContent?: unknown }): {
  threads: { id: string; name: string; private: boolean; archived: boolean | null }[];
  hasMore: boolean;
  nextBefore: string | null;
} {
  return result.structuredContent as never;
}

const ACTIVE: ThreadFixture[] = [{ id: "a1", name: "live" }];
const ARCHIVED: ThreadFixture[] = [
  { id: "z1", name: "older", archivedAt: "2026-03-03T00:00:00.000Z" },
  { id: "z2", name: "oldest", archivedAt: "2026-02-02T00:00:00.000Z" },
];

test("list_channel_threads advertises its inputs with only channel_id required", () => {
  const definition = messages.definitions.find((d) => d.name === "discord_list_channel_threads");
  assert.ok(definition, "discord_list_channel_threads should be defined");
  const schema = definition.inputSchema as {
    required: string[];
    additionalProperties: boolean;
    properties: Record<
      string,
      { description?: string; maximum?: number; minimum?: number; enum?: string[] }
    >;
  };
  assert.deepEqual(schema.required, ["channel_id"]);
  assert.equal(schema.additionalProperties, false);
  for (const field of ["limit", "type", "before"]) {
    assert.ok(schema.properties[field], `${field} must be advertised`);
    assert.ok((schema.properties[field].description ?? "").length > 0);
  }
  assert.equal(schema.properties.limit.maximum, 100);
  assert.equal(schema.properties.limit.minimum, 2, "the archived-threads endpoint refuses limit 1");
  assert.deepEqual(schema.properties.type.enum, ["public", "private"]);
});

test("list_channel_threads returns active threads alongside the first archived page", async () => {
  const stub = stubChannel({ active: ACTIVE, archived: ARCHIVED });
  const result = payload(await listThreads()({ channel_id: CHANNEL }));
  assert.equal(stub.activeCalls, 1, "the first call must include active threads");
  assert.deepEqual(
    result.threads.map((t) => t.id),
    ["a1", "z1", "z2"],
  );
  assert.equal(result.threads[0].archived, false, "an active thread is not archived");
  assert.equal(stub.archivedCalls[0].type, "public", "public archived threads by default");
  assert.equal(stub.archivedCalls[0].limit, 100);
  assert.ok(!("before" in stub.archivedCalls[0]));
});

test("list_channel_threads omits active threads once the caller is paging", async () => {
  const stub = stubChannel({ active: ACTIVE, archived: ARCHIVED });
  const result = payload(
    await listThreads()({ channel_id: CHANNEL, before: "2026-03-03T00:00:00.000Z" }),
  );
  assert.equal(stub.activeCalls, 0, "re-sending active threads would duplicate page one");
  assert.deepEqual(
    result.threads.map((t) => t.id),
    ["z1", "z2"],
  );
  assert.ok(stub.archivedCalls[0].before instanceof Date);
});

test("list_channel_threads cursors on archivedAt and only when a page was truncated", async () => {
  stubChannel({ active: ACTIVE, archived: ARCHIVED, hasMore: true });
  const truncated = payload(await listThreads()({ channel_id: CHANNEL }));
  assert.equal(truncated.hasMore, true);
  assert.equal(
    truncated.nextBefore,
    "2026-02-02T00:00:00.000Z",
    "the cursor is the oldest archivedAt on the page",
  );

  mock.restoreAll();
  stubChannel({ active: ACTIVE, archived: ARCHIVED, hasMore: false });
  const complete = payload(await listThreads()({ channel_id: CHANNEL }));
  assert.equal(complete.hasMore, false);
  assert.equal(complete.nextBefore, null);
});

test("list_channel_threads never reports hasMore without a cursor to follow", async () => {
  // An archived page with nothing in it leaves no archivedAt to cursor on.
  stubChannel({ active: ACTIVE, archived: [], hasMore: true });
  const result = payload(await listThreads()({ channel_id: CHANNEL }));
  assert.equal(result.nextBefore, null);
  assert.equal(result.hasMore, false, "hasMore must imply a usable nextBefore");
});

test("list_channel_threads reports which threads are private", async () => {
  stubChannel({
    active: [{ id: "p1", name: "hidden", type: ChannelType.PrivateThread }, ...ACTIVE],
    archived: [],
  });
  const result = payload(await listThreads()({ channel_id: CHANNEL }));
  assert.equal(result.threads.find((t) => t.id === "p1")!.private, true);
  assert.equal(result.threads.find((t) => t.id === "a1")!.private, false);
});

test("list_channel_threads handles a channel with no threads", async () => {
  stubChannel({ active: [], archived: [] });
  const empty = payload(await listThreads()({ channel_id: CHANNEL }));
  assert.deepEqual(empty.threads, []);
  assert.equal(empty.hasMore, false);
  assert.equal(empty.nextBefore, null);
});

test("list_channel_threads points a forum at the tool that lists its posts", async () => {
  // A forum is not text-based, so a generic message-capable check would reject it
  // first and the caller would never learn which tool to use.
  for (const type of [ChannelType.GuildForum, ChannelType.GuildMedia]) {
    mock.restoreAll();
    stubChannel({ type });
    await assert.rejects(
      () => listThreads()({ channel_id: CHANNEL }),
      /use discord_list_forum_threads/i,
      `type ${type} should redirect`,
    );
  }
});

test("list_channel_threads refuses channels that hold no threads of their own", async () => {
  for (const type of [ChannelType.GuildVoice, ChannelType.PublicThread]) {
    mock.restoreAll();
    stubChannel({ type });
    await assert.rejects(
      () => listThreads()({ channel_id: CHANNEL }),
      /holds no threads of its own/,
      `type ${type} should be refused`,
    );
  }
});

test("list_channel_threads forwards the requested archived type", async () => {
  const stub = stubChannel({ active: ACTIVE, archived: ARCHIVED });
  await listThreads()({ channel_id: CHANNEL, type: "private" });
  assert.equal(stub.archivedCalls[0].type, "private");
  assert.equal(stub.activeCalls, 1, "active threads come back whichever type was asked for");
});

test("list_channel_threads rejects a bad cursor, limit or type", async () => {
  const stub = stubChannel({ active: ACTIVE, archived: ARCHIVED });
  for (const args of [
    { channel_id: CHANNEL, before: "2026-03-03T00:00:00" },
    { channel_id: CHANNEL, before: "2026-03-03" },
    { channel_id: CHANNEL, limit: 101 },
    { channel_id: CHANNEL, limit: 1 },
    { channel_id: CHANNEL, limit: 0 },
    { channel_id: CHANNEL, type: "secret" },
  ]) {
    await assert.rejects(() => listThreads()(args), ZodError, JSON.stringify(args));
  }
  assert.equal(stub.archivedCalls.length, 0, "invalid arguments must not reach the Discord API");
});
