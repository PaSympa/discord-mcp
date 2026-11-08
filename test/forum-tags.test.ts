import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ChannelType } from "discord.js";
import { discord } from "../src/client.js";
import forums from "../src/tools/forums.js";

const GUILD = "111111111111111111";
const FORUM = "222222222222222222";

afterEach(() => mock.restoreAll());

interface SentTag {
  id?: string;
  name: string;
  emoji?: { id: string | null; name: string } | null;
  moderated: boolean;
}

/** Stubs a forum holding the given tags and records every tag list sent to Discord. */
function stubForum(existing: { id: string; name: string }[]): SentTag[][] {
  const sent: SentTag[][] = [];
  const forum = {
    name: "forum",
    guildId: GUILD,
    type: ChannelType.GuildForum,
    availableTags: existing.map((t) => ({ ...t, moderated: false, emoji: null })),
    setAvailableTags: async (tags: SentTag[]) => {
      sent.push(tags);
      return forum;
    },
  };
  mock.method(discord.channels, "fetch", async () => forum as never);
  return sent;
}

const setTags = (tags: { name: string; emoji_name?: string; moderated?: boolean }[]) =>
  forums.handlers.get("discord_set_forum_tags")!({ forum_channel_id: FORUM, tags });

test("set_forum_tags sends the existing ID of every tag listed again, so posts keep it", async () => {
  const sent = stubForum([
    { id: "10", name: "alpha" },
    { id: "11", name: "beta" },
    { id: "12", name: "dropped" },
  ]);
  await setTags([
    { name: "alpha" },
    { name: "beta", emoji_name: "🔥", moderated: true },
    { name: "gamma" },
  ]);
  assert.equal(sent.length, 1);
  assert.deepEqual(
    sent[0].map((t) => t.id),
    ["10", "11", undefined],
    "a new name must not carry an ID, so Discord creates it",
  );
  assert.deepEqual(
    sent[0].map((t) => t.name),
    ["alpha", "beta", "gamma"],
    "an unlisted tag is left out, so Discord deletes it",
  );
  assert.deepEqual(sent[0][1].emoji, { name: "🔥", id: null }, "a kept tag takes the new emoji");
  assert.equal(sent[0][1].moderated, true, "a kept tag takes the new moderated flag");
  assert.equal(sent[0][0].moderated, false);
});

test("set_forum_tags keeps the ID when only the case of a name changes", async () => {
  const sent = stubForum([{ id: "10", name: "bug" }]);
  await setTags([{ name: "Bug" }]);
  assert.equal(sent[0][0].id, "10");
  assert.equal(sent[0][0].name, "Bug", "the tag is renamed in place");
});

test("set_forum_tags never sends one existing ID twice", async () => {
  const sent = stubForum([{ id: "10", name: "alpha" }]);
  await setTags([{ name: "alpha" }, { name: "Alpha" }]);
  assert.deepEqual(
    sent[0].map((t) => t.id),
    ["10", undefined],
  );
});
