import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import { embedField } from "../src/embeds.js";
import messages from "../src/tools/messages.js";
import forums from "../src/tools/forums.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";

afterEach(() => mock.restoreAll());

interface MessageFixture {
  id: string;
  content: string;
  embeds?: unknown[];
}

function stubMessages(items: MessageFixture[]) {
  const built = items.map(builtMessage);
  const channel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: { fetch: async () => new Map(built.map((m) => [m.id, m])) },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
}

const read = () => messages.handlers.get("discord_read_messages")!;

test("embedField returns undefined for a message with no embeds", () => {
  assert.equal(embedField([]).embeds, undefined, "the key must stay off ordinary messages");
});

test("embedField keeps only the parts that carry text", () => {
  const [summary] = embedField([
    {
      title: "새 방문자",
      description: "",
      url: "https://example.com/a",
      fields: [{ name: "위치", value: "KR" }],
    },
  ]).embeds!;
  assert.deepEqual(summary, {
    title: "새 방문자",
    url: "https://example.com/a",
    fields: [{ name: "위치", value: "KR" }],
  });
  assert.ok(!("description" in summary), "an empty description must not become a key");
});

test("embedField caps description, field count and field value", () => {
  const [summary] = embedField([
    {
      description: "d".repeat(900),
      fields: Array.from({ length: 25 }, (_, i) => ({
        name: `f${i}`,
        value: "v".repeat(700),
      })),
    },
  ]).embeds!;
  assert.equal(summary.description!.length, 501, "500 characters plus the ellipsis");
  assert.ok(summary.description!.endsWith("…"));
  assert.equal(summary.fields!.length, 10, "Discord allows 25 fields; a reader does not want them");
  assert.equal(summary.moreFields, 15, "dropped fields are counted, not silently lost");
  assert.equal(summary.fields![0].value.length, 301);
  assert.ok(summary.fields![0].value.endsWith("…"));
});

test("embedField keeps every embed a message carries", () => {
  // Discord allows ten embeds per message and bot posts do use more than one.
  const summaries = embedField([
    { title: "첫째" },
    { title: "둘째", fields: [{ name: "a", value: "b" }] },
    { title: "셋째", description: "본문" },
  ]).embeds!;
  assert.equal(summaries.length, 3);
  assert.deepEqual(
    summaries.map((s) => s.title),
    ["첫째", "둘째", "셋째"],
  );
});

test("embedField caps the field name and leaves out an over-long url", () => {
  const [summary] = embedField([
    {
      url: `https://example.com/${"u".repeat(400)}`,
      fields: [{ name: "n".repeat(200), value: "v" }],
    },
  ]).embeds!;
  assert.ok(!("url" in summary), "a clipped url would point somewhere else");
  assert.equal(summary.fields![0].name.length, 101);
  assert.ok(summary.fields![0].name.endsWith("…"));
});

test("embedField keeps author and footer, capped like the rest", () => {
  const [short] = embedField([{ author: { name: "모니터" }, footer: { text: "v1.2" } }]).embeds!;
  assert.deepEqual(short, { author: "모니터", footer: "v1.2" });

  const [long] = embedField([
    { author: { name: "a".repeat(200) }, footer: { text: "f".repeat(700) } },
  ]).embeds!;
  assert.equal(long.author!.length, 101);
  assert.equal(long.footer!.length, 301);
});

test("embedField never splits a surrogate pair when clipping", () => {
  const [summary] = embedField([{ description: `${"a".repeat(499)}🌏 tail` }]).embeds!;
  assert.ok(summary.description!.isWellFormed(), "a lone high surrogate is not valid text");
  assert.equal(summary.description, `${"a".repeat(499)}…`);
});

test("embedField leaves short text untouched", () => {
  const [summary] = embedField([
    { description: "짧은 설명", fields: [{ name: "a", value: "b" }] },
  ]).embeds!;
  assert.equal(summary.description, "짧은 설명");
  assert.equal(summary.fields![0].value, "b");
});

test("embedField accepts the raw APIEmbed shape a search hit carries", () => {
  // discord.js Embed and the raw search payload differ in class but share these keys.
  const raw = [{ title: "t", fields: [{ name: "n", value: "v" }] }];
  assert.deepEqual(embedField(raw).embeds, [{ title: "t", fields: [{ name: "n", value: "v" }] }]);
});

const EMBED = { title: "🌏 새 방문자", fields: [{ name: "위치", value: "KR" }] };

function builtMessage(m: MessageFixture) {
  return {
    id: m.id,
    content: m.content,
    author: { tag: "someone" },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    createdTimestamp: 1767225600000,
    embeds: m.embeds ?? [],
    attachments: { size: 0 },
    pinned: false,
  };
}

/** Each message-reading tool, with a stub that serves `items` and the list key it answers under. */
const READERS: {
  name: string;
  key: string;
  call: (items: MessageFixture[]) => Promise<{ structuredContent?: unknown }>;
}[] = [
  {
    name: "discord_read_messages",
    key: "messages",
    call: (items) => {
      stubMessages(items);
      return read()({ channel_id: CHANNEL });
    },
  },
  {
    name: "discord_search_messages",
    key: "matches",
    call: (items) => {
      stubMessages(items);
      return messages.handlers.get("discord_search_messages")!({
        channel_id: CHANNEL,
        keyword: "",
      });
    },
  },
  {
    name: "discord_fetch_pinned_messages",
    key: "messages",
    call: (items) => {
      const channel = {
        guildId: GUILD,
        isDMBased: () => false,
        isTextBased: () => true,
        messages: {
          fetchPins: async () => ({
            items: items.map((m) => ({
              message: builtMessage(m),
              pinnedAt: new Date("2026-01-02T00:00:00.000Z"),
            })),
            hasMore: false,
          }),
        },
      };
      mock.method(discord.channels, "fetch", async () => channel as never);
      return messages.handlers.get("discord_fetch_pinned_messages")!({ channel_id: CHANNEL });
    },
  },
  {
    name: "discord_search_guild_messages",
    key: "matches",
    call: (items) => {
      const raw = items.map((m) => ({
        id: m.id,
        content: m.content,
        timestamp: "2026-01-01T00:00:00.000Z",
        channel_id: CHANNEL,
        author: { username: "someone", discriminator: "0" },
        embeds: m.embeds ?? [],
      }));
      mock.method(discord.rest, "get", async () => ({ messages: raw.map((r) => [r]) }));
      mock.method(
        discord.guilds,
        "fetch",
        async () => ({ channels: { cache: new Map() } }) as never,
      );
      return messages.handlers.get("discord_search_guild_messages")!({
        guild_id: GUILD,
        query: "x",
      });
    },
  },
  {
    name: "discord_get_forum_post",
    key: "messages",
    call: (items) => {
      const thread = {
        id: CHANNEL,
        guildId: GUILD,
        name: "post",
        archived: false,
        locked: false,
        messageCount: items.length,
        appliedTags: [],
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        isThread: () => true,
        messages: { fetch: async () => new Map(items.map((m) => [m.id, builtMessage(m)])) },
      };
      mock.method(discord.channels, "fetch", async () => thread as never);
      return forums.handlers.get("discord_get_forum_post")!({ thread_id: CHANNEL });
    },
  },
];

for (const reader of READERS) {
  test(`${reader.name} surfaces an embed-only message and keeps the key off ordinary ones`, async () => {
    const result = (await reader.call([
      { id: "1", content: "", embeds: [EMBED] },
      { id: "2", content: "그냥 대화", embeds: [] },
    ])) as { structuredContent: Record<string, { id: string; embeds?: unknown[] }[]> };
    const list = result.structuredContent[reader.key];

    const embedOnly = list.find((m) => m.id === "1")!;
    assert.deepEqual(embedOnly.embeds, [EMBED]);

    const ordinary = list.find((m) => m.id === "2")!;
    assert.ok(!("embeds" in ordinary), "an ordinary message must not carry an empty embeds key");
  });
}

test("every message-reading tool advertises the embed field", () => {
  const advertise = [
    "discord_read_messages",
    "discord_search_messages",
    "discord_search_guild_messages",
    "discord_fetch_pinned_messages",
  ];
  for (const name of advertise) {
    const definition = messages.definitions.find((d) => d.name === name);
    assert.ok(definition, `${name} should be defined`);
    const json = JSON.stringify(definition.outputSchema);
    assert.ok(json.includes("embeds"), `${name} must advertise embeds in its outputSchema`);
  }
  // get_forum_post lives in another module and carries its own message shape.
  const forumPost = forums.definitions.find((d) => d.name === "discord_get_forum_post");
  assert.ok(forumPost, "discord_get_forum_post should be defined");
  assert.ok(
    JSON.stringify(forumPost.outputSchema).includes("embeds"),
    "discord_get_forum_post must advertise embeds too",
  );
});
