import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MessageReferenceType, MessageType } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const OTHER_CHANNEL = "777777777777777777";
const TARGET = "444444444444444444";
const AUTHOR = "999999999999999999";
const BOT_AUTHOR = "888888888888888888";
const FORWARD = "555555555555555551";
const SOLO = "555555555555555552";
const EDITED = new Date("2026-10-01T12:00:00.000Z");

afterEach(() => mock.restoreAll());

interface FakeMessage {
  id: string;
  content?: string;
  author?: { id: string; bot: boolean };
  editedAt?: Date;
  type?: MessageType;
  system?: boolean;
  snapshot?: { content: string; attachments: Map<string, unknown> };
  attachments?: Map<string, unknown>;
  poll?: unknown;
  reference?: { type: MessageReferenceType; channelId: string; messageId?: string } | null;
  reactions?: { emoji: { id: string | null; name: string | null }; count: number }[];
}

function fakeAttachment(id: string) {
  return {
    id,
    name: `${id}.txt`,
    contentType: "text/plain",
    size: 1,
    url: `https://cdn.example/${id}`,
    proxyURL: `https://media.example/${id}`,
    width: null,
    height: null,
    description: null,
    title: null,
    duration: null,
    waveform: null,
    spoiler: false,
  };
}

/** Builds the part of a discord.js message the tools under test read. */
function build(f: FakeMessage, index: number) {
  return {
    id: f.id,
    channelId: CHANNEL,
    author: { tag: "someone", id: AUTHOR, bot: false, ...f.author },
    content: f.content ?? "",
    createdTimestamp: index,
    createdAt: new Date(index),
    editedAt: f.editedAt ?? null,
    attachments: f.attachments ?? new Map(),
    pinned: false,
    type: f.type ?? MessageType.Default,
    system: f.system ?? false,
    messageSnapshots: { first: () => f.snapshot },
    reference: f.reference ?? null,
    poll: f.poll ?? null,
    reactions: { cache: new Map((f.reactions ?? []).map((r, j) => [String(j), r])) },
  };
}

/** Serves the given messages from a stubbed channel (history, search, pins and single fetches). */
function stubChannel(fakes: FakeMessage[]) {
  const built = fakes.map(build);
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async (options: { message?: string }) =>
        options.message
          ? built.find((m) => m.id === options.message)
          : new Map(built.map((m) => [m.id, m])),
      fetchPins: async () => ({
        items: built.map((message) => ({ message, pinnedAt: new Date(0) })),
      }),
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
}

interface ReadMessage {
  id: string;
  authorId: string;
  bot?: true;
  editedAt?: string;
  type?: string;
  replyTo?: string;
  poll?: {
    question: string | null;
    answers: { id: number; text: string | null; votes: number }[];
    expiresAt?: string;
    finalized: boolean;
  };
  forwarded?: { channelId: string; messageId: string | null; content: string; attachments: number };
  reactions?: { emoji: string; count: number }[];
}

async function run(tool: string, args: Record<string, unknown>) {
  return messages.handlers.get(tool)!(args);
}

async function read(): Promise<ReadMessage[]> {
  const result = await run("discord_read_messages", { channel_id: CHANNEL });
  return (result.structuredContent as { messages: ReadMessage[] }).messages;
}

test("read_messages reports the message a reply points to, and omits it otherwise", async () => {
  stubChannel([
    { id: "1", reference: null },
    {
      id: "2",
      reference: { type: MessageReferenceType.Default, channelId: CHANNEL, messageId: TARGET },
    },
  ]);
  const [plain, reply] = await read();
  assert.ok(!("replyTo" in plain), "replyTo must be omitted for a non-reply");
  assert.equal(reply.replyTo, TARGET);
});

test("read_messages does not report forwards or crossposts as replies", async () => {
  stubChannel([
    {
      id: "1",
      reference: { type: MessageReferenceType.Forward, channelId: CHANNEL, messageId: TARGET },
    },
    {
      id: "2",
      reference: {
        type: MessageReferenceType.Default,
        channelId: OTHER_CHANNEL,
        messageId: TARGET,
      },
    },
  ]);
  const [forward, crosspost] = await read();
  assert.ok(!("replyTo" in forward));
  assert.ok(!("replyTo" in crosspost));
});

test("read_messages lists reactions as the emoji strings the reaction tools accept", async () => {
  stubChannel([
    { id: "1" },
    {
      id: "2",
      reactions: [
        { emoji: { id: null, name: "👍" }, count: 2 },
        { emoji: { id: "555555555555555555", name: "party" }, count: 1 },
      ],
    },
  ]);
  const [none, reacted] = await read();
  assert.ok(!("reactions" in none), "reactions must be omitted when empty");
  assert.deepEqual(reacted.reactions, [
    { emoji: "👍", count: 2 },
    { emoji: "party:555555555555555555", count: 1 },
  ]);
});

test("read_messages returns the author id and flags bot authors only", async () => {
  stubChannel([{ id: "1" }, { id: "2", author: { id: BOT_AUTHOR, bot: true } }]);
  const [human, bot] = await read();
  assert.equal(human.authorId, AUTHOR);
  assert.ok(!("bot" in human), "bot must be omitted for human authors");
  assert.equal(bot.authorId, BOT_AUTHOR);
  assert.equal(bot.bot, true);
});

test("read_messages exposes the content a forward carries in its snapshot", async () => {
  stubChannel([
    { id: "1" },
    {
      id: "2",
      reference: {
        type: MessageReferenceType.Forward,
        channelId: OTHER_CHANNEL,
        messageId: TARGET,
      },
      snapshot: {
        content: "original text",
        attachments: new Map([
          ["a", {}],
          ["b", {}],
        ]),
      },
    },
  ]);
  const [plain, forward] = await read();
  assert.ok(!("forwarded" in plain), "forwarded must be omitted for a regular message");
  assert.deepEqual(forward.forwarded, {
    channelId: OTHER_CHANNEL,
    messageId: TARGET,
    content: "original text",
    attachments: 2,
  });
});

test("read_messages names the type of system messages only", async () => {
  stubChannel([{ id: "1" }, { id: "2", system: true, type: MessageType.PollResult }]);
  const [plain, system] = await read();
  assert.ok(!("type" in plain), "type must be omitted for ordinary messages");
  assert.equal(system.type, "PollResult");
});

test("read_messages reports the edit time of edited messages only", async () => {
  stubChannel([{ id: "1" }, { id: "2", editedAt: EDITED }]);
  const [plain, edited] = await read();
  assert.ok(!("editedAt" in plain), "editedAt must be omitted when never edited");
  assert.equal(edited.editedAt, EDITED.toISOString());
});

test("read_messages summarizes a poll instead of leaving the message empty", async () => {
  stubChannel([
    { id: "1" },
    {
      id: "2",
      poll: {
        question: { text: "Ready?" },
        answers: new Map([
          [1, { id: 1, text: "Yes", voteCount: 3 }],
          [2, { id: 2, text: "No", voteCount: 0 }],
        ]),
        expiresAt: EDITED,
        resultsFinalized: true,
      },
    },
  ]);
  const [plain, poll] = await read();
  assert.ok(!("poll" in plain), "poll must be omitted for a message without one");
  assert.deepEqual(poll.poll, {
    question: "Ready?",
    answers: [
      { id: 1, text: "Yes", votes: 3 },
      { id: 2, text: "No", votes: 0 },
    ],
    expiresAt: EDITED.toISOString(),
    finalized: true,
  });
});

test("search_messages and fetch_pinned_messages carry the author id, bot flag and edit time", async () => {
  stubChannel([
    { id: "1", content: "needle", author: { id: BOT_AUTHOR, bot: true }, editedAt: EDITED },
    { id: "2", content: "needle" },
  ]);
  const search = await run("discord_search_messages", { channel_id: CHANNEL, keyword: "needle" });
  const pins = await run("discord_fetch_pinned_messages", { channel_id: CHANNEL });
  for (const result of [search, pins]) {
    const [first, second] = Object.values(result.structuredContent as object)[0] as ReadMessage[];
    assert.equal(first.authorId, BOT_AUTHOR);
    assert.equal(first.bot, true);
    assert.equal(first.editedAt, EDITED.toISOString());
    assert.equal(second.authorId, AUTHOR);
    assert.ok(!("bot" in second) && !("editedAt" in second));
  }
});

test("search_guild_messages carries the author id, bot flag and edit time", async () => {
  const raw = (id: string, author: object, edited: string | null) => ({
    id,
    content: "needle",
    timestamp: "2026-10-01T10:00:00.000000+00:00",
    edited_timestamp: edited,
    channel_id: CHANNEL,
    author: { username: "someone", discriminator: "0", ...author },
  });
  mock.method(discord.rest, "get", async () => ({
    messages: [
      [raw("1", { id: BOT_AUTHOR, bot: true }, "2026-10-01T11:00:00.000000+00:00")],
      [raw("2", { id: AUTHOR }, null)],
    ],
  }));
  mock.method(discord.guilds, "fetch", async () => ({ channels: { cache: new Map() } }) as never);
  const result = await run("discord_search_guild_messages", { guild_id: GUILD, query: "needle" });
  const [bot, human] = (result.structuredContent as { matches: ReadMessage[] }).matches;
  assert.equal(bot.authorId, BOT_AUTHOR);
  assert.equal(bot.bot, true);
  assert.equal(bot.editedAt, "2026-10-01T11:00:00.000Z");
  assert.equal(human.authorId, AUTHOR);
  assert.ok(!("bot" in human) && !("editedAt" in human));
});

test("get_message_attachments also lists the files of a forwarded original, flagged", async () => {
  stubChannel([
    {
      id: FORWARD,
      attachments: new Map([["own", fakeAttachment("own")]]),
      reference: {
        type: MessageReferenceType.Forward,
        channelId: OTHER_CHANNEL,
        messageId: TARGET,
      },
      snapshot: { content: "", attachments: new Map([["orig", fakeAttachment("orig")]]) },
    },
    { id: SOLO, attachments: new Map([["solo", fakeAttachment("solo")]]) },
  ]);
  const files = async (message_id: string) =>
    (
      (await run("discord_get_message_attachments", { channel_id: CHANNEL, message_id }))
        .structuredContent as { attachments: { id: string; forwarded?: true }[] }
    ).attachments;
  const forward = await files(FORWARD);
  assert.deepEqual(
    forward.map((a) => [a.id, a.forwarded]),
    [
      ["own", undefined],
      ["orig", true],
    ],
  );
  assert.ok(!("forwarded" in (await files(SOLO))[0]), "a regular message's files are not flagged");
});
