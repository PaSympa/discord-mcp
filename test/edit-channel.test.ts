import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import channels from "../src/tools/channels.js";

/** Real structures from raw gateway payloads, so the PATCH body is the one discord.js builds. */

type Adder = { _add: (...args: unknown[]) => unknown };

afterEach(() => mock.restoreAll());

let nextGuild = 600000000000000000n;

/** A fresh guild per call, since a PATCH updates the cached channel: text, voice and announcement. */
function freshGuild() {
  nextGuild += 100n;
  const id = (n: number) => String(nextGuild + BigInt(n));
  const raw = [
    { id: id(1), type: 0, name: "chat", position: 0, permission_overwrites: [] },
    { id: id(2), type: 2, name: "lobby", position: 0, permission_overwrites: [] },
    { id: id(3), type: 5, name: "news", position: 1, permission_overwrites: [] },
  ];
  (discord.guilds as unknown as Adder)._add({
    id: id(0),
    name: "guild",
    owner_id: "1",
    roles: [],
    emojis: [],
    features: [],
    channels: raw,
    threads: [],
    stickers: [],
    guild_scheduled_events: [],
  });
  return { text: raw[0], voice: raw[1], news: raw[2], guildId: id(0) };
}

async function editChannel(
  channel: { id: string },
  guildId: string,
  fields: Record<string, unknown>,
) {
  const bodies: Record<string, unknown>[] = [];
  mock.method(discord.rest, "patch", (async (
    _route: string,
    { body }: { body: Record<string, unknown> },
  ) => {
    const sent = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    bodies.push(sent);
    return { ...channel, guild_id: guildId, ...sent };
  }) as never);
  const result = await channels.handlers.get("discord_edit_channel")!({
    channel_id: channel.id,
    ...fields,
  });
  assert.ok(!result.isError);
  return { text: (result.content[0] as { text: string }).text, bodies };
}

test("edit_channel sends every field to a text channel and keeps its reply", async () => {
  const { text, guildId } = freshGuild();
  const result = await editChannel(text, guildId, {
    name: "renamed",
    topic: "rules",
    slowmode: 30,
    nsfw: true,
  });
  assert.deepEqual(result.bodies, [
    { name: "renamed", topic: "rules", nsfw: true, rate_limit_per_user: 30 },
  ]);
  assert.equal(result.text, "✅ Channel #renamed updated.");
});

test("edit_channel names the fields it did not send to an announcement channel", async () => {
  const { news, guildId } = freshGuild();
  const result = await editChannel(news, guildId, { name: "renamed", topic: "rules" });
  assert.deepEqual(result.bodies, [{ name: "renamed" }]);
  assert.equal(
    result.text,
    "✅ Channel #renamed updated, without topic: this tool sends it to plain text channels only.",
  );
});

for (const [label, fields, named] of [
  ["slowmode", { slowmode: 30 }, "slowmode"],
  ["topic and slowmode", { topic: "rules", slowmode: 30 }, "topic and slowmode"],
] as const) {
  test(`edit_channel sends nothing and says so for ${label} alone on a voice channel`, async () => {
    const { voice, guildId } = freshGuild();
    const result = await editChannel(voice, guildId, fields);
    assert.equal(result.bodies.length, 0, "no PATCH may go out");
    assert.equal(
      result.text,
      `✅ Channel #lobby unchanged: this tool sends ${named} to plain text channels only, so nothing was sent to Discord.`,
    );
  });
}

test("edit_channel sends nothing and says so when no field is given", async () => {
  const { text, guildId } = freshGuild();
  const result = await editChannel(text, guildId, {});
  assert.equal(result.bodies.length, 0, "no PATCH may go out");
  assert.equal(result.text, "✅ Channel #chat unchanged: the call gave no field to change.");
});
