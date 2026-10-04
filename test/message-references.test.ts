import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MessageReferenceType, MessageType } from "discord.js";
import { discord } from "../src/client.js";
import { rawReferenceFields, referenceFields } from "../src/messageReferences.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const SOURCE_CHANNEL = "343434343434343434";
const USER = "222222222222222222";
const PLAIN = "900000000000000001";
const REPLY = "900000000000000002";
const FORWARD = "900000000000000003";
const ORIGINAL = "800000000000000000";

afterEach(() => mock.restoreAll());

const EXPECTED_FORWARD = {
  channelId: SOURCE_CHANNEL,
  messageId: ORIGINAL,
  content: "the release is out",
  attachments: 1,
};

function fakeMessage(id: string, offsetMs: number, extra: Record<string, unknown> = {}) {
  const createdTimestamp = Date.parse("2026-09-01T00:00:00Z") + offsetMs;
  return {
    id,
    channelId: CHANNEL,
    type: MessageType.Default,
    system: false,
    author: { tag: "alice", id: USER, bot: false },
    content: "",
    createdTimestamp,
    createdAt: new Date(createdTimestamp),
    editedAt: null,
    attachments: new Map(),
    pinned: false,
    reference: null,
    messageSnapshots: { first: () => undefined },
    poll: null,
    reactions: { cache: new Map() },
    ...extra,
  };
}

/** A plain message, a reply to it, and a forward whose own content is empty. */
function history() {
  return [
    fakeMessage(PLAIN, 0, { content: "hello" }),
    fakeMessage(REPLY, 1000, {
      type: MessageType.Reply,
      content: "agreed",
      reference: { type: MessageReferenceType.Default, channelId: CHANNEL, messageId: PLAIN },
    }),
    fakeMessage(FORWARD, 2000, {
      reference: {
        type: MessageReferenceType.Forward,
        channelId: SOURCE_CHANNEL,
        messageId: ORIGINAL,
      },
      messageSnapshots: {
        first: () => ({ content: "the release is out", attachments: new Map([["1", {}]]) }),
      },
    }),
  ];
}

function stubChannelHistory() {
  const built = history();
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async () => new Map(built.map((m) => [m.id, m])),
      fetchPins: async () => ({
        items: built.map((message) => ({ message, pinnedAt: new Date(0) })),
      }),
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
}

interface Summary {
  id: string;
  replyTo?: string;
  forwarded?: unknown;
}

const byId = (list: Summary[]) => Object.fromEntries(list.map((m) => [m.id, m]));

test("search_messages carries replyTo and forwarded, and omits them otherwise", async () => {
  stubChannelHistory();
  const result = await messages.handlers.get("discord_search_messages")!({
    channel_id: CHANNEL,
    keyword: "",
  });
  const out = byId((result.structuredContent as { matches: Summary[] }).matches);
  assert.equal(out[REPLY].replyTo, PLAIN);
  assert.deepEqual(out[FORWARD].forwarded, EXPECTED_FORWARD);
  assert.ok(!("replyTo" in out[PLAIN]) && !("forwarded" in out[PLAIN]));
  assert.ok(!("forwarded" in out[REPLY]) && !("replyTo" in out[FORWARD]));
});

test("fetch_pinned_messages carries replyTo and forwarded", async () => {
  stubChannelHistory();
  const result = await messages.handlers.get("discord_fetch_pinned_messages")!({
    channel_id: CHANNEL,
  });
  const out = byId((result.structuredContent as { messages: Summary[] }).messages);
  assert.equal(out[REPLY].replyTo, PLAIN);
  assert.deepEqual(out[FORWARD].forwarded, EXPECTED_FORWARD);
});

test("search_guild_messages reads replyTo and forwarded from raw API messages", async () => {
  const raw = (id: string, extra: Record<string, unknown>) => ({
    id,
    type: 0,
    content: "",
    timestamp: "2026-09-01T00:00:00.000000+00:00",
    channel_id: CHANNEL,
    author: { id: USER, username: "alice", discriminator: "0" },
    ...extra,
  });
  mock.method(discord.rest, "get", (async () => ({
    messages: [
      [
        raw(REPLY, {
          type: MessageType.Reply,
          content: "agreed",
          message_reference: { type: 0, channel_id: CHANNEL, message_id: PLAIN },
        }),
      ],
      [
        raw(FORWARD, {
          message_reference: { type: 1, channel_id: SOURCE_CHANNEL, message_id: ORIGINAL },
          message_snapshots: [
            { message: { content: "the release is out", attachments: [{ id: "1" }] } },
          ],
        }),
      ],
      [raw(PLAIN, { content: "hello" })],
    ],
  })) as never);
  mock.method(discord.guilds, "fetch", async () => ({ channels: { cache: new Map() } }) as never);
  const result = await messages.handlers.get("discord_search_guild_messages")!({
    guild_id: GUILD,
    query: "release",
  });
  assert.ok(!result.isError, JSON.stringify(result.content));
  const out = byId((result.structuredContent as { matches: Summary[] }).matches);
  assert.equal(out[REPLY].replyTo, PLAIN);
  assert.deepEqual(out[FORWARD].forwarded, EXPECTED_FORWARD);
  assert.ok(!("replyTo" in out[PLAIN]) && !("forwarded" in out[PLAIN]));
});

test("a forward is not a reply, whichever source it comes from", () => {
  const forward = history()[2];
  assert.ok(!("replyTo" in referenceFields(forward as never)));
  assert.ok(
    !(
      "replyTo" in
      rawReferenceFields({
        type: 0,
        message_reference: { type: 1, channel_id: SOURCE_CHANNEL, message_id: ORIGINAL },
      })
    ),
  );
});

test("the reference fields are optional in the schema of every message tool", () => {
  for (const name of [
    "discord_read_messages",
    "discord_search_messages",
    "discord_search_guild_messages",
    "discord_fetch_pinned_messages",
  ]) {
    const definition = messages.definitions.find((d) => d.name === name)!;
    const output = JSON.stringify(definition.outputSchema);
    assert.match(output, /replyTo/, name);
    assert.match(output, /forwarded/, name);
  }
});
