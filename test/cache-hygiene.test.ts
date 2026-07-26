import { test } from "node:test";
import assert from "node:assert/strict";
import { GatewayIntentBits } from "discord.js";

import "./env-setup.js";
import { discord, ensureConnected } from "../src/client.js";

const PROTECTED_MANAGERS = [
  "GuildManager",
  "ChannelManager",
  "GuildChannelManager",
  "RoleManager",
  "PermissionOverwriteManager",
];

const intentBits = () => {
  const intents = discord.options.intents as unknown as { bitfield?: bigint };
  return BigInt(intents.bitfield ?? (discord.options.intents as unknown as bigint));
};

const hasIntent = (bit: number) => (intentBits() & BigInt(bit)) !== 0n;

test("GuildMessages is not requested — nothing consumes MessageCreate and it caches every author", () => {
  assert.equal(hasIntent(GatewayIntentBits.GuildMessages), false);
});

test("Guilds stays requested — the guild/channel/role caches every tool reads depend on it", () => {
  assert.equal(hasIntent(GatewayIntentBits.Guilds), true);
});

test("protected managers keep an unlimited Collection", () => {
  for (const name of PROTECTED_MANAGERS) {
    const cache = discord.options.makeCache(
      { name } as never,
      undefined as never,
      { name } as never,
    );
    assert.equal(
      cache.constructor.name,
      "Collection",
      `${name} must stay a plain Collection: bounding it emits UnsupportedCacheOverwriteWarning and truncates tool output`,
    );
  }
});

test("ReactionManager stays unlimited — findReaction resolves emoji through its cache", () => {
  const cache = discord.options.makeCache(
    { name: "ReactionManager" } as never,
    undefined as never,
    { name: "ReactionManager" } as never,
  );
  assert.equal(cache.constructor.name, "Collection");
});

test("the unbounded caches this server fills are swept, often enough to matter", () => {
  const sweepers = discord.options.sweepers as Record<
    string,
    { interval?: number; lifetime?: number } | undefined
  >;
  // Upper bounds, not just "> 0": discord.js ships a default threads sweeper, so a bare
  // presence check stays green when this whole config is deleted.
  const required = {
    users: { maxInterval: 900 },
    guildMembers: { maxInterval: 1800 },
    messages: { maxInterval: 600, maxLifetime: 1800 },
    threads: { maxInterval: 900, maxLifetime: 7200 },
    invites: { maxInterval: 1800 },
  } as const;

  for (const [key, bound] of Object.entries(required)) {
    const cfg = sweepers[key];
    assert.ok(cfg, `no ${key} sweeper configured`);
    assert.ok(
      typeof cfg.interval === "number" && cfg.interval > 0 && cfg.interval <= bound.maxInterval,
      `${key} sweeper interval must be in (0, ${bound.maxInterval}]s, got ${cfg.interval}`,
    );
    if ("maxLifetime" in bound) {
      assert.ok(
        typeof cfg.lifetime === "number" && cfg.lifetime > 0 && cfg.lifetime <= bound.maxLifetime,
        `${key} sweeper lifetime must be in (0, ${bound.maxLifetime}]s, got ${cfg.lifetime}`,
      );
    }
  }
});

test("the user and member sweep filters spare the bot's own entry", () => {
  const sweepers = discord.options.sweepers as unknown as {
    users: { filter: () => (u: { id: string; client: { user: { id: string } } }) => boolean };
    guildMembers: {
      filter: () => (m: { id: string; client: { user: { id: string } } }) => boolean;
    };
  };
  const self = { id: "42", client: { user: { id: "42" } } };
  const other = { id: "99", client: { user: { id: "42" } } };

  assert.equal(sweepers.users.filter()(self), false);
  assert.equal(sweepers.users.filter()(other), true);
  assert.equal(sweepers.guildMembers.filter()(self), false);
  assert.equal(sweepers.guildMembers.filter()(other), true);
});

test("every sweep filter actually evicts something", () => {
  // null makes discord.js skip the sweep; false never evicts. Both look armed.
  const sweepers = discord.options.sweepers as unknown as Record<
    string,
    { filter?: () => ((v: unknown) => boolean) | null } | undefined
  >;
  for (const key of ["users", "guildMembers", "invites"]) {
    const predicate = sweepers[key]?.filter?.();
    assert.equal(typeof predicate, "function", `${key} filter must return a predicate, not null`);
  }
  assert.equal(
    sweepers.invites!.filter!()!({ id: "1" }),
    true,
    "the invites sweeper must evict cached invites",
  );
});

test("a failed login leaves no ClientReady listener behind", async () => {
  const original = discord.login.bind(discord);
  discord.login = async () => {
    throw new Error("An invalid token was provided.");
  };
  try {
    for (let i = 0; i < 15; i++) await ensureConnected().catch(() => {});
    assert.equal(
      discord.listenerCount("clientReady"),
      0,
      "each failed login must remove the listener it registered",
    );
  } finally {
    discord.login = original;
  }
});

test("concurrent callers share one login attempt", async () => {
  const original = discord.login.bind(discord);
  let calls = 0;
  discord.login = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    throw new Error("An invalid token was provided.");
  };
  try {
    await Promise.all([
      ensureConnected().catch(() => {}),
      ensureConnected().catch(() => {}),
      ensureConnected().catch(() => {}),
    ]);
    assert.equal(calls, 1, "a second login respawns the shard and replays every guild");
    assert.equal(discord.listenerCount("clientReady"), 0);
  } finally {
    discord.login = original;
  }
});
