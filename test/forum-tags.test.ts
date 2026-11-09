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
  emoji?: { id: string | null; name: string | null } | null;
  moderated: boolean;
}

interface ExistingTag {
  id: string;
  name: string;
  emoji?: { id: string | null; name: string | null } | null;
  moderated?: boolean;
}

/** Stubs a forum holding the given tags and records every tag list sent to Discord. */
function stubForum(existing: ExistingTag[]) {
  const sent: SentTag[][] = [];
  const fetchOptions: unknown[] = [];
  const forum = {
    name: "forum",
    guildId: GUILD,
    type: ChannelType.GuildForum,
    availableTags: existing.map((t) => ({ moderated: false, emoji: null, ...t })),
    setAvailableTags: async (tags: SentTag[]) => {
      sent.push(tags);
      return forum;
    },
  };
  mock.method(discord.channels, "fetch", async (_id: string, options: unknown) => {
    fetchOptions.push(options);
    return forum as never;
  });
  return Object.assign(sent, { fetchOptions });
}

interface TagArg {
  name: string;
  emoji_name?: string | null;
  emoji_id?: string | null;
  moderated?: boolean;
}

const setTags = (tags: TagArg[]) =>
  forums.handlers.get("discord_set_forum_tags")!({ forum_channel_id: FORUM, tags });

const replyOf = (result: { content: { text?: string }[] }) => result.content[0]?.text ?? "";

const CUSTOM_EMOJI = "999999999999999999";

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

test("set_forum_tags keeps the emoji and moderated flag of a tag listed by name alone", async () => {
  const sent = stubForum([
    { id: "10", name: "staff", emoji: { id: null, name: "🛡️" }, moderated: true },
    { id: "11", name: "custom", emoji: { id: CUSTOM_EMOJI, name: null } },
  ]);
  const result = await setTags([{ name: "staff" }, { name: "custom" }]);
  assert.deepEqual(sent[0][0].emoji, { id: null, name: "🛡️" });
  assert.equal(sent[0][0].moderated, true, "a moderator-only tag must not open to everyone");
  assert.deepEqual(sent[0][1].emoji, { id: CUSTOM_EMOJI, name: null }, "a custom emoji survives");
  assert.match(replyOf(result), /No tag changed\./);
});

test("set_forum_tags writes a kept custom emoji by its ID alone, even when read with a name", async () => {
  const sent = stubForum([
    { id: "10", name: "custom", emoji: { id: CUSTOM_EMOJI, name: "party" } },
    { id: "11", name: "again", emoji: { id: CUSTOM_EMOJI, name: "party" } },
  ]);
  const result = await setTags([{ name: "custom" }, { name: "again", emoji_id: CUSTOM_EMOJI }]);
  assert.deepEqual(sent[0][0].emoji, { id: CUSTOM_EMOJI, name: null });
  assert.deepEqual(sent[0][1].emoji, { id: CUSTOM_EMOJI, name: null });
  assert.match(replyOf(result), /No tag changed\./, "the same emoji ID is not a change");
});

test("set_forum_tags clears a custom emoji with emoji_id null", async () => {
  const sent = stubForum([{ id: "10", name: "custom", emoji: { id: CUSTOM_EMOJI, name: null } }]);
  const result = await setTags([{ name: "custom", emoji_id: null }]);
  assert.equal(sent[0][0].emoji, null);
  assert.match(replyOf(result), /^Changed: custom \(emoji\)$/m);
});

test("set_forum_tags rejects an empty emoji_name before any request", async () => {
  const sent = stubForum([{ id: "10", name: "alpha" }]);
  await assert.rejects(() => setTags([{ name: "alpha", emoji_name: "" }]), /emoji_name/);
  assert.equal(sent.fetchOptions.length, 0);
  assert.equal(sent.length, 0);
});

test("set_forum_tags reads a fresh copy of the forum before writing tags back", async () => {
  const sent = stubForum([{ id: "10", name: "alpha" }]);
  await setTags([{ name: "alpha" }]);
  assert.deepEqual(sent.fetchOptions, [{ force: true }]);
});

test("set_forum_tags sets a custom emoji from emoji_id and clears one with null", async () => {
  const sent = stubForum([
    { id: "10", name: "alpha", emoji: { id: null, name: "🔥" } },
    { id: "11", name: "beta", emoji: { id: null, name: "🐛" } },
  ]);
  await setTags([
    { name: "alpha", emoji_id: CUSTOM_EMOJI },
    { name: "beta", emoji_name: null },
  ]);
  assert.deepEqual(sent[0][0].emoji, { id: CUSTOM_EMOJI, name: null });
  assert.equal(sent[0][1].emoji, null);
});

test("set_forum_tags gives a new tag no emoji and moderated false by default", async () => {
  const sent = stubForum([]);
  await setTags([{ name: "fresh" }]);
  assert.equal(sent[0][0].id, undefined);
  assert.equal(sent[0][0].emoji, null);
  assert.equal(sent[0][0].moderated, false);
});

test("set_forum_tags rejects a tag with both emoji_name and emoji_id before any request", async () => {
  const sent = stubForum([{ id: "10", name: "alpha" }]);
  await assert.rejects(
    () => setTags([{ name: "alpha", emoji_name: "🔥", emoji_id: CUSTOM_EMOJI }]),
    /not both/,
  );
  assert.equal(sent.fetchOptions.length, 0);
  assert.equal(sent.length, 0);
});

test("set_forum_tags names the tags created, deleted and changed, with the fields", async () => {
  stubForum([
    { id: "10", name: "bug", moderated: true },
    { id: "11", name: "idea", emoji: { id: null, name: "💡" } },
    { id: "12", name: "same" },
    { id: "13", name: "gone" },
  ]);
  const reply = replyOf(
    await setTags([
      { name: "Bug", moderated: false },
      { name: "idea", emoji_name: "🚀" },
      { name: "same" },
      { name: "new" },
    ]),
  );
  assert.match(reply, /\(4 tags set\)/);
  assert.match(reply, /^Created: new$/m);
  assert.match(reply, /^Deleted: gone$/m);
  assert.match(reply, /^Changed: Bug \(name, moderated\); idea \(emoji\)$/m);
  assert.doesNotMatch(reply, /same/);
});
