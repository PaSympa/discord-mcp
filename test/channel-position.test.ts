import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import channels from "../src/tools/channels.js";

/** Real structures from raw gateway payloads, so the grouping setPosition uses is discord.js's own. */

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

afterEach(() => mock.restoreAll());

let nextGuild = 500000000000000000n;

/**
 * A fresh guild per call, since a PATCH reorders the cache: two categories, and under the
 * first one text, text, forum, voice and stage channels, plus channels elsewhere and a thread.
 */
function freshGuild() {
  nextGuild += 100n;
  const id = (n: number) => String(nextGuild + BigInt(n));
  const raw = (n: number, type: number, position: number, parent?: number) => ({
    id: id(n),
    type,
    name: `c${n}`,
    position,
    ...(parent ? { parent_id: id(parent) } : {}),
    ...(type === 15 ? { available_tags: [] } : {}),
    permission_overwrites: [],
  });
  asAdder(discord.guilds)._add({
    id: id(0),
    name: "guild",
    owner_id: "1",
    roles: [],
    emojis: [],
    features: [],
    channels: [
      raw(1, 4, 0),
      raw(2, 4, 1),
      raw(10, 0, 0, 1),
      raw(11, 0, 1, 1),
      raw(12, 15, 2, 1),
      raw(13, 2, 3, 1),
      raw(14, 13, 4, 1),
      raw(20, 0, 5, 2),
      raw(30, 0, 6),
    ],
    threads: [
      {
        id: id(40),
        type: 11,
        name: "thread",
        parent_id: id(10),
        thread_metadata: { archived: false, auto_archive_duration: 60, locked: false },
      },
    ],
    stickers: [],
    guild_scheduled_events: [],
  });
  return id;
}

async function setPosition(channel: number, position: number) {
  const id = freshGuild();
  const orders: string[][] = [];
  mock.method(discord.rest, "patch", (async (
    _route: string,
    { body }: { body: { id: string }[] },
  ) => {
    orders.push(body.map((c) => c.id));
  }) as never);
  const result = await channels.handlers.get("discord_set_channel_position")!({
    channel_id: id(channel),
    position,
  });
  const text = (result.content[0] as { text: string }).text;
  return { text, order: orders[0], id };
}

const CASES: [string, number, number, number[], number | null][] = [
  ["a text channel moved up", 11, 0, [11, 10, 12], null],
  ["a text channel moved to the last place of its group", 10, 2, [11, 12, 10], null],
  ["a text channel past its group of text and forum channels", 10, 3, [10, 11, 12], 3],
  ["a voice channel moved below a stage channel", 13, 1, [14, 13], null],
  ["a voice channel past its group of voice and stage channels", 13, 2, [13, 14], 2],
  ["a category past the categories", 1, 2, [1, 2], 2],
];

for (const [label, channel, position, expected, unchangedIn] of CASES) {
  test(`set_channel_position: ${label}`, async () => {
    const { text, order, id } = await setPosition(channel, position);
    assert.deepEqual(order, expected.map(id), "the PATCH discord.js sends");
    if (unchangedIn === null) {
      assert.equal(text, `✅ Channel #c${channel} moved to position ${position}.`);
    } else {
      assert.equal(
        text,
        `✅ Channel #c${channel} kept its place: its group has ${unchangedIn} channels (positions 0 to ${unchangedIn - 1}), so position ${position} leaves the order unchanged.`,
      );
    }
  });
}
