import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Collection, DiscordAPIError, Routes, SnowflakeUtil } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const AUTHOR = "222222222222222222";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  delete process.env.DISCORD_ALLOWED_GUILDS;
});

type FakeMessage = {
  id: string;
  author: { id: string };
  webhookId: null;
  createdAt: Date;
  createdTimestamp: number;
};

/** Message IDs carry their timestamp; the offset keeps IDs of the same instant distinct. */
function message(ageMs: number, offset = 0): FakeMessage {
  const createdTimestamp = Date.now() - ageMs;
  const id = (SnowflakeUtil.generate({ timestamp: createdTimestamp }) + BigInt(offset)).toString();
  return {
    id,
    author: { id: AUTHOR },
    webhookId: null,
    createdAt: new Date(createdTimestamp),
    createdTimestamp,
  };
}

/** A channel whose history answers `fetch` the way Discord pages it, and counts the pages read. */
function channelWith(history: FakeMessage[]) {
  const sorted = [...history].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const fetches: Record<string, unknown>[] = [];
  const channel = {
    id: CHANNEL,
    name: "chan",
    guildId: GUILD,
    guild: { members: { me: null } },
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async (opts: { after?: string; limit: number }) => {
        fetches.push(opts);
        const page =
          opts.after === undefined
            ? sorted.slice(-opts.limit)
            : sorted.filter((m) => BigInt(m.id) > BigInt(opts.after!)).slice(0, opts.limit);
        return new Collection(page.reverse().map((m) => [m.id, m]));
      },
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return { fetches };
}

function stubRest() {
  const post = mock.method(discord.rest, "post", async () => undefined);
  const del = mock.method(discord.rest, "delete", async () => undefined);
  return { post, del };
}

const run = (args: Record<string, unknown>, signal?: AbortSignal) =>
  messages.handlers.get("discord_bulk_delete_messages")!(
    { channel_id: CHANNEL, ...args },
    {
      signal,
    },
  );

const ids = (list: FakeMessage[]) => list.map((m) => m.id);
const unknownId = (near: FakeMessage, offset: number) =>
  (BigInt(near.id) + BigInt(offset)).toString();

test("a count dry run lists the most recent messages, oldest first, and deletes nothing", async () => {
  const history = [message(5 * HOUR), message(4 * HOUR), message(3 * HOUR), message(20 * DAY)];
  channelWith(history);
  const { post, del } = stubRest();
  const result = await run({ count: 3 });
  const would = result.structuredContent!.would_delete as Record<string, unknown>[];
  assert.deepEqual(
    would.map((m) => m.id),
    ids([history[0], history[1], history[2]]),
  );
  assert.deepEqual(would[0], {
    id: history[0].id,
    author_id: AUTHOR,
    created_at: history[0].createdAt.toISOString(),
    older_than_14_days: false,
  });
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
});

test("an ID dry run splits the IDs into found and not found", async () => {
  const history = [message(3 * HOUR), message(2 * HOUR), message(30 * DAY)];
  channelWith(history);
  const { post, del } = stubRest();
  const missing = unknownId(history[0], 1);
  const future = unknownId(history[1], 1_000_000);
  const result = await run({ message_ids: [history[1].id, missing, history[2].id, future] });
  const content = result.structuredContent!;
  assert.deepEqual(
    (content.would_delete as { id: string; older_than_14_days: boolean }[]).map((m) => [
      m.id,
      m.older_than_14_days,
    ]),
    [
      [history[2].id, true],
      [history[1].id, false],
    ],
  );
  assert.deepEqual(content.not_found, [missing, future]);
  assert.deepEqual(content.remaining, []);
  assert.equal(content.dry_run, true);
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
});

test("a real call refuses count and reaches neither history nor delete", async () => {
  const { fetches } = channelWith([message(HOUR), message(2 * HOUR)]);
  const { post, del } = stubRest();
  await assert.rejects(run({ count: 2, dry_run: false }), /takes message_ids, not count/);
  assert.equal(fetches.length, 0);
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
});

test("the allow-list refusal comes before the count refusal", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = "444444444444444444";
  channelWith([message(HOUR)]);
  await assert.rejects(run({ count: 2, dry_run: false }), /allow-list/);
});

test("the schema takes exactly one of count and message_ids, and distinct IDs", async () => {
  const one = message(HOUR);
  channelWith([one]);
  await assert.rejects(run({}), /exactly one of count or message_ids/);
  await assert.rejects(run({ count: 2, message_ids: [one.id] }), /exactly one/);
  await assert.rejects(run({ message_ids: [one.id, one.id] }), /must not repeat/);
  await assert.rejects(run({ message_ids: [] }), /message_ids/);
  const def = messages.definitions.find((d) => d.name === "discord_bulk_delete_messages")!;
  const prop = (def.inputSchema as { properties: Record<string, Record<string, unknown>> })
    .properties.message_ids;
  assert.equal(prop.uniqueItems, true);
  assert.equal(prop.maxItems, 100);
});

test("a real call deletes only the IDs it finds again, in one bulk request", async () => {
  const history = [message(3 * HOUR), message(2 * HOUR), message(HOUR)];
  channelWith(history);
  const { post, del } = stubRest();
  const missing = unknownId(history[0], 1);
  const result = await run({
    message_ids: [history[2].id, missing, history[0].id],
    dry_run: false,
  });
  assert.equal(post.mock.callCount(), 1);
  const [route, options] = post.mock.calls[0].arguments as [string, { body: unknown }];
  assert.equal(route, Routes.channelBulkDelete(CHANNEL));
  assert.deepEqual(options.body, { messages: [history[0].id, history[2].id] });
  assert.equal(del.mock.callCount(), 0);
  assert.deepEqual(result.structuredContent, {
    dry_run: false,
    deleted: [history[0].id, history[2].id],
    not_found: [missing],
    failed: [],
    remaining: [],
  });
});

test("messages near or past 14 days go one by one; the rest go in one bulk request", async () => {
  const recent = [message(2 * HOUR), message(HOUR)];
  const edge = message(14 * DAY - 2 * 60 * 1000);
  const old = message(20 * DAY);
  channelWith([...recent, edge, old]);
  const { post, del } = stubRest();
  const result = await run({ message_ids: ids([...recent, edge, old]), dry_run: false });
  assert.equal(post.mock.callCount(), 1);
  assert.deepEqual((post.mock.calls[0].arguments[1] as { body: unknown }).body, {
    messages: ids(recent),
  });
  assert.deepEqual(
    del.mock.calls.map((c) => c.arguments[0]),
    [Routes.channelMessage(CHANNEL, old.id), Routes.channelMessage(CHANNEL, edge.id)],
    "an ID two minutes short of 14 days is inside the safety margin",
  );
  assert.deepEqual(
    [...(result.structuredContent!.deleted as string[])].sort(),
    ids([...recent, edge, old]).sort(),
  );
});

test("exactly one recent message goes as a single delete, never a bulk request of one", async () => {
  const recent = message(HOUR);
  const old = message(20 * DAY);
  channelWith([recent, old]);
  const { post, del } = stubRest();
  await run({ message_ids: [recent.id, old.id], dry_run: false });
  assert.equal(post.mock.callCount(), 0);
  assert.deepEqual(
    del.mock.calls.map((c) => c.arguments[0]),
    [Routes.channelMessage(CHANNEL, recent.id), Routes.channelMessage(CHANNEL, old.id)],
  );
});

test("a refused bulk request fails each of its IDs with Discord's code and deletes nothing", async () => {
  const history = [message(2 * HOUR), message(HOUR)];
  channelWith(history);
  const code = 50034;
  const text = "You can only bulk delete messages that are under 14 days old.";
  mock.method(discord.rest, "post", async () => {
    throw new DiscordAPIError({ code, message: text }, code, 400, "POST", "/bulk-delete", {});
  });
  const result = await run({ message_ids: ids(history), dry_run: false });
  assert.deepEqual(result.structuredContent!.deleted, []);
  assert.deepEqual(
    result.structuredContent!.failed,
    ids(history).map((id) => ({ id, code, message: text })),
  );
});

test("a missing permission stops the call and keeps every ID in remaining", async () => {
  const recent = message(HOUR);
  const old = [message(20 * DAY), message(21 * DAY)];
  channelWith([recent, ...old]);
  const del = mock.method(discord.rest, "delete", async () => {
    throw new DiscordAPIError(
      { code: 50013, message: "Missing Permissions" },
      50013,
      403,
      "DELETE",
      "/m",
      {},
    );
  });
  const result = await run({ message_ids: [recent.id, ...ids(old)], dry_run: false });
  assert.equal(del.mock.callCount(), 1, "one refusal is enough");
  const content = result.structuredContent!;
  assert.deepEqual(content.deleted, []);
  assert.equal((content.remaining as string[]).length, 3);
  assert.deepEqual((content.stopped as { reason: string; code: number }).code, 50013);
});

test("old messages past the time budget come back in remaining", async () => {
  const old = [message(20 * DAY), message(21 * DAY), message(22 * DAY), message(23 * DAY)];
  channelWith(old);
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const del = mock.method(discord.rest, "delete", async () => {
    mock.timers.tick(15_000);
  });
  const result = await run({ message_ids: ids(old), dry_run: false });
  assert.equal(del.mock.callCount(), 3);
  const content = result.structuredContent!;
  assert.equal((content.deleted as string[]).length, 3);
  assert.deepEqual(content.remaining, [old[0].id], "the newest of the old ones is deleted last");
  assert.equal((content.stopped as { reason: string }).reason, "time_budget");
});

test("the lookup stops after 10 pages and returns the IDs it did not reach", async () => {
  const history = Array.from({ length: 1200 }, (_, i) => message(5 * DAY, i));
  const { fetches } = channelWith(history);
  stubRest();
  const wanted = Array.from({ length: 11 }, (_, i) => history[i * 110].id);
  const result = await run({ message_ids: wanted });
  assert.equal(fetches.length, 10);
  const content = result.structuredContent!;
  assert.equal((content.would_delete as unknown[]).length, 10);
  assert.deepEqual(content.remaining, [wanted[10]]);
  assert.equal((content.stopped as { reason: string }).reason, "lookup_limit");
});

test("a page settles every pending ID in its span, so clustered IDs cost one page", async () => {
  const history = Array.from({ length: 300 }, (_, i) => message(DAY, i));
  const { fetches } = channelWith(history);
  stubRest();
  const result = await run({ message_ids: ids(history.slice(10, 60)) });
  assert.equal(fetches.length, 1);
  assert.equal((result.structuredContent!.would_delete as unknown[]).length, 50);
});

test("the call's signal reaches each delete request", async () => {
  const history = [message(2 * HOUR), message(HOUR)];
  channelWith(history);
  const { post } = stubRest();
  const controller = new AbortController();
  await run({ message_ids: ids(history), dry_run: false }, controller.signal);
  const { signal } = post.mock.calls[0].arguments[1] as { signal: AbortSignal };
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
});
