import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const MESSAGE = "444444444444444444";
const USER = "555555555555555555";
const EMOJI = "👍";

afterEach(() => mock.restoreAll());

/** Mirrors MessageManager#fetch: without `force`, it returns the cached copy, reactions and all. */
function stubCachedMessage() {
  const removed = { all: 0, byEmoji: 0, byUser: [] as string[], fetches: 0 };
  const reaction = {
    users: {
      fetch: async () => new Map([[USER, { id: USER, username: "someone", bot: false }]]),
      remove: async (id: string) => {
        removed.byUser.push(id);
      },
    },
    remove: async () => {
      removed.byEmoji++;
    },
  };
  const fresh = {
    id: MESSAGE,
    reactions: {
      cache: new Map([[EMOJI, reaction]]),
      removeAll: async () => {
        removed.all++;
      },
    },
  };
  const cached = { id: MESSAGE, reactions: { cache: new Map() } };
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async ({ force }: { force?: boolean }) => (force ? fresh : cached),
    },
  };
  mock.method(discord.channels, "fetch", async () => {
    removed.fetches++;
    return channel as never;
  });
  return removed;
}

const handler = (name: string) => messages.handlers.get(name)!;
const target = { channel_id: CHANNEL, message_id: MESSAGE, emoji: EMOJI };

test("get_reactions sees a reaction missing from the cached message", async () => {
  stubCachedMessage();
  const result = await handler("discord_get_reactions")(target);
  assert.deepEqual(result.structuredContent, {
    reactions: [{ id: USER, username: "someone", bot: false }],
    hasMore: false,
    nextAfter: null,
  });
});

/** Serves `count` reactors in user ID order, honoring `after` and Discord's 100-user cap. */
function stubReactors(count: number) {
  const ids = Array.from({ length: count }, (_, i) => String(100000000000000000n + BigInt(i)));
  const calls: { after?: string; limit: number }[] = [];
  const reaction = {
    users: {
      fetch: async ({ after, limit }: { after?: string; limit: number }) => {
        assert.ok(limit >= 1 && limit <= 100, `Discord refuses limit ${limit}`);
        calls.push({ after, limit });
        const from =
          after === undefined ? 0 : ids.filter((id) => BigInt(id) <= BigInt(after)).length;
        return new Map(
          ids
            .slice(from, from + limit)
            .map((id) => [id, { id, username: `user${id.slice(-3)}`, bot: false }]),
        );
      },
    },
  };
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async () => ({ id: MESSAGE, reactions: { cache: new Map([[EMOJI, reaction]]) } }),
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return { ids, calls };
}

type ReactionPage = { reactions: { id: string }[]; hasMore: boolean; nextAfter: string | null };
const page = async (args: Record<string, unknown>) =>
  (await handler("discord_get_reactions")({ ...target, ...args }))
    .structuredContent as ReactionPage;

test("get_reactions walks every reactor once, in order, by passing nextAfter back", async () => {
  const { ids, calls } = stubReactors(5);
  const seen: string[] = [];
  const pages: boolean[] = [];
  let after: string | undefined;
  do {
    const result = await page({ limit: 2, ...(after ? { after } : {}) });
    seen.push(...result.reactions.map((r) => r.id));
    pages.push(result.hasMore);
    assert.equal(result.hasMore, result.nextAfter !== null, "hasMore follows the cursor");
    if (result.nextAfter) assert.equal(result.nextAfter, result.reactions.at(-1)!.id);
    after = result.nextAfter ?? undefined;
  } while (after);
  assert.deepEqual(seen, ids);
  assert.deepEqual(pages, [true, true, false]);
  assert.deepEqual(
    calls.map((c) => c.limit),
    [3, 3, 3],
    "below 100, one extra user tells whether a next page exists",
  );
});

test("get_reactions says there is no next page when the last page is exactly full", async () => {
  stubReactors(4);
  const first = await page({ limit: 2 });
  const second = await page({ limit: 2, after: first.nextAfter });
  assert.equal(first.hasMore, true);
  assert.deepEqual(second, {
    reactions: second.reactions,
    hasMore: false,
    nextAfter: null,
  });
  assert.equal(second.reactions.length, 2);
});

test("get_reactions probes once for more after a full page of 100", async () => {
  const more = stubReactors(150);
  const first = await page({ limit: 100 });
  assert.equal(first.reactions.length, 100);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextAfter, more.ids[99]);
  assert.deepEqual(more.calls, [
    { after: undefined, limit: 100 },
    { after: more.ids[99], limit: 1 },
  ]);
  mock.restoreAll();

  const exact = stubReactors(100);
  const only = await page({ limit: 100 });
  assert.equal(only.reactions.length, 100);
  assert.deepEqual([only.hasMore, only.nextAfter], [false, null]);
  assert.equal(exact.calls.length, 2, "the probe found nobody after the 100th user");
  mock.restoreAll();

  const short = stubReactors(99);
  const partial = await page({ limit: 100 });
  assert.deepEqual([partial.reactions.length, partial.hasMore], [99, false]);
  assert.equal(short.calls.length, 1, "a page under 100 needs no probe");
});

test("get_reactions past the last reactor returns an empty page instead of failing", async () => {
  const { ids } = stubReactors(3);
  assert.deepEqual(await page({ after: ids[2] }), {
    reactions: [],
    hasMore: false,
    nextAfter: null,
  });
});

test("get_reactions advertises after as an optional snowflake and the cursor in its output", () => {
  const definition = messages.definitions.find((d) => d.name === "discord_get_reactions")!;
  const input = definition.inputSchema as {
    required: string[];
    properties: Record<string, { type?: string; pattern?: string; description?: string }>;
  };
  assert.deepEqual(input.required, ["channel_id", "message_id", "emoji"]);
  assert.equal(input.properties.after.type, "string");
  assert.equal(input.properties.after.pattern, "^\\d{17,20}$");
  assert.match(input.properties.after.description ?? "", /nextAfter/);
  const output = definition.outputSchema as { required: string[] };
  assert.deepEqual(output.required, ["reactions", "hasMore", "nextAfter"]);
  assert.match(definition.description, /pass nextAfter back as `after`/);
});

test("remove_reactions removes an emoji missing from the cached message", async () => {
  const removed = stubCachedMessage();
  await handler("discord_remove_reactions")(target);
  assert.equal(removed.byEmoji, 1);
});

test("remove_reactions removes one user's reaction missing from the cached message", async () => {
  const removed = stubCachedMessage();
  await handler("discord_remove_reactions")({ ...target, user_id: USER });
  assert.deepEqual(removed.byUser, [USER]);
});

test("remove_reactions with no emoji and no user_id still removes every reaction", async () => {
  const removed = stubCachedMessage();
  await handler("discord_remove_reactions")({ channel_id: CHANNEL, message_id: MESSAGE });
  assert.equal(removed.all, 1);
});

test("remove_reactions rejects user_id without emoji before any request", async () => {
  const removed = stubCachedMessage();
  await assert.rejects(
    () =>
      handler("discord_remove_reactions")({
        channel_id: CHANNEL,
        message_id: MESSAGE,
        user_id: USER,
      }),
    /user_id requires emoji/,
  );
  await assert.rejects(() =>
    handler("discord_remove_reactions")({ ...target, emoji: "", user_id: USER }),
  );
  assert.deepEqual(removed, { all: 0, byEmoji: 0, byUser: [], fetches: 0 });
});

test("remove_reactions rejects an empty emoji instead of removing every reaction", async () => {
  const removed = stubCachedMessage();
  await assert.rejects(() => handler("discord_remove_reactions")({ ...target, emoji: "" }));
  assert.equal(removed.all, 0);
  assert.equal(removed.fetches, 0);
});
