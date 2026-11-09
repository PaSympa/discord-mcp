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
  });
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
