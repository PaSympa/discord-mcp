import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  Collection,
  DiscordAPIError,
  MessageType,
  PermissionFlagsBits,
  Routes,
  SnowflakeUtil,
  type GuildTextBasedChannel,
} from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const AUTHOR = "222222222222222222";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
  delete process.env.DISCORD_ALLOWED_GUILDS;
});

type FakeMessage = {
  id: string;
  author: { id: string };
  webhookId: null;
  createdAt: Date;
  createdTimestamp: number;
  type: number;
  deletable: boolean;
};

/** Message IDs carry their timestamp; the offset keeps IDs of the same instant distinct. */
function message(ageMs: number, offset = 0): FakeMessage {
  const createdTimestamp = Date.now() - ageMs;
  const id = (SnowflakeUtil.generate({ timestamp: createdTimestamp }) + BigInt(offset)).toString();
  return {
    id,
    author: { id: AUTHOR },
    webhookId: null,
    createdAt: new Date(createdTimestamp),
    createdTimestamp,
    type: 0,
    deletable: true,
  };
}

/** A channel whose history answers `fetch` the way Discord pages it, and counts the pages read. */
function channelWith(history: FakeMessage[]) {
  const sorted = [...history].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));
  const fetches: Record<string, unknown>[] = [];
  const channel = {
    id: CHANNEL,
    name: "chan",
    guildId: GUILD,
    guild: { members: { me: null } },
    isDMBased: () => false,
    isTextBased: () => true,
    messages: {
      fetch: async (opts: { after?: string; limit: number }) => {
        fetches.push(opts);
        const page =
          opts.after === undefined
            ? sorted.slice(-opts.limit)
            : sorted.filter((m) => BigInt(m.id) > BigInt(opts.after!)).slice(0, opts.limit);
        return new Collection(page.reverse().map((m) => [m.id, m]));
      },
    },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  return { fetches };
}

function stubRest() {
  const post = mock.method(discord.rest, "post", async () => undefined);
  const del = mock.method(discord.rest, "delete", async () => undefined);
  return { post, del };
}

const run = (args: Record<string, unknown>, signal?: AbortSignal) =>
  messages.handlers.get("discord_bulk_delete_messages")!(
    { channel_id: CHANNEL, ...args },
    {
      signal,
    },
  );

const ids = (list: FakeMessage[]) => list.map((m) => m.id);
const unknownId = (near: FakeMessage, offset: number) =>
  (BigInt(near.id) + BigInt(offset)).toString();

test("a count dry run lists the most recent messages, oldest first, and deletes nothing", async () => {
  const history = [message(5 * HOUR), message(4 * HOUR), message(3 * HOUR), message(20 * DAY)];
  channelWith(history);
  const { post, del } = stubRest();
  const result = await run({ count: 3 });
  const would = result.structuredContent!.would_delete as Record<string, unknown>[];
  assert.deepEqual(
    would.map((m) => m.id),
    ids([history[0], history[1], history[2]]),
  );
  assert.deepEqual(would[0], {
    id: history[0].id,
    author_id: AUTHOR,
    created_at: history[0].createdAt.toISOString(),
    older_than_14_days: false,
  });
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
});

test("an ID dry run splits the IDs into found and not found", async () => {
  const history = [message(3 * HOUR), message(2 * HOUR), message(30 * DAY)];
  channelWith(history);
  const { post, del } = stubRest();
  const missing = unknownId(history[0], 1);
  const future = unknownId(history[1], 1_000_000);
  const result = await run({ message_ids: [history[1].id, missing, history[2].id, future] });
  const content = result.structuredContent!;
  assert.deepEqual(
    (content.would_delete as { id: string; older_than_14_days: boolean }[]).map((m) => [
      m.id,
      m.older_than_14_days,
    ]),
    [
      [history[2].id, true],
      [history[1].id, false],
    ],
  );
  assert.deepEqual(content.not_found, [missing, future]);
  assert.deepEqual(content.remaining, []);
  assert.equal(content.dry_run, true);
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
});

test("a real call refuses count and reaches neither history nor delete", async () => {
  const { fetches } = channelWith([message(HOUR), message(2 * HOUR)]);
  const { post, del } = stubRest();
  await assert.rejects(run({ count: 2, dry_run: false }), /takes message_ids, not count/);
  assert.equal(fetches.length, 0);
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
});

test("the allow-list refusal comes before the count refusal", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = "444444444444444444";
  channelWith([message(HOUR)]);
  await assert.rejects(run({ count: 2, dry_run: false }), /allow-list/);
});

test("the schema takes exactly one of count and message_ids, and distinct IDs", async () => {
  const one = message(HOUR);
  channelWith([one]);
  await assert.rejects(run({}), /exactly one of count or message_ids/);
  await assert.rejects(run({ count: 2, message_ids: [one.id] }), /exactly one/);
  await assert.rejects(run({ message_ids: [one.id, one.id] }), /must not repeat/);
  await assert.rejects(run({ message_ids: [] }), /message_ids/);
  const canonical = /no leading zero, at most 18446744073709551615/;
  await assert.rejects(run({ message_ids: [one.id, `0${one.id.slice(1)}`] }), canonical);
  await assert.rejects(run({ message_ids: ["18446744073709551616"] }), canonical);
  await assert.rejects(run({ message_ids: ["not-a-snowflake"] }), /Must be a Discord snowflake ID/);
  const def = messages.definitions.find((d) => d.name === "discord_bulk_delete_messages")!;
  const prop = (def.inputSchema as { properties: Record<string, Record<string, unknown>> })
    .properties.message_ids;
  assert.equal(prop.uniqueItems, true);
  assert.equal(prop.maxItems, 100);
});

test("a real call deletes only the IDs it finds again, in one bulk request", async () => {
  const history = [message(3 * HOUR), message(2 * HOUR), message(HOUR)];
  channelWith(history);
  const { post, del } = stubRest();
  const missing = unknownId(history[0], 1);
  const result = await run({
    message_ids: [history[2].id, missing, history[0].id],
    dry_run: false,
  });
  assert.equal(post.mock.callCount(), 1);
  const [route, options] = post.mock.calls[0].arguments as [string, { body: unknown }];
  assert.equal(route, Routes.channelBulkDelete(CHANNEL));
  assert.deepEqual(options.body, { messages: [history[0].id, history[2].id] });
  assert.equal(del.mock.callCount(), 0);
  assert.deepEqual(result.structuredContent, {
    dry_run: false,
    deleted: [history[0].id, history[2].id],
    not_deletable: [],
    not_found: [missing],
    failed: [],
    remaining: [],
  });
});

test("a message the bot may not delete is reported and never sent, in both modes", async () => {
  const other = { ...message(3 * HOUR), deletable: false };
  const starter = {
    ...message(2 * HOUR),
    deletable: false,
    type: MessageType.ThreadStarterMessage,
  };
  const mine = [message(HOUR, 1), message(HOUR, 2)];
  channelWith([other, starter, ...mine]);
  const { post, del } = stubRest();
  const refused = [
    { id: other.id, reason: "no_permission" },
    { id: starter.id, reason: "system_message" },
  ];
  const all = ids([other, starter, ...mine]);
  const preview = (await run({ message_ids: all })).structuredContent!;
  assert.deepEqual(
    (preview.would_delete as { id: string }[]).map((m) => m.id),
    ids(mine),
  );
  assert.deepEqual(preview.not_deletable, refused);
  const counted = (await run({ count: 4 })).structuredContent!;
  assert.deepEqual(counted.not_deletable, refused, "the count preview splits the same way");
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);

  const result = (await run({ message_ids: all, dry_run: false })).structuredContent!;
  assert.deepEqual((post.mock.calls[0].arguments[1] as { body: unknown }).body, {
    messages: ids(mine),
  });
  assert.equal(del.mock.callCount(), 0);
  assert.deepEqual(result.deleted, ids(mine));
  assert.deepEqual(result.not_deletable, refused);
});

test("messages near or past 14 days go one by one; the rest go in one bulk request", async () => {
  const recent = [message(2 * HOUR), message(HOUR)];
  const edge = message(14 * DAY - 2 * 60 * 1000);
  const old = message(20 * DAY);
  channelWith([...recent, edge, old]);
  const { post, del } = stubRest();
  const result = await run({ message_ids: ids([...recent, edge, old]), dry_run: false });
  assert.equal(post.mock.callCount(), 1);
  assert.deepEqual((post.mock.calls[0].arguments[1] as { body: unknown }).body, {
    messages: ids(recent),
  });
  assert.deepEqual(
    del.mock.calls.map((c) => c.arguments[0]),
    [Routes.channelMessage(CHANNEL, old.id), Routes.channelMessage(CHANNEL, edge.id)],
    "an ID two minutes short of 14 days is inside the safety margin",
  );
  assert.deepEqual(
    [...(result.structuredContent!.deleted as string[])].sort(),
    ids([...recent, edge, old]).sort(),
  );
});

test("exactly one recent message goes as a single delete, never a bulk request of one", async () => {
  const recent = message(HOUR);
  const old = message(20 * DAY);
  channelWith([recent, old]);
  const { post, del } = stubRest();
  await run({ message_ids: [recent.id, old.id], dry_run: false });
  assert.equal(post.mock.callCount(), 0);
  assert.deepEqual(
    del.mock.calls.map((c) => c.arguments[0]),
    [Routes.channelMessage(CHANNEL, recent.id), Routes.channelMessage(CHANNEL, old.id)],
  );
});

const tooOld = () =>
  new DiscordAPIError(
    { code: 50034, message: "You can only bulk delete messages that are under 14 days old." },
    50034,
    400,
    "POST",
    "/bulk-delete",
    {},
  );

test("a refused bulk request falls back to single deletes, so a retry is not needed", async () => {
  const history = [message(3 * HOUR), message(2 * HOUR), message(HOUR)];
  channelWith(history);
  const post = mock.method(discord.rest, "post", async () => {
    throw tooOld();
  });
  const del = mock.method(discord.rest, "delete", async () => undefined);
  const result = (await run({ message_ids: ids(history), dry_run: false })).structuredContent!;
  assert.equal(post.mock.callCount(), 1);
  assert.deepEqual(
    del.mock.calls.map((c) => c.arguments[0]),
    ids(history).map((id) => Routes.channelMessage(CHANNEL, id)),
  );
  assert.deepEqual(result.deleted, ids(history));
  assert.deepEqual(result.failed, []);
});

test("in the fallback, a message Discord refuses fails alone", async () => {
  const history = [message(3 * HOUR), message(2 * HOUR), message(HOUR)];
  channelWith(history);
  mock.method(discord.rest, "post", async () => {
    throw tooOld();
  });
  const text = "Cannot execute action on a system message";
  mock.method(discord.rest, "delete", async (route: string) => {
    if (route.endsWith(history[1].id))
      throw new DiscordAPIError({ code: 50021, message: text }, 50021, 400, "DELETE", route, {});
  });
  const result = (await run({ message_ids: ids(history), dry_run: false })).structuredContent!;
  assert.deepEqual(result.deleted, ids([history[0], history[2]]));
  assert.deepEqual(result.failed, [{ id: history[1].id, code: 50021, message: text }]);
});

test("the fallback stays within the time budget and returns the rest in remaining", async () => {
  const history = [message(4 * HOUR), message(3 * HOUR), message(2 * HOUR), message(HOUR)];
  channelWith(history);
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  mock.method(discord.rest, "post", async () => {
    throw tooOld();
  });
  mock.method(discord.rest, "delete", async () => void mock.timers.tick(15_000));
  const result = (await run({ message_ids: ids(history), dry_run: false })).structuredContent!;
  assert.deepEqual(result.deleted, ids(history.slice(0, 3)));
  assert.deepEqual(result.remaining, [history[3].id]);
  assert.equal((result.stopped as { reason: string }).reason, "time_budget");
});

test("a 401 with an empty body stops the call and still reports what was deleted", async () => {
  const recent = [message(2 * HOUR), message(HOUR)];
  const old = message(20 * DAY);
  channelWith([...recent, old]);
  mock.method(discord.rest, "post", async () => undefined);
  mock.method(discord.rest, "delete", async () => {
    throw new DiscordAPIError({}, undefined as never, 401, "DELETE", "/m", {});
  });
  const result = await run({ message_ids: ids([...recent, old]), dry_run: false });
  assert.equal(result.isError, undefined, "the output still matches its schema");
  const content = result.structuredContent!;
  assert.deepEqual(content.deleted, ids(recent));
  assert.deepEqual(content.failed, []);
  assert.deepEqual(content.remaining, [old.id]);
  assert.deepEqual(
    [(content.stopped as { code: number }).code, (content.stopped as { reason: string }).reason],
    [401, "error"],
  );
});

test("a missing permission stops the call and keeps every ID in remaining", async () => {
  const recent = message(HOUR);
  const old = [message(20 * DAY), message(21 * DAY)];
  channelWith([recent, ...old]);
  const del = mock.method(discord.rest, "delete", async () => {
    throw new DiscordAPIError(
      { code: 50013, message: "Missing Permissions" },
      50013,
      403,
      "DELETE",
      "/m",
      {},
    );
  });
  const result = await run({ message_ids: [recent.id, ...ids(old)], dry_run: false });
  assert.equal(del.mock.callCount(), 1, "one refusal is enough");
  const content = result.structuredContent!;
  assert.deepEqual(content.deleted, []);
  assert.equal((content.remaining as string[]).length, 3);
  assert.deepEqual((content.stopped as { reason: string; code: number }).code, 50013);
});

test("old messages past the time budget come back in remaining", async () => {
  const old = [message(20 * DAY), message(21 * DAY), message(22 * DAY), message(23 * DAY)];
  channelWith(old);
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const del = mock.method(discord.rest, "delete", async () => {
    mock.timers.tick(15_000);
  });
  const result = await run({ message_ids: ids(old), dry_run: false });
  assert.equal(del.mock.callCount(), 3);
  const content = result.structuredContent!;
  assert.equal((content.deleted as string[]).length, 3);
  assert.deepEqual(content.remaining, [old[0].id], "the newest of the old ones is deleted last");
  assert.equal((content.stopped as { reason: string }).reason, "time_budget");
});

test("the lookup stops after 10 pages and returns the IDs it did not reach", async () => {
  const history = Array.from({ length: 1200 }, (_, i) => message(5 * DAY, i));
  const { fetches } = channelWith(history);
  stubRest();
  const wanted = Array.from({ length: 11 }, (_, i) => history[i * 110].id);
  const result = await run({ message_ids: wanted });
  assert.equal(fetches.length, 10);
  const content = result.structuredContent!;
  assert.equal((content.would_delete as unknown[]).length, 10);
  assert.deepEqual(content.remaining, [wanted[10]]);
  assert.equal((content.stopped as { reason: string }).reason, "lookup_limit");
});

test("a page settles every pending ID in its span, so clustered IDs cost one page", async () => {
  const history = Array.from({ length: 300 }, (_, i) => message(DAY, i));
  const { fetches } = channelWith(history);
  stubRest();
  const result = await run({ message_ids: ids(history.slice(10, 60)) });
  assert.equal(fetches.length, 1);
  assert.equal((result.structuredContent!.would_delete as unknown[]).length, 50);
});

test(
  "a lookup page that hangs is abandoned at the hard stop, with every ID in remaining",
  {
    timeout: 5_000,
  },
  async () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
    const wanted = [message(HOUR), message(2 * HOUR)];
    let reached!: () => void;
    const started = new Promise<void>((resolve) => (reached = resolve));
    const channel = {
      id: CHANNEL,
      name: "chan",
      guildId: GUILD,
      guild: { members: { me: null } },
      isDMBased: () => false,
      isTextBased: () => true,
      messages: {
        fetch: () => {
          reached();
          return new Promise(() => {});
        },
      },
    };
    mock.method(discord.channels, "fetch", async () => channel as never);
    const { post, del } = stubRest();
    const pending = run({ message_ids: ids(wanted), dry_run: false });
    await started;
    mock.timers.tick(50_000);
    const content = (await pending).structuredContent!;
    assert.deepEqual(content.deleted, []);
    assert.deepEqual([...(content.remaining as string[])].sort(), ids(wanted).sort());
    assert.match((content.stopped as { message: string }).message, /still running 10 s past/);
    assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
  },
);

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

const BOT = "400000000000000001";
const REAL_GUILD = "400000000000000010";
const MANAGED_CHANNEL = "400000000000000011";
const PLAIN_CHANNEL = "400000000000000012";
const botUser = {
  id: BOT,
  username: "bot",
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot: true,
};
const otherUser = { ...botUser, id: AUTHOR, username: "member", bot: false };

(discord as unknown as { user: unknown }).user = asAdder(discord.users)._add(botUser);
asAdder(discord.guilds)._add({
  id: REAL_GUILD,
  name: "real",
  owner_id: "1",
  afk_timeout: 300,
  verification_level: 0,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [
    {
      id: REAL_GUILD,
      name: "@everyone",
      color: 0,
      hoist: false,
      position: 0,
      permissions: String(
        PermissionFlagsBits.ViewChannel |
          PermissionFlagsBits.ReadMessageHistory |
          PermissionFlagsBits.ManageMessages,
      ),
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
  channels: [
    { id: MANAGED_CHANNEL, type: 0, name: "managed", position: 0, permission_overwrites: [] },
    {
      id: PLAIN_CHANNEL,
      type: 0,
      name: "plain",
      position: 1,
      permission_overwrites: [
        { id: BOT, type: 1, allow: "0", deny: String(PermissionFlagsBits.ManageMessages) },
      ],
    },
  ],
  threads: [],
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  stickers: [],
  premium_tier: 0,
  preferred_locale: "en-US",
  nsfw_level: 0,
});

/** Real discord.js messages in a real channel, so `deletable` runs its own checks. */
function realChannel(channelId: string, raws: { type: number; author: typeof botUser }[]) {
  const channel = discord.channels.cache.get(channelId) as GuildTextBasedChannel;
  const built = raws.map(({ type, author }, i) => {
    const timestamp = Date.now() - HOUR + i;
    return asAdder(channel.messages)._add(
      {
        id: SnowflakeUtil.generate({ timestamp }).toString(),
        channel_id: channelId,
        guild_id: REAL_GUILD,
        type,
        content: "",
        author,
        timestamp: new Date(timestamp).toISOString(),
        edited_timestamp: null,
        tts: false,
        mention_everyone: false,
        mentions: [],
        mention_roles: [],
        attachments: [],
        embeds: [],
        pinned: false,
      },
      false,
    ) as { id: string };
  });
  mock.method(discord.channels, "fetch", async () => channel as never);
  mock.method(
    channel.messages,
    "fetch",
    async () => new Collection(built.map((m) => [m.id, m])) as never,
  );
  return built.map((m) => m.id);
}

test("discord.js decides what is deletable: author and Manage Messages, then the type", async () => {
  const raws = [
    { type: MessageType.Default, author: botUser },
    { type: MessageType.Default, author: otherUser },
    { type: MessageType.ThreadStarterMessage, author: otherUser },
  ];
  const [mine, others, starter] = realChannel(PLAIN_CHANNEL, raws);
  const plain = (await run({ channel_id: PLAIN_CHANNEL, message_ids: [mine, others, starter] }))
    .structuredContent!;
  assert.deepEqual(
    (plain.would_delete as { id: string }[]).map((m) => m.id),
    [mine],
  );
  assert.deepEqual(plain.not_deletable, [
    { id: others, reason: "no_permission" },
    { id: starter, reason: "system_message" },
  ]);
  mock.restoreAll();

  const managed = realChannel(MANAGED_CHANNEL, raws);
  const content = (await run({ channel_id: MANAGED_CHANNEL, message_ids: managed }))
    .structuredContent!;
  assert.deepEqual(
    (content.would_delete as { id: string }[]).map((m) => m.id),
    managed.slice(0, 2),
    "with Manage Messages, another member's message is deletable",
  );
  assert.deepEqual(content.not_deletable, [{ id: managed[2], reason: "system_message" }]);
});

test("the call's signal reaches each delete request", async () => {
  const history = [message(2 * HOUR), message(HOUR)];
  channelWith(history);
  const { post } = stubRest();
  const controller = new AbortController();
  await run({ message_ids: ids(history), dry_run: false }, controller.signal);
  const { signal } = post.mock.calls[0].arguments[1] as { signal: AbortSignal };
  assert.ok(signal instanceof AbortSignal);
  assert.equal(signal.aborted, false);
});
