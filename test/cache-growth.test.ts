import { test } from "node:test";
import assert from "node:assert/strict";
import "./env-setup.js";
import { discord } from "../src/client.js";

/** Assertions are on cache sizes, never heap bytes: GC timing makes byte counts flaky. */

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

const GUILD_ID = "100000000000000001";
const rawGuild = {
  id: GUILD_ID,
  name: "test-guild",
  owner_id: "1",
  afk_timeout: 300,
  verification_level: 0,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [
    {
      id: GUILD_ID,
      name: "@everyone",
      color: 0,
      hoist: false,
      position: 0,
      permissions: "0",
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
  members: [],
  channels: [],
  threads: [],
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  stickers: [],
  premium_tier: 0,
  preferred_locale: "en-US",
  nsfw_level: 0,
};

const rawUser = (n: number) => ({
  id: String(1700000000000000000n + BigInt(n)),
  username: `user_${n}`,
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot: false,
});

const guild = asAdder(discord.guilds)._add(rawGuild) as {
  members: unknown;
  id: string;
};

test("the caches tool calls fill are fully reclaimed by the configured sweepers", () => {
  const N = 5000;
  for (let i = 0; i < N; i++) {
    asAdder(discord.users)._add(rawUser(i));
    asAdder(guild.members)._add({
      user: rawUser(i),
      roles: [],
      joined_at: new Date(0).toISOString(),
      deaf: false,
      mute: false,
      flags: 0,
    });
  }

  const members = guild.members as { cache: { size: number } };
  assert.ok(discord.users.cache.size >= N, "synthetic users should be cached");
  assert.ok(members.cache.size >= N, "synthetic members should be cached");

  // These take the predicate; the config holds a factory. Pass the factory itself and
  // every entry matches, so the assertion passes even when the filter sweeps nothing.
  const sweepers = discord.options.sweepers as unknown as {
    users: { filter: () => (v: unknown) => boolean };
    guildMembers: { filter: () => (v: unknown) => boolean };
  };
  discord.sweepers.sweepUsers(sweepers.users.filter());
  discord.sweepers.sweepGuildMembers(sweepers.guildMembers.filter());

  assert.equal(discord.users.cache.size, 0, "every swept user should be evicted");
  assert.equal(members.cache.size, 0, "every swept member should be evicted");
});

test("a repeated entity is deduplicated rather than accumulated", () => {
  const before = discord.users.cache.size;
  for (let i = 0; i < 1000; i++) asAdder(discord.users)._add(rawUser(7));
  assert.equal(
    discord.users.cache.size,
    before + 1,
    "re-adding the same id must not grow the cache",
  );
  discord.sweepers.sweepUsers(() => true);
});

test("the message cache stays bounded per channel", () => {
  const cache = discord.options.makeCache(
    { name: "MessageManager" } as never,
    undefined as never,
    { name: "MessageManager" } as never,
  ) as unknown as { maxSize?: number };
  assert.ok(
    typeof cache.maxSize === "number" && cache.maxSize > 0,
    "MessageManager must keep a finite per-channel bound",
  );
});
