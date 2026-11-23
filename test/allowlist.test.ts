import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ChannelType, GuildScheduledEventEntityType, Routes, TextChannel } from "discord.js";
import { discord, fetchChannelChecked } from "../src/client.js";
import webhooks from "../src/tools/webhooks.js";
import scheduledEvents from "../src/tools/scheduledEvents.js";
import messages from "../src/tools/messages.js";

const ALLOWED = "111111111111111111";
const FOREIGN = "222222222222222222";

afterEach(() => {
  mock.restoreAll();
  delete process.env.DISCORD_ALLOWED_GUILDS;
});

test("fetchChannelChecked rejects a channel whose guild is outside the allow-list", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = ALLOWED;
  mock.method(discord.channels, "fetch", async () => ({ guildId: FOREIGN }) as never);
  await assert.rejects(() => fetchChannelChecked("333333333333333333"), /allow-list/);
});

test("fetchChannelChecked passes an allowed channel and guild-less objects through", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = ALLOWED;
  const fetch = mock.method(discord.channels, "fetch", async () => ({ guildId: ALLOWED }) as never);
  assert.ok(await fetchChannelChecked("333333333333333333"));
  // A second mock.method on the same method survives restoreAll and leaks into later tests.
  fetch.mock.mockImplementation(async () => ({}) as never);
  assert.ok(await fetchChannelChecked("333333333333333333"));
});

const TOKEN_WEBHOOK_CALLS: [string, Record<string, unknown>][] = [
  ["discord_send_webhook_message", { content: "x" }],
  ["discord_edit_webhook_message", { message_id: "444444444444444444", content: "x" }],
  ["discord_delete_webhook_message", { message_id: "444444444444444444" }],
  ["discord_fetch_webhook_message", { message_id: "444444444444444444" }],
];

for (const [tool, extra] of TOKEN_WEBHOOK_CALLS) {
  test(`${tool} is gated when the allow-list is active`, async () => {
    process.env.DISCORD_ALLOWED_GUILDS = ALLOWED;
    mock.method(discord, "fetchWebhook", async () => ({ guildId: FOREIGN }) as never);
    await assert.rejects(
      () =>
        webhooks.handlers.get(tool)!({
          webhook_id: "333333333333333333",
          webhook_token: "tok",
          ...extra,
        }),
      /allow-list/,
    );
  });

  test(`${tool} fails closed when the webhook has no resolvable guild`, async () => {
    process.env.DISCORD_ALLOWED_GUILDS = ALLOWED;
    mock.method(discord, "fetchWebhook", async () => ({}) as never);
    await assert.rejects(
      () =>
        webhooks.handlers.get(tool)!({
          webhook_id: "333333333333333333",
          webhook_token: "tok",
          ...extra,
        }),
      /no resolvable guild/,
    );
  });
}

const THREAD = "333333333333333333";
const FOREIGN_PARENT = "222222222222222229";
const MEMBER = "444444444444444444";

/** Every write the thread tools could send, through discord.js managers or the REST client. */
function recordThreadWrites() {
  const writes: string[] = [];
  const record =
    (name: string) =>
    async (...args: unknown[]) => {
      writes.push(name);
      return args[0];
    };
  for (const method of ["put", "post", "patch", "delete"] as const)
    mock.method(discord.rest, method, record(`rest.${method}`) as never);
  return { writes, record };
}

test("thread member tools refuse a thread outside the allow-list before changing members", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = ALLOWED;
  const { writes, record } = recordThreadWrites();
  const thread = {
    id: THREAD,
    name: "pair",
    guildId: FOREIGN,
    type: ChannelType.PrivateThread,
    isThread: () => true,
    archived: true,
    setArchived: record("setArchived"),
    members: { add: record("members.add"), remove: record("members.remove") },
  };
  mock.method(discord.channels, "fetch", async () => thread as never);
  for (const tool of ["discord_add_thread_member", "discord_remove_thread_member"])
    await assert.rejects(
      messages.handlers.get(tool)!({ thread_id: THREAD, user_id: MEMBER }),
      new RegExp(`Guild ${FOREIGN} is not in the DISCORD_ALLOWED_GUILDS allow-list`),
      tool,
    );
  assert.deepEqual(writes, []);
});

test("create_thread with member_ids refuses a parent outside the allow-list before reaching Discord", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = ALLOWED;
  const { writes, record } = recordThreadWrites();
  const channel = Object.assign(Object.create(TextChannel.prototype) as object, {
    id: FOREIGN_PARENT,
    name: "foreign",
    guildId: FOREIGN,
    type: ChannelType.GuildText,
    isDMBased: () => false,
    isTextBased: () => true,
    threads: { create: record("threads.create") },
    messages: { fetch: record("messages.fetch") },
  });
  mock.method(discord.channels, "fetch", async () => channel as never);
  for (const extra of [{ private: true }, { message_id: "555555555555555555" }])
    await assert.rejects(
      messages.handlers.get("discord_create_thread")!({
        channel_id: FOREIGN_PARENT,
        name: "pair",
        member_ids: [MEMBER],
        ...extra,
      }),
      new RegExp(`Guild ${FOREIGN} is not in the DISCORD_ALLOWED_GUILDS allow-list`),
      JSON.stringify(extra),
    );
  assert.deepEqual(writes, []);
});

test("no tool module bypasses the checked channel fetch", () => {
  const dir = join(__dirname, "..", "src", "tools");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    const src = readFileSync(join(dir, file), "utf-8");
    assert.ok(
      !/discord\.channels\.fetch/.test(src),
      `${file} calls discord.channels.fetch directly; use fetchChannelChecked/getTextChannel/getGuildChannel`,
    );
    assert.ok(
      !/guild_id:\s*snowflake\b/.test(src),
      `${file} declares a raw guild_id: snowflake input; use the allow-list-enforcing guildId fragment`,
    );
  }
});

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

const SECOND_ALLOWED = "555555555555555555";
const EVENT_CHANNEL = "111111111111111112";
const VOICE_CHANNEL = "111111111111111113";
const SECOND_CHANNEL = "555555555555555556";
const FOREIGN_CHANNEL = "222222222222222223";
const EXTERNAL_EVENT = "111111111111111114";
const VOICE_EVENT = "111111111111111115";

const rawEvent = (id: string, entityType: number, channelId: string | null) => ({
  id,
  guild_id: ALLOWED,
  channel_id: channelId,
  name: `event-${id}`,
  description: null,
  scheduled_start_time: "2030-01-01T10:00:00.000Z",
  scheduled_end_time: "2030-01-01T11:00:00.000Z",
  privacy_level: 2,
  status: 1,
  entity_type: entityType,
  entity_id: null,
  entity_metadata: channelId ? null : { location: "elsewhere" },
  image: null,
});

/** Real guild structures, so the invite route comes from discord.js's own channel resolution. */
for (const [guild, channels, events] of [
  [
    ALLOWED,
    [
      { id: EVENT_CHANNEL, type: 0, name: "events", position: 0 },
      { id: VOICE_CHANNEL, type: 2, name: "voice", position: 1 },
    ],
    [
      rawEvent(EXTERNAL_EVENT, GuildScheduledEventEntityType.External, null),
      rawEvent(VOICE_EVENT, GuildScheduledEventEntityType.Voice, VOICE_CHANNEL),
    ],
  ],
  [SECOND_ALLOWED, [{ id: SECOND_CHANNEL, type: 0, name: "second", position: 0 }], []],
  [FOREIGN, [{ id: FOREIGN_CHANNEL, type: 0, name: "foreign", position: 0 }], []],
] as const) {
  asAdder(discord.guilds)._add({
    id: guild,
    name: `guild-${guild}`,
    owner_id: "1",
    roles: [],
    emojis: [],
    features: [],
    channels: channels.map((c) => ({ ...c, permission_overwrites: [] })),
    threads: [],
    guild_scheduled_events: events,
    stickers: [],
  });
}

function stubInvitePost() {
  const routes: string[] = [];
  mock.method(discord.rest, "post", (async (route: string) => {
    routes.push(route);
    return { code: "abc123" };
  }) as never);
  return routes;
}

const eventInvite = (event_id: string, channel_id?: string) =>
  scheduledEvents.handlers.get("discord_create_event_invite")!({
    guild_id: ALLOWED,
    event_id,
    ...(channel_id ? { channel_id } : {}),
  });

test("create_event_invite refuses a channel_id from a guild outside the allow-list", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = `${ALLOWED},${SECOND_ALLOWED}`;
  const posts = stubInvitePost();
  await assert.rejects(
    eventInvite(EXTERNAL_EVENT, FOREIGN_CHANNEL),
    new RegExp(`Guild ${FOREIGN} is not in the DISCORD_ALLOWED_GUILDS allow-list`),
  );
  assert.deepEqual(posts, []);
});

for (const allowList of [`${ALLOWED},${SECOND_ALLOWED}`, undefined]) {
  test(`create_event_invite refuses a channel_id from another guild (allow-list ${allowList ? "on" : "off"})`, async () => {
    if (allowList) process.env.DISCORD_ALLOWED_GUILDS = allowList;
    const posts = stubInvitePost();
    await assert.rejects(
      eventInvite(EXTERNAL_EVENT, SECOND_CHANNEL),
      new RegExp(`^Error: Channel ${SECOND_CHANNEL} is not in server ${ALLOWED}`),
    );
    assert.deepEqual(posts, []);
  });
}

test("create_event_invite creates an EXTERNAL event invite in a channel of the event's guild", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = `${ALLOWED},${SECOND_ALLOWED}`;
  const posts = stubInvitePost();
  const result = await eventInvite(EXTERNAL_EVENT, EVENT_CHANNEL);
  assert.ok(!result.isError);
  assert.deepEqual(posts, [Routes.channelInvites(EVENT_CHANNEL)]);
  assert.match(
    (result.content[0] as { text: string }).text,
    new RegExp(`/abc123\\?event=${EXTERNAL_EVENT}$`),
  );
});

test("create_event_invite keeps its entity-type checks and a VOICE event's own channel", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = ALLOWED;
  const posts = stubInvitePost();
  await assert.rejects(
    eventInvite(EXTERNAL_EVENT),
    /^Error: channel_id is required for EXTERNAL events \(they have no channel of their own\)\.$/,
  );
  await assert.rejects(
    eventInvite(VOICE_EVENT, EVENT_CHANNEL),
    /^Error: channel_id is only honored for EXTERNAL events; VOICE\/STAGE invites always point at the event's own channel; omit channel_id\.$/,
  );
  assert.deepEqual(posts, []);
  assert.ok(!(await eventInvite(VOICE_EVENT)).isError);
  assert.deepEqual(posts, [Routes.channelInvites(VOICE_CHANNEL)]);
});
