import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import polls from "../src/tools/polls.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const MESSAGE = "444444444444444444";

afterEach(() => mock.restoreAll());

/** Stubs the channel lookup and records the options every messages.fetch receives. */
function stubPollChannel(): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  const poll = {
    messageId: MESSAGE,
    question: { text: "Q?" },
    answers: new Map([
      [
        1,
        { id: 1, text: "A", emoji: null, voteCount: 2, voters: { fetch: async () => new Map() } },
      ],
    ]),
    allowMultiselect: false,
    expiresAt: null,
    resultsFinalized: true,
  };
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async (options: Record<string, unknown>) => {
        calls.push(options);
        return { poll };
      },
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return calls;
}

const args = { channel_id: CHANNEL, message_id: MESSAGE };

for (const [tool, extra] of [
  ["discord_get_poll_results", {}],
  ["discord_end_poll", {}],
  ["discord_get_poll_voters", { answer_id: 1 }],
] as const) {
  test(`${tool} bypasses the message cache so vote counts are never stale`, async () => {
    const calls = stubPollChannel();
    await polls.handlers.get(tool)!({ ...args, ...extra });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].force, true, "a cached message would serve outdated poll results");
    assert.equal(calls[0].cache, false, "the forced fetch must not fill the message cache");
  });
}

test("get_poll_results reports an error when the message carries no poll", async () => {
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: { fetch: async () => ({ poll: null }) },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  await assert.rejects(
    polls.handlers.get("discord_get_poll_results")!(args),
    /does not carry a poll/,
  );
});
