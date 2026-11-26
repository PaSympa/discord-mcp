import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Collection, DiscordAPIError, PermissionFlagsBits, Routes } from "discord.js";
import { discord } from "../src/client.js";
import roles from "../src/tools/roles.js";
import { callWithProgress } from "./progress.js";
import { rateLimited, retryAfterSchema } from "./rate-limit.js";

/**
 * Real structures from raw gateway payloads, so the permission math, the Administrator
 * override and the role positions are discord.js's own.
 */

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

const BOT = "300000000000000001";
const GUILD = "300000000000000010";
const NO_MANAGE_GUILD = "300000000000000020";
const ADMIN_GUILD = "300000000000000030";
const OWNED_GUILD = "300000000000000040";
const HAS_ROLE = "300000000000000101";
const NO_ROLE = "300000000000000102";
const STRANGER = "300000000000000103";
const OTHERS = ["300000000000000104", "300000000000000105", "300000000000000106"];

/** Role IDs are the guild ID plus a fixed suffix, so each guild gets its own. */
const roleId = (guild: string, n: number) => (BigInt(guild) + BigInt(n)).toString();
const BOT_ROLE = 1;
const HELPERS = 2;
const HIGH = 3;
const MANAGED = 4;

const user = (id: string, bot = false) => ({
  id,
  username: `u${id.slice(-3)}`,
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot,
});

const member = (id: string, roleIds: string[], bot = false) => ({
  user: user(id, bot),
  roles: roleIds,
  joined_at: new Date(0).toISOString(),
  deaf: false,
  mute: false,
  flags: 0,
});

const rawRole = (
  id: string,
  name: string,
  position: number,
  permissions: bigint,
  managed = false,
) => ({
  id,
  name,
  color: 0,
  hoist: false,
  position,
  permissions: String(permissions),
  managed,
  mentionable: false,
  flags: 0,
});

function rawGuild(id: string, botPermissions: bigint, ownerId = "1") {
  return {
    id,
    name: `guild-${id}`,
    owner_id: ownerId,
    afk_timeout: 300,
    verification_level: 0,
    default_message_notifications: 0,
    explicit_content_filter: 0,
    roles: [
      rawRole(id, "@everyone", 0, PermissionFlagsBits.ViewChannel),
      rawRole(roleId(id, BOT_ROLE), "Bot", 5, botPermissions),
      rawRole(roleId(id, HELPERS), "Helpers", 2, 0n),
      rawRole(roleId(id, HIGH), "High", 7, 0n),
      rawRole(roleId(id, MANAGED), "Booster", 1, 0n, true),
    ],
    emojis: [],
    features: [],
    mfa_level: 0,
    system_channel_flags: 0,
    joined_at: new Date(0).toISOString(),
    large: false,
    unavailable: false,
    member_count: 6,
    voice_states: [],
    members: [
      member(BOT, [roleId(id, BOT_ROLE)], true),
      member(HAS_ROLE, [roleId(id, HELPERS)]),
      member(NO_ROLE, []),
      ...OTHERS.map((o) => member(o, [])),
    ],
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
}

(discord as unknown as { user: unknown }).user = asAdder(discord.users)._add(user(BOT, true));
asAdder(discord.guilds)._add(rawGuild(GUILD, PermissionFlagsBits.ManageRoles));
asAdder(discord.guilds)._add(rawGuild(NO_MANAGE_GUILD, PermissionFlagsBits.SendMessages));
asAdder(discord.guilds)._add(rawGuild(ADMIN_GUILD, PermissionFlagsBits.Administrator));
asAdder(discord.guilds)._add(rawGuild(OWNED_GUILD, 0n, BOT));

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

type MemberFetch = { user: string | string[]; time?: number };

/** Answers member fetches from the cache, as the gateway would: absent IDs are left out. */
function stubDiscord(guildId: string) {
  const guild = discord.guilds.cache.get(guildId)!;
  const lookups: MemberFetch[] = [];
  mock.method(guild.members, "fetch", async (opts: MemberFetch) => {
    if (!Array.isArray(opts.user)) return guild.members.cache.get(opts.user);
    lookups.push(opts);
    return new Collection(
      opts.user.flatMap((id) => {
        const found = guild.members.cache.get(id);
        return found ? [[id, found] as const] : [];
      }),
    );
  });
  const put = mock.method(discord.rest, "put", async () => undefined);
  const del = mock.method(discord.rest, "delete", async () => undefined);
  const get = mock.method(discord.rest, "get", async () => {
    throw new DiscordAPIError(
      { code: 10011, message: "Unknown Role" },
      10011,
      404,
      "GET",
      "/r",
      {},
    );
  });
  return { lookups, put, del, get, changes: () => put.mock.callCount() + del.mock.callCount() };
}

const call = (
  tool: "discord_bulk_add_role" | "discord_bulk_remove_role",
  args: Record<string, unknown>,
  signal?: AbortSignal,
) => roles.handlers.get(tool)!(args, { signal });

const REFUSALS: [string, string, string, RegExp][] = [
  ["an unknown role", GUILD, "300000000000000999", /Role 300000000000000999 not found/],
  ["@everyone", GUILD, GUILD, /@everyone belongs to every member/],
  ["a managed role", GUILD, roleId(GUILD, MANAGED), /"Booster" is managed by an integration/],
  [
    "a bot without Manage Roles",
    NO_MANAGE_GUILD,
    roleId(NO_MANAGE_GUILD, HELPERS),
    /lacks the Manage Roles permission/,
  ],
  [
    "a role above the bot's highest",
    GUILD,
    roleId(GUILD, HIGH),
    /"High" is not below the bot's highest role "Bot"/,
  ],
  [
    "a role above the bot's highest, for an Administrator bot",
    ADMIN_GUILD,
    roleId(ADMIN_GUILD, HIGH),
    /"High" is not below the bot's highest role "Bot"/,
  ],
  ["the bot's own highest role", GUILD, roleId(GUILD, BOT_ROLE), /"Bot" is not below/],
];

for (const tool of ["discord_bulk_add_role", "discord_bulk_remove_role"] as const) {
  for (const dryRun of [true, false]) {
    for (const [label, guild, role, error] of REFUSALS) {
      test(`${tool} (${dryRun ? "dry run" : "real call"}) refuses ${label} before any member work`, async () => {
        const stub = stubDiscord(guild);
        await assert.rejects(
          call(tool, { guild_id: guild, role_id: role, user_ids: [NO_ROLE], dry_run: dryRun }),
          error,
        );
        assert.equal(stub.lookups.length, 0, "no member is looked up");
        assert.equal(stub.changes(), 0, "no role is changed");
      });
    }
  }
}

test("an Administrator bot passes the Manage Roles check for a role below its own", async () => {
  stubDiscord(ADMIN_GUILD);
  const result = await call("discord_bulk_add_role", {
    guild_id: ADMIN_GUILD,
    role_id: roleId(ADMIN_GUILD, HELPERS),
    user_ids: [NO_ROLE],
  });
  assert.deepEqual(result.structuredContent!.would_change, [NO_ROLE]);
});

test("a bot that owns the server may change a role above its highest one", async () => {
  stubDiscord(OWNED_GUILD);
  const result = await call("discord_bulk_add_role", {
    guild_id: OWNED_GUILD,
    role_id: roleId(OWNED_GUILD, HIGH),
    user_ids: [NO_ROLE],
  });
  assert.deepEqual(result.structuredContent!.would_change, [NO_ROLE]);
});

const users = [HAS_ROLE, NO_ROLE, STRANGER];

test("a dry run sorts the users, sends nothing, and bounds the member lookup", async () => {
  const stub = stubDiscord(GUILD);
  const args = { guild_id: GUILD, role_id: roleId(GUILD, HELPERS), user_ids: users };
  const add = await call("discord_bulk_add_role", args);
  assert.deepEqual(add.structuredContent, {
    dry_run: true,
    would_change: [NO_ROLE],
    skipped: [HAS_ROLE],
    not_member: [STRANGER],
  });
  const remove = await call("discord_bulk_remove_role", args);
  assert.deepEqual(remove.structuredContent, {
    dry_run: true,
    would_change: [HAS_ROLE],
    skipped: [NO_ROLE],
    not_member: [STRANGER],
  });
  assert.equal(stub.changes(), 0);
  assert.deepEqual(stub.lookups[0].user, users, "one lookup by ID for every user");
  assert.ok(stub.lookups[0].time! <= 15_000, "the gateway wait is bounded below the 120 s default");
});

test("a real add sends one PUT per member who needs it, with the reason and a signal", async () => {
  const stub = stubDiscord(GUILD);
  const role = roleId(GUILD, HELPERS);
  const result = await call(
    "discord_bulk_add_role",
    { guild_id: GUILD, role_id: role, user_ids: users, dry_run: false, reason: "event helpers" },
    new AbortController().signal,
  );
  assert.equal(stub.put.mock.callCount(), 1);
  assert.equal(stub.del.mock.callCount(), 0);
  const [route, options] = stub.put.mock.calls[0].arguments as [
    string,
    { reason: string; signal: AbortSignal },
  ];
  assert.equal(route, Routes.guildMemberRole(GUILD, NO_ROLE, role));
  assert.equal(options.reason, "event helpers");
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(result.structuredContent, {
    dry_run: false,
    done: [NO_ROLE],
    skipped: [HAS_ROLE],
    not_member: [STRANGER],
    failed: [],
    remaining: [],
  });
});

test("a real remove sends one DELETE per member who has the role", async () => {
  const stub = stubDiscord(GUILD);
  const role = roleId(GUILD, HELPERS);
  const result = await call("discord_bulk_remove_role", {
    guild_id: GUILD,
    role_id: role,
    user_ids: users,
    dry_run: false,
  });
  assert.equal(stub.put.mock.callCount(), 0);
  assert.deepEqual(
    stub.del.mock.calls.map((c) => c.arguments[0]),
    [Routes.guildMemberRole(GUILD, HAS_ROLE, role)],
  );
  assert.deepEqual(result.structuredContent!.done, [HAS_ROLE]);
});

test("a real call past the time budget returns the members it did not reach", async () => {
  const stub = stubDiscord(GUILD);
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  stub.put.mock.mockImplementation(async () => void mock.timers.tick(15_000));
  const result = await call("discord_bulk_add_role", {
    guild_id: GUILD,
    role_id: roleId(GUILD, HELPERS),
    user_ids: [NO_ROLE, ...OTHERS],
    dry_run: false,
  });
  assert.equal(stub.put.mock.callCount(), 3);
  const content = result.structuredContent!;
  assert.deepEqual(content.done, [NO_ROLE, OTHERS[0], OTHERS[1]]);
  assert.deepEqual(content.remaining, [OTHERS[2]]);
  assert.equal((content.stopped as { reason: string }).reason, "time_budget");
});

for (const [tool, method, users, member] of [
  ["discord_bulk_add_role", "put", [NO_ROLE, ...OTHERS], NO_ROLE],
  ["discord_bulk_remove_role", "del", [HAS_ROLE], undefined],
] as const) {
  test(`${tool} returns how long Discord asked to wait when a rate limit stops it`, async () => {
    const stub = stubDiscord(GUILD);
    stub[method].mock.mockImplementation(async (route: string) => {
      if (!member || !route.includes(member)) throw rateLimited(5_200);
    });
    const result = await call(tool, {
      guild_id: GUILD,
      role_id: roleId(GUILD, HELPERS),
      user_ids: users,
      dry_run: false,
    });
    assert.equal(result.isError, undefined, "the output matches its schema");
    const content = result.structuredContent!;
    assert.deepEqual(content.done, member ? [member] : []);
    assert.deepEqual(
      content.remaining,
      users.filter((id) => id !== member),
    );
    assert.deepEqual(content.stopped, {
      reason: "time_budget",
      message:
        "Discord asked to wait 6 s before the next request, past this call's time budget. Wait about 6 s, then call again with remaining.",
      retry_after_seconds: 6,
    });
    const advertised = retryAfterSchema(
      roles.definitions.find((d) => d.name === tool)!.outputSchema,
    );
    assert.equal(advertised.type, "integer");
    assert.match(advertised.description, /Wait that long/);
  });
}

test("a member who left before the change fails alone; the others go through", async () => {
  const stub = stubDiscord(GUILD);
  stub.put.mock.mockImplementation(async (route: string) => {
    if (route.includes(OTHERS[0]))
      throw new DiscordAPIError(
        { code: 10007, message: "Unknown Member" },
        10007,
        404,
        "PUT",
        route,
        {},
      );
  });
  const result = await call("discord_bulk_add_role", {
    guild_id: GUILD,
    role_id: roleId(GUILD, HELPERS),
    user_ids: [OTHERS[0], OTHERS[1]],
    dry_run: false,
  });
  assert.deepEqual(result.structuredContent!.done, [OTHERS[1]]);
  assert.deepEqual(result.structuredContent!.failed, [
    { user_id: OTHERS[0], code: 10007, message: "Unknown Member" },
  ]);
});

test("both tools share one input schema: 1 to 50 distinct users, dry run by default", async () => {
  const schemas = ["discord_bulk_add_role", "discord_bulk_remove_role"].map(
    (name) => roles.definitions.find((d) => d.name === name)!.inputSchema,
  );
  assert.deepEqual(schemas[0], schemas[1]);
  const { properties, required } = schemas[0] as {
    properties: Record<string, Record<string, unknown>>;
    required: string[];
  };
  assert.equal(properties.user_ids.maxItems, 50);
  assert.equal(properties.user_ids.minItems, 1);
  assert.equal(properties.user_ids.uniqueItems, true);
  assert.equal(properties.dry_run.default, true);
  assert.ok(!required.includes("dry_run"));
  stubDiscord(GUILD);
  const base = { guild_id: GUILD, role_id: roleId(GUILD, HELPERS) };
  await assert.rejects(
    call("discord_bulk_add_role", { ...base, user_ids: [NO_ROLE, NO_ROLE] }),
    /must not repeat/,
  );
  await assert.rejects(
    call("discord_bulk_add_role", {
      ...base,
      user_ids: Array.from({ length: 51 }, (_, i) => (BigInt(NO_ROLE) + BigInt(i)).toString()),
    }),
    /user_ids/,
  );
});

test("the bulk role tools carry the annotations of discord_add_role and discord_remove_role", () => {
  const annotations = (name: string) => ({
    ...roles.definitions.find((d) => d.name === name)!.annotations,
    title: undefined,
  });
  assert.deepEqual(annotations("discord_bulk_add_role"), annotations("discord_add_role"));
  assert.deepEqual(annotations("discord_bulk_remove_role"), annotations("discord_remove_role"));
});

test("a real call reports progress after each member it changes or Discord refuses", async () => {
  const stub = stubDiscord(GUILD);
  stub.put.mock.mockImplementation(async (route: string) => {
    if (route.includes(OTHERS[1]))
      throw new DiscordAPIError(
        { code: 10007, message: "Unknown Member" },
        10007,
        404,
        "PUT",
        route,
        {},
      );
  });
  const args = {
    guild_id: GUILD,
    role_id: roleId(GUILD, HELPERS),
    user_ids: [HAS_ROLE, STRANGER, NO_ROLE, ...OTHERS],
    dry_run: false,
  };
  const withToken = await callWithProgress("discord_bulk_add_role", args);
  assert.deepEqual(withToken.progress, [
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
  ]);
  const without = await callWithProgress("discord_bulk_add_role", args, { token: false });
  assert.deepEqual(without.progress, []);
  assert.deepEqual(withToken.result, without.result);
  assert.deepEqual((withToken.result.structuredContent as { failed: unknown[] }).failed, [
    { user_id: OTHERS[1], code: 10007, message: "Unknown Member" },
  ]);
});

test("a remove reports progress out of the members who hold the role", async () => {
  stubDiscord(GUILD);
  const args = {
    guild_id: GUILD,
    role_id: roleId(GUILD, HELPERS),
    user_ids: [HAS_ROLE, NO_ROLE, STRANGER],
    dry_run: false,
  };
  const withToken = await callWithProgress("discord_bulk_remove_role", args);
  assert.deepEqual(withToken.progress, [[1, 1]]);
  const without = await callWithProgress("discord_bulk_remove_role", args, { token: false });
  assert.deepEqual(without.progress, []);
  assert.deepEqual(withToken.result, without.result);
});

test("a stopped call reports no progress for the member the stop hit, and a dry run none", async () => {
  const stub = stubDiscord(GUILD);
  stub.put.mock.mockImplementation(async (route: string) => {
    if (!route.includes(NO_ROLE)) throw rateLimited(5_200);
  });
  const args = {
    guild_id: GUILD,
    role_id: roleId(GUILD, HELPERS),
    user_ids: [NO_ROLE, ...OTHERS],
  };
  const stopped = await callWithProgress("discord_bulk_add_role", { ...args, dry_run: false });
  assert.deepEqual(stopped.progress, [[1, 4]]);
  assert.deepEqual((stopped.result.structuredContent as { remaining: string[] }).remaining, OTHERS);
  const dryRun = await callWithProgress("discord_bulk_add_role", args);
  assert.deepEqual(dryRun.progress, []);
});

test("a progress notification the transport fails to send changes nothing in the call", async () => {
  stubDiscord(GUILD);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const args = {
      guild_id: GUILD,
      role_id: roleId(GUILD, HELPERS),
      user_ids: [NO_ROLE, ...OTHERS],
      dry_run: false,
    };
    const failing = await callWithProgress("discord_bulk_add_role", args, {
      failNotifications: true,
    });
    assert.equal(failing.progress.length, 4, "every send was attempted");
    const without = await callWithProgress("discord_bulk_add_role", args, { token: false });
    assert.deepEqual(failing.result, without.result);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
