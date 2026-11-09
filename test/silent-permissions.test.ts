import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Collection, PermissionFlagsBits } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";
import forums from "../src/tools/forums.js";
import permissions from "../src/tools/permissions.js";
import channels from "../src/tools/channels.js";
import discovery from "../src/tools/discovery.js";

/**
 * Real structures from raw gateway payloads, as in embed-permissions.test.ts, so the
 * permission math, the thread-to-parent resolution and the channel flags are discord.js's own.
 */

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

const GUILD = "200000000000000001";
const BOT = "200000000000000002";
const CATEGORY = "200000000000000003";
const READABLE = "200000000000000004";
const NO_HISTORY = "200000000000000005";
const READABLE_THREAD = "200000000000000006";
const NO_HISTORY_THREAD = "200000000000000007";
const NO_HISTORY_FORUM = "200000000000000008";
const NO_HISTORY_POST = "200000000000000009";
const OBFUSCATED = "200000000000000010";
const OBFUSCATED_CATEGORY = "200000000000000011";
const UNDER_HIDDEN = "200000000000000012";
const UNVIEWABLE = "200000000000000013";
const TARGET = "200000000000000014";
const CLEAN_GUILD = "200000000000000020";
const CLEAN_CHANNEL = "200000000000000021";

const OBFUSCATED_FLAG = 1 << 17;

const everyonePermissions =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.ReadMessageHistory |
  PermissionFlagsBits.ManageMessages |
  PermissionFlagsBits.ManageChannels |
  PermissionFlagsBits.ManageRoles;

const botUser = {
  id: BOT,
  username: "bot",
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot: true,
};

const botDeny = (permission: bigint) => [
  { id: BOT, type: 1, allow: "0", deny: String(permission) },
];

/** Discord's placeholder for a channel the bot cannot view. */
const obfuscated = (id: string, type: number, position: number) => ({
  id,
  type,
  name: "___hidden___",
  position,
  flags: OBFUSCATED_FLAG,
  permission_overwrites: [
    { id: GUILD, type: 0, allow: "0", deny: String(PermissionFlagsBits.ViewChannel) },
  ],
});

const rawThread = (id: string, parentId: string, name: string) => ({
  id,
  type: 11,
  name,
  parent_id: parentId,
  owner_id: BOT,
  member_count: 1,
  message_count: 3,
  thread_metadata: {
    archived: false,
    auto_archive_duration: 60,
    archive_timestamp: new Date(0).toISOString(),
    locked: false,
  },
});

const rawGuild = (id: string, rawChannels: unknown[], threads: unknown[]) => ({
  id,
  name: `guild-${id}`,
  owner_id: "1",
  afk_timeout: 300,
  verification_level: 0,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [
    {
      id,
      name: "@everyone",
      color: 0,
      hoist: false,
      position: 0,
      permissions: String(everyonePermissions),
      managed: false,
      mentionable: false,
      flags: 0,
    },
  ],
  emojis: [],
  features: [],
  mfa_level: 0,
  system_channel_flags: 0,
  joined_at: new Date(0).toISOString(),
  large: false,
  unavailable: false,
  member_count: 1,
  voice_states: [],
  members: [
    {
      user: botUser,
      roles: [],
      joined_at: new Date(0).toISOString(),
      deaf: false,
      mute: false,
      flags: 0,
    },
  ],
  channels: rawChannels,
  threads,
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  stickers: [],
  premium_tier: 0,
  preferred_locale: "en-US",
  nsfw_level: 0,
});

(discord as unknown as { user: unknown }).user = asAdder(discord.users)._add(botUser);
asAdder(discord.guilds)._add(
  rawGuild(
    GUILD,
    [
      { id: CATEGORY, type: 4, name: "General", position: 0, permission_overwrites: [] },
      {
        id: READABLE,
        type: 0,
        name: "readable",
        position: 0,
        parent_id: CATEGORY,
        permission_overwrites: [],
      },
      {
        id: NO_HISTORY,
        type: 0,
        name: "no-history",
        position: 1,
        parent_id: CATEGORY,
        permission_overwrites: botDeny(PermissionFlagsBits.ReadMessageHistory),
      },
      {
        id: NO_HISTORY_FORUM,
        type: 15,
        name: "no-history-forum",
        position: 2,
        parent_id: CATEGORY,
        available_tags: [],
        permission_overwrites: botDeny(PermissionFlagsBits.ReadMessageHistory),
      },
      {
        id: UNVIEWABLE,
        type: 0,
        name: "secret",
        position: 3,
        permission_overwrites: botDeny(PermissionFlagsBits.ViewChannel),
      },
      { id: TARGET, type: 0, name: "target", position: 4, permission_overwrites: [] },
      obfuscated(OBFUSCATED, 0, 5),
      obfuscated(OBFUSCATED_CATEGORY, 4, 1),
      {
        id: UNDER_HIDDEN,
        type: 0,
        name: "under-hidden",
        position: 6,
        parent_id: OBFUSCATED_CATEGORY,
        permission_overwrites: [],
      },
    ],
    [
      rawThread(READABLE_THREAD, READABLE, "readable-thread"),
      rawThread(NO_HISTORY_THREAD, NO_HISTORY, "no-history-thread"),
      rawThread(NO_HISTORY_POST, NO_HISTORY_FORUM, "no-history-post"),
    ],
  ),
);
asAdder(discord.guilds)._add(
  rawGuild(
    CLEAN_GUILD,
    [{ id: CLEAN_CHANNEL, type: 0, name: "clean", position: 0, permission_overwrites: [] }],
    [],
  ),
);

afterEach(() => mock.restoreAll());

const cached = <T>(id: string) => discord.channels.cache.get(id) as unknown as T;

type MessageReader = {
  messages: {
    fetch: (...args: unknown[]) => Promise<unknown>;
    fetchPins: (...args: unknown[]) => Promise<unknown>;
  };
  bulkDelete: (...args: unknown[]) => Promise<unknown>;
};

/** Stubs every message request on a channel, as Discord answers them without Read Message History. */
function stubEmptyHistory(channelId: string) {
  const channel = cached<MessageReader>(channelId);
  const fetch = mock.method(channel.messages, "fetch", async () => new Collection());
  const fetchPins = mock.method(channel.messages, "fetchPins", async () => ({
    items: [],
    hasMore: false,
  }));
  const bulkDelete = mock.method(channel, "bulkDelete", async () => new Collection());
  // get_forum_post force-fetches the thread; hand back the cached structure.
  mock.method(discord.channels, "fetch", async (id: string) => discord.channels.cache.get(id));
  return () => fetch.mock.callCount() + fetchPins.mock.callCount() + bulkDelete.mock.callCount();
}

const READERS: Record<string, (id: string) => Promise<{ isError?: boolean }>> = {
  discord_read_messages: (channel_id) =>
    messages.handlers.get("discord_read_messages")!({ channel_id }),
  discord_search_messages: (channel_id) =>
    messages.handlers.get("discord_search_messages")!({ channel_id, keyword: "anything" }),
  discord_fetch_pinned_messages: (channel_id) =>
    messages.handlers.get("discord_fetch_pinned_messages")!({ channel_id }),
  discord_get_forum_post: (thread_id) =>
    forums.handlers.get("discord_get_forum_post")!({ thread_id }),
};

const missingHistory = (name: string, id: string) =>
  new RegExp(`lacks the Read Message History permission in #${name} \\(${id}\\)`);

for (const [tool, run] of Object.entries(READERS)) {
  const denied =
    tool === "discord_get_forum_post"
      ? { id: NO_HISTORY_POST, name: "no-history-post" }
      : { id: NO_HISTORY, name: "no-history" };

  test(`${tool} turns an empty result into an error where the bot lacks Read Message History`, async () => {
    stubEmptyHistory(denied.id);
    await assert.rejects(run(denied.id), missingHistory(denied.name, denied.id));
  });

  test(`${tool} still reports an empty result where the bot has Read Message History`, async () => {
    const id = tool === "discord_get_forum_post" ? READABLE_THREAD : READABLE;
    stubEmptyHistory(id);
    const result = await run(id);
    assert.ok(!result.isError);
  });
}

for (const tool of ["discord_read_messages", "discord_search_messages"]) {
  test(`${tool} in a thread follows its parent channel's Read Message History`, async () => {
    stubEmptyHistory(NO_HISTORY_THREAD);
    await assert.rejects(
      READERS[tool](NO_HISTORY_THREAD),
      missingHistory("no-history-thread", NO_HISTORY_THREAD),
    );
  });
}

test("read_messages does not second-guess a non-empty result", async () => {
  const channel = cached<MessageReader>(NO_HISTORY);
  mock.method(
    channel.messages,
    "fetch",
    async () =>
      new Collection([
        [
          "1",
          {
            id: "1",
            author: { id: BOT, tag: "bot" },
            webhookId: null,
            content: "hi",
            createdAt: new Date(0),
            createdTimestamp: 0,
            embeds: [],
            attachments: new Collection(),
            pinned: false,
          },
        ],
      ]),
  );
  const result = await READERS.discord_read_messages(NO_HISTORY);
  assert.ok(!result.isError);
});

const bulkDelete = (channel_id: string, dry_run: boolean) =>
  messages.handlers.get("discord_bulk_delete_messages")!({ channel_id, count: 5, dry_run });

for (const dryRun of [true, false]) {
  const mode = dryRun ? "dry run" : "real run";

  test(`bulk_delete_messages ${mode} refuses without Read Message History, before any request`, async () => {
    const requests = stubEmptyHistory(NO_HISTORY);
    await assert.rejects(bulkDelete(NO_HISTORY, dryRun), missingHistory("no-history", NO_HISTORY));
    assert.equal(requests(), 0, "nothing may be fetched or deleted");

    const threadRequests = stubEmptyHistory(NO_HISTORY_THREAD);
    await assert.rejects(
      bulkDelete(NO_HISTORY_THREAD, dryRun),
      missingHistory("no-history-thread", NO_HISTORY_THREAD),
    );
    assert.equal(threadRequests(), 0);
  });

  test(`bulk_delete_messages ${mode} goes through with Read Message History`, async () => {
    const requests = stubEmptyHistory(READABLE);
    assert.ok(!(await bulkDelete(READABLE, dryRun)).isError);
    assert.equal(requests(), 1);
  });
}

type OverwriteSetter = { permissionOverwrites: { set: (...args: unknown[]) => Promise<unknown> } };

const copyPermissions = (source_channel_id: string) =>
  permissions.handlers.get("discord_copy_permissions")!({
    source_channel_id,
    target_channel_id: TARGET,
  });

const cannotView = (id: string) =>
  new RegExp(`cannot view the source channel ${id}\\..*The call stopped before reaching Discord`);

for (const [label, source] of [
  ["an obfuscated", OBFUSCATED],
  ["an unviewable", UNVIEWABLE],
] as const) {
  test(`copy_permissions refuses ${label} source and leaves the target untouched`, async () => {
    const set = mock.method(
      cached<OverwriteSetter>(TARGET).permissionOverwrites,
      "set",
      async () => {},
    );
    await assert.rejects(copyPermissions(source), cannotView(source));
    assert.equal(set.mock.callCount(), 0);
  });

  test(`clone_channel refuses ${label} source before creating anything`, async () => {
    const guild = discord.guilds.cache.get(GUILD)!;
    const create = mock.method(guild.channels, "create", async () => ({ id: "1", name: "x" }));
    await assert.rejects(
      channels.handlers.get("discord_clone_channel")!({ channel_id: source }),
      cannotView(source),
    );
    assert.equal(create.mock.callCount(), 0);
  });
}

test("copy_permissions copies from a source the bot can view", async () => {
  const set = mock.method(
    cached<OverwriteSetter>(TARGET).permissionOverwrites,
    "set",
    async () => {},
  );
  assert.ok(!(await copyPermissions(NO_HISTORY)).isError);
  assert.equal(set.mock.callCount(), 1);
  const [overwrites] = set.mock.calls[0].arguments as [{ id: string }[]];
  assert.deepEqual(
    overwrites.map((o) => o.id),
    [BOT],
  );
});

test("clone_channel clones a source the bot can view", async () => {
  const guild = discord.guilds.cache.get(GUILD)!;
  const create = mock.method(guild.channels, "create", async () => ({ id: "1", name: "readable" }));
  assert.ok(
    !(await channels.handlers.get("discord_clone_channel")!({ channel_id: READABLE })).isError,
  );
  assert.equal(create.mock.callCount(), 1);
});

/** Stubs the REST channel refresh both discovery tools run first. */
function stubChannelRefresh(guildId: string) {
  const guild = discord.guilds.cache.get(guildId)!;
  mock.method(guild.channels, "fetch", async () => guild.channels.cache);
}

const find = async (guild_id: string, name: string) =>
  (await discovery.handlers.get("discord_find_channel_by_name")!({ guild_id, name }))
    .structuredContent as {
    matches: { id: string; name: string }[];
    hiddenChannels: number;
    note?: string;
  };

test("find_channel_by_name leaves obfuscated placeholders out and counts them", async () => {
  stubChannelRefresh(GUILD);
  const hidden = await find(GUILD, "hidden");
  assert.deepEqual(
    hidden.matches.map((m) => m.id),
    [UNDER_HIDDEN],
    "a placeholder must not read as a real channel",
  );
  assert.equal(hidden.hiddenChannels, 2);
  assert.match(hidden.note ?? "", /2 channel\(s\) are hidden from the bot/);
  assert.match(hidden.note ?? "", /may still exist/);

  const none = await find(GUILD, "does-not-exist");
  assert.deepEqual(none.matches, []);
  assert.equal(none.hiddenChannels, 2);
});

test("find_channel_by_name reports zero hidden channels and no note when none are hidden", async () => {
  stubChannelRefresh(CLEAN_GUILD);
  const result = await find(CLEAN_GUILD, "clean");
  assert.deepEqual(
    result.matches.map((m) => m.id),
    [CLEAN_CHANNEL],
  );
  assert.equal(result.hiddenChannels, 0);
  assert.equal(result.note, undefined);
});

const list = async (guild_id: string) => {
  const result = await discovery.handlers.get("discord_list_channels")!({ guild_id });
  assert.ok(!result.isError, "the output must match the declared outputSchema");
  return result.structuredContent as Record<string, unknown>;
};

test("list_channels leaves obfuscated placeholders out and counts them", async () => {
  stubChannelRefresh(GUILD);
  const result = await list(GUILD);
  assert.equal(result.hiddenChannels, 2);
  assert.ok(!("___hidden___" in result), "a hidden category must not become a key");
  const names = Object.values(result)
    .filter(Array.isArray)
    .flat()
    .map((c) => (c as { name: string }).name);
  assert.ok(!names.includes("___hidden___"), "a placeholder must not read as a real channel");
  assert.deepEqual(
    (result["Hidden parent"] as { id: string }[]).map((c) => c.id),
    [UNDER_HIDDEN],
  );
  assert.deepEqual(
    (result.General as { id: string }[]).map((c) => c.id),
    [READABLE, NO_HISTORY, NO_HISTORY_FORUM],
  );
});

test("list_channels has no hiddenChannels key when nothing is hidden", async () => {
  stubChannelRefresh(CLEAN_GUILD);
  const result = await list(CLEAN_GUILD);
  assert.ok(!("hiddenChannels" in result));
  assert.deepEqual(result["No Category"], [
    { id: CLEAN_CHANNEL, name: "clean", type: "GuildText" },
  ]);
});
