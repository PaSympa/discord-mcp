import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PermissionFlagsBits } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

/**
 * Real structures from raw gateway payloads, as in cache-growth.test.ts, so the
 * permission math and the thread-to-parent resolution are discord.js's own.
 */

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

const GUILD = "100000000000000001";
const BOT = "100000000000000002";
const ALLOWED = "100000000000000003";
const DENIED = "100000000000000004";
const ALLOWED_THREAD = "100000000000000005";
const DENIED_THREAD = "100000000000000006";
const MESSAGE = "100000000000000007";

const everyonePermissions =
  PermissionFlagsBits.ViewChannel |
  PermissionFlagsBits.SendMessages |
  PermissionFlagsBits.SendMessagesInThreads |
  PermissionFlagsBits.EmbedLinks |
  PermissionFlagsBits.ReadMessageHistory;

const botUser = {
  id: BOT,
  username: "bot",
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot: true,
};

const rawThread = (id: string, parentId: string) => ({
  id,
  type: 11,
  name: `thread-of-${parentId === DENIED ? "denied" : "allowed"}`,
  parent_id: parentId,
  owner_id: BOT,
  member_count: 1,
  message_count: 0,
  thread_metadata: {
    archived: false,
    auto_archive_duration: 60,
    archive_timestamp: new Date(0).toISOString(),
    locked: false,
  },
});

(discord as unknown as { user: unknown }).user = asAdder(discord.users)._add(botUser);
asAdder(discord.guilds)._add({
  id: GUILD,
  name: "test-guild",
  owner_id: "1",
  afk_timeout: 300,
  verification_level: 0,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [
    {
      id: GUILD,
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
  channels: [
    { id: ALLOWED, type: 0, name: "allowed", position: 0, permission_overwrites: [] },
    {
      id: DENIED,
      type: 0,
      name: "denied",
      position: 1,
      permission_overwrites: [
        { id: BOT, type: 1, allow: "0", deny: String(PermissionFlagsBits.EmbedLinks) },
      ],
    },
  ],
  threads: [rawThread(ALLOWED_THREAD, ALLOWED), rawThread(DENIED_THREAD, DENIED)],
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  stickers: [],
  premium_tier: 0,
  preferred_locale: "en-US",
  nsfw_level: 0,
});

afterEach(() => mock.restoreAll());

const EMBED = { title: "title", description: "body" };
const TOOLS: Record<string, (channelId: string) => Record<string, unknown>> = {
  discord_send_embed: (channel_id) => ({ channel_id, ...EMBED }),
  discord_send_multiple_embeds: (channel_id) => ({
    channel_id,
    content: "text above",
    embeds: [EMBED, EMBED],
  }),
  discord_edit_embed: (channel_id) => ({ channel_id, message_id: MESSAGE, ...EMBED }),
};

/** Stubs every request the three tools can make, so a test can count what reached Discord. */
function stubRequests(channelId: string) {
  const channel = discord.channels.cache.get(channelId) as unknown as {
    send: () => Promise<unknown>;
    messages: { fetch: () => Promise<unknown> };
  };
  const edit = mock.fn(async () => ({ id: MESSAGE }));
  const send = mock.method(channel, "send", async () => ({ id: MESSAGE }));
  const fetch = mock.method(channel.messages, "fetch", async () => ({
    id: MESSAGE,
    author: { id: BOT },
    edit,
  }));
  return () => send.mock.callCount() + fetch.mock.callCount() + edit.mock.callCount();
}

const run = (tool: string, channelId: string) =>
  messages.handlers.get(tool)!(TOOLS[tool](channelId));

for (const tool of Object.keys(TOOLS)) {
  test(`${tool} refuses where the bot lacks Embed Links, before any request`, async () => {
    const requests = stubRequests(DENIED);
    await assert.rejects(run(tool, DENIED), (err: Error) => {
      assert.match(
        err.message,
        /lacks the Embed Links permission in #denied \(100000000000000004\)/,
      );
      assert.match(err.message, /The call stopped before reaching Discord/);
      return true;
    });
    assert.equal(requests(), 0, "nothing may be sent, fetched or edited");
  });

  test(`${tool} goes through where the bot has Embed Links`, async () => {
    const requests = stubRequests(ALLOWED);
    const result = await run(tool, ALLOWED);
    assert.ok(!result.isError);
    assert.equal(requests(), tool === "discord_edit_embed" ? 2 : 1);
  });

  test(`${tool} in a thread follows its parent channel's Embed Links`, async () => {
    const deniedRequests = stubRequests(DENIED_THREAD);
    await assert.rejects(run(tool, DENIED_THREAD), /Embed Links permission in #thread-of-denied/);
    assert.equal(deniedRequests(), 0);

    const allowedRequests = stubRequests(ALLOWED_THREAD);
    assert.ok(!(await run(tool, ALLOWED_THREAD)).isError);
    assert.ok(allowedRequests() > 0);
  });
}
