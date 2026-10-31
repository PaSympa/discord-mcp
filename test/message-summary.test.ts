import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MessageReferenceType, MessageType, type Message } from "discord.js";
import { discord } from "../src/client.js";
import { summarizeMessage, summarizeRawMessage, type RawMessage } from "../src/messageSummary.js";
import messages from "../src/tools/messages.js";

const CHANNEL = "333333333333333333";
const GUILD = "111111111111111111";
const AUTHOR = "999999999999999999";
const REPLIED = "444444444444444444";
const ORIGIN_CHANNEL = "777777777777777777";
const ORIGIN = "555555555555555555";

afterEach(() => mock.restoreAll());

/** The part of a discord.js message the summary reads. */
function fake(overrides: Record<string, unknown> = {}): Message {
  return {
    id: "1",
    channelId: CHANNEL,
    author: { tag: "someone", id: AUTHOR, bot: false },
    content: "hello",
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    editedAt: null,
    attachments: new Map(),
    pinned: false,
    type: MessageType.Default,
    system: false,
    messageSnapshots: { first: () => undefined },
    reference: null,
    poll: null,
    reactions: { cache: new Map() },
    ...overrides,
  } as unknown as Message;
}

/** The same message as Discord's search endpoint serves it. */
function raw(overrides: Partial<RawMessage> = {}): RawMessage {
  return {
    id: "1",
    channel_id: CHANNEL,
    content: "hello",
    timestamp: "2026-10-01T10:00:00.000000+00:00",
    edited_timestamp: null,
    author: { id: AUTHOR, username: "someone", discriminator: "0" },
    attachments: [],
    pinned: false,
    type: 0,
    ...overrides,
  };
}

test("an ordinary message carries only its always-present keys", () => {
  const summary = summarizeMessage(fake());
  assert.deepEqual(Object.keys(summary).sort(), [
    "attachments",
    "author",
    "authorId",
    "content",
    "id",
    "pinned",
    "timestamp",
  ]);
  assert.deepEqual(summarizeRawMessage(raw()), summary);
});

const cases: [string, Message, RawMessage][] = [
  [
    "an edited bot message with attachments, pinned",
    fake({
      author: { tag: "someone", id: AUTHOR, bot: true },
      editedAt: new Date("2026-10-01T11:00:00.000Z"),
      attachments: new Map([["a", {}]]),
      pinned: true,
    }),
    raw({
      author: { id: AUTHOR, username: "someone", discriminator: "0", bot: true },
      edited_timestamp: "2026-10-01T11:00:00.000000+00:00",
      attachments: [{}],
      pinned: true,
    }),
  ],
  [
    "a reply",
    fake({
      reference: { type: MessageReferenceType.Default, channelId: CHANNEL, messageId: REPLIED },
    }),
    raw({
      type: MessageType.Reply,
      message_reference: { channel_id: CHANNEL, message_id: REPLIED },
    }),
  ],
  [
    "a forward",
    fake({
      content: "",
      reference: {
        type: MessageReferenceType.Forward,
        channelId: ORIGIN_CHANNEL,
        messageId: ORIGIN,
      },
      messageSnapshots: {
        first: () => ({ content: "original", attachments: new Map([["a", {}]]) }),
      },
    }),
    raw({
      content: "",
      message_reference: {
        type: MessageReferenceType.Forward,
        channel_id: ORIGIN_CHANNEL,
        message_id: ORIGIN,
      },
      message_snapshots: [{ message: { content: "original", attachments: [{}] } }],
    }),
  ],
  [
    "a poll with votes",
    fake({
      content: "",
      poll: {
        question: { text: "Q?" },
        answers: new Map([
          [1, { id: 1, text: "A", voteCount: 2 }],
          [2, { id: 2, text: "B", voteCount: 0 }],
        ]),
        expiresAt: new Date("2026-10-02T10:00:00.000Z"),
        resultsFinalized: true,
      },
    }),
    raw({
      content: "",
      poll: {
        question: { text: "Q?" },
        answers: [
          { answer_id: 1, poll_media: { text: "A" } },
          { answer_id: 2, poll_media: { text: "B" } },
        ],
        expiry: "2026-10-02T10:00:00.000000+00:00",
        results: { answer_counts: [{ id: 1, count: 2 }], is_finalized: true },
      },
    }),
  ],
  [
    "reactions, custom and unicode",
    fake({
      reactions: {
        cache: new Map([
          ["a", { emoji: { id: null, name: "👍" }, count: 2 }],
          ["b", { emoji: { id: "123456789012345678", name: "mensa" }, count: 1 }],
        ]),
      },
    }),
    raw({
      reactions: [
        { emoji: { id: null, name: "👍" }, count: 2 },
        { emoji: { id: "123456789012345678", name: "mensa" }, count: 1 },
      ],
    }),
  ],
  [
    "a system message",
    fake({ type: MessageType.UserJoin, system: true }),
    raw({ type: MessageType.UserJoin }),
  ],
];

for (const [name, message, rawMessage] of cases) {
  test(`both sources summarize ${name} identically`, () => {
    assert.deepEqual(summarizeRawMessage(rawMessage), summarizeMessage(message));
  });
}

test("a forward is not reported as a reply, whichever source it comes from", () => {
  const forward = {
    type: MessageReferenceType.Forward,
    channelId: CHANNEL,
    messageId: ORIGIN,
  };
  assert.ok(!("replyTo" in summarizeMessage(fake({ reference: forward }))));
  assert.ok(
    !(
      "replyTo" in
      summarizeRawMessage(
        raw({
          message_reference: {
            type: MessageReferenceType.Forward,
            channel_id: CHANNEL,
            message_id: ORIGIN,
          },
        }),
      )
    ),
  );
});

test("the pin time is added to a pinned message only", () => {
  const pinnedAt = new Date("2026-10-01T12:00:00.000Z");
  assert.equal(summarizeMessage(fake(), { pinnedAt }).pinnedAt, pinnedAt.toISOString());
  assert.ok(!("pinnedAt" in summarizeMessage(fake())));
});

test("read, search, pins and guild search return the same summary for the same message", async () => {
  const message = fake({
    reference: { type: MessageReferenceType.Default, channelId: CHANNEL, messageId: REPLIED },
    reactions: { cache: new Map([["a", { emoji: { id: null, name: "👍" }, count: 1 }]]) },
    createdTimestamp: 1,
  });
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map([["1", message]]),
      fetchPins: async () => ({ items: [{ message, pinnedAt: new Date(0) }] }),
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  mock.method(discord.rest, "get", async () => ({
    messages: [
      [
        raw({
          type: MessageType.Reply,
          message_reference: { channel_id: CHANNEL, message_id: REPLIED },
          reactions: [{ emoji: { id: null, name: "👍" }, count: 1 }],
        }),
      ],
    ],
  }));
  mock.method(discord.guilds, "fetch", async () => ({ channels: { cache: new Map() } }) as never);

  const first = async (tool: string, args: Record<string, unknown>) => {
    const result = await messages.handlers.get(tool)!(args);
    const body = result.structuredContent as Record<string, Record<string, unknown>[]>;
    return Object.values(body)[0][0];
  };
  const read = await first("discord_read_messages", { channel_id: CHANNEL });
  const search = await first("discord_search_messages", { channel_id: CHANNEL, keyword: "hello" });
  const pins = await first("discord_fetch_pinned_messages", { channel_id: CHANNEL });
  const guild = await first("discord_search_guild_messages", { guild_id: GUILD, query: "hello" });

  assert.deepEqual(search, read);
  const { pinnedAt, ...pinsRest } = pins;
  assert.equal(pinnedAt, new Date(0).toISOString());
  assert.deepEqual(pinsRest, read);
  const { channel_id, channel_name, ...guildRest } = guild;
  assert.equal(channel_id, CHANNEL);
  assert.equal(channel_name, "unknown");
  assert.deepEqual(guildRest, read);
});
