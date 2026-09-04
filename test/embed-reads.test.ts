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
  const built = items.map((m) => ({
    id: m.id,
    content: m.content,
    author: { tag: "someone" },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    createdTimestamp: 1767225600000,
    embeds: m.embeds ?? [],
    attachments: { size: 0 },
    pinned: false,
  }));
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

function payload(result: { structuredContent?: unknown }): {
  messages: { id: string; content: string; embeds?: unknown[] }[];
} {
  return result.structuredContent as never;
}

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

test("embedField caps the url and the field name too", () => {
  const [summary] = embedField([
    {
      url: `https://example.com/${"u".repeat(400)}`,
      fields: [{ name: "n".repeat(200), value: "v" }],
    },
  ]).embeds!;
  assert.equal(summary.url!.length, 301);
  assert.equal(summary.fields![0].name.length, 101);
  assert.ok(summary.fields![0].name.endsWith("…"));
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

test("read_messages surfaces an embed-only message instead of reporting it empty", async () => {
  stubMessages([
    {
      id: "1",
      content: "",
      embeds: [{ title: "🌏 새 방문자", fields: [{ name: "위치", value: "KR" }] }],
    },
    { id: "2", content: "그냥 대화", embeds: [] },
  ]);
  const result = payload(await read()({ channel_id: CHANNEL }));

  const embedOnly = result.messages.find((m) => m.id === "1")!;
  assert.equal(embedOnly.content, "", "the message really does carry no content");
  assert.deepEqual(embedOnly.embeds, [
    { title: "🌏 새 방문자", fields: [{ name: "위치", value: "KR" }] },
  ]);

  const ordinary = result.messages.find((m) => m.id === "2")!;
  assert.ok(!("embeds" in ordinary), "an ordinary message must not carry an empty embeds key");
});

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
