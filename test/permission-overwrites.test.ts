import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DiscordAPIError, PermissionFlagsBits, Routes } from "discord.js";
import { discord } from "../src/client.js";
import { formatToolError } from "../src/errors.js";
import permissions from "../src/tools/permissions.js";

/**
 * Real structures from raw gateway payloads, as in silent-permissions.test.ts, so the
 * overwrite target resolution is discord.js's own. Every REST verb is stubbed.
 */

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

const GUILD = "300000000000000001";
const BOT = "300000000000000002";
const CHANNEL = "300000000000000003";
const MEMBER = "300000000000000004";
const STRANGER = "300000000000000005";
const UNCACHED_ROLE = "300000000000000006";
const UNKNOWN_ROLE = "300000000000000007";

const rawUser = (id: string, bot = false) => ({
  id,
  username: `user-${id}`,
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot,
});

const rawRole = (id: string, name: string, position: number) => ({
  id,
  name,
  color: 0,
  hoist: false,
  position,
  permissions: String(PermissionFlagsBits.ViewChannel | PermissionFlagsBits.ManageRoles),
  managed: false,
  mentionable: false,
  flags: 0,
});

(discord as unknown as { user: unknown }).user = asAdder(discord.users)._add(rawUser(BOT, true));
asAdder(discord.users)._add(rawUser(STRANGER));
asAdder(discord.guilds)._add({
  id: GUILD,
  name: "overwrite-guild",
  owner_id: "1",
  roles: [rawRole(GUILD, "@everyone", 0)],
  emojis: [],
  features: [],
  members: [
    {
      user: rawUser(BOT, true),
      roles: [],
      joined_at: new Date(0).toISOString(),
      deaf: false,
      mute: false,
      flags: 0,
    },
  ],
  channels: [{ id: CHANNEL, type: 0, name: "target", position: 0, permission_overwrites: [] }],
  threads: [],
  guild_scheduled_events: [],
  stickers: [],
});

afterEach(() => mock.restoreAll());

const unknown = (code: number, message: string, method: string, url: string) =>
  new DiscordAPIError({ code, message }, code, 404, method, url, {});

type Put = { route: string; body: { id: string; type: number; allow: string; deny: string } };

/**
 * Stubs every REST verb the handlers can reach. GETs answer from `roles`, or with
 * Unknown Role / Unknown Member, so nothing ever leaves the process.
 */
function stubRest(roles: Record<string, ReturnType<typeof rawRole>> = {}) {
  const puts: Put[] = [];
  mock.method(discord.rest, "get", (async (route: string) => {
    const role = Object.values(roles).find((r) => route === Routes.guildRole(GUILD, r.id));
    if (role) return role;
    if (route.startsWith(`/guilds/${GUILD}/roles/`))
      throw unknown(10011, "Unknown Role", "GET", route);
    throw unknown(10007, "Unknown Member", "GET", route);
  }) as never);
  mock.method(discord.rest, "put", (async (route: string, options: { body: unknown }) => {
    puts.push({ route, body: JSON.parse(JSON.stringify(options.body)) });
    return undefined;
  }) as never);
  mock.method(discord.rest, "post", (async () => {
    throw new Error("unexpected POST");
  }) as never);
  return puts;
}

const setMember = (user_id: string) =>
  permissions.handlers.get("discord_set_member_permission")!({
    channel_id: CHANNEL,
    user_id,
    allow: ["ViewChannel"],
  });

const setRole = (role_id: string) =>
  permissions.handlers.get("discord_set_role_permission")!({
    channel_id: CHANNEL,
    role_id,
    deny: ["SendMessages"],
  });

test("set_member_permission writes a member overwrite for a user swept from the cache", async () => {
  const guild = discord.guilds.cache.get(GUILD)!;
  assert.equal(discord.users.cache.has(MEMBER), false, "the users sweeper cleared this member");
  const fetchMember = mock.method(guild.members, "fetch", async () => ({ id: MEMBER }) as never);
  const puts = stubRest();

  const result = await setMember(MEMBER);
  assert.ok(!result.isError);
  assert.deepEqual(fetchMember.mock.calls[0]?.arguments, [MEMBER]);
  assert.deepEqual(puts, [
    {
      route: Routes.channelPermission(CHANNEL, MEMBER),
      body: { id: MEMBER, type: 1, allow: String(PermissionFlagsBits.ViewChannel), deny: "0" },
    },
  ]);
  assert.equal(discord.users.cache.has(MEMBER), false, "the type came from the call, not a cache");
});

test("set_member_permission refuses a user who is not a member of the channel's server", async () => {
  assert.equal(discord.users.cache.has(STRANGER), true, "a user the bot knows from elsewhere");
  const puts = stubRest();
  await assert.rejects(setMember(STRANGER), (err) => {
    assert.ok(err instanceof DiscordAPIError && err.code === 10007);
    assert.match(formatToolError(err), /Unknown member; the user is not in that server/);
    return true;
  });
  assert.equal(puts.length, 0, "no overwrite may be written for a stranger");
});

test("set_role_permission writes a role overwrite for a role missing from the cache", async () => {
  const puts = stubRest({ [UNCACHED_ROLE]: rawRole(UNCACHED_ROLE, "fresh", 1) });
  const result = await setRole(UNCACHED_ROLE);
  assert.ok(!result.isError);
  assert.deepEqual(puts, [
    {
      route: Routes.channelPermission(CHANNEL, UNCACHED_ROLE),
      body: {
        id: UNCACHED_ROLE,
        type: 0,
        allow: "0",
        deny: String(PermissionFlagsBits.SendMessages),
      },
    },
  ]);
});

test("set_role_permission still targets @everyone by the server's ID", async () => {
  const puts = stubRest();
  assert.ok(!(await setRole(GUILD)).isError);
  assert.deepEqual(
    puts.map((p) => [p.route, p.body.type]),
    [[Routes.channelPermission(CHANNEL, GUILD), 0]],
  );
});

for (const [label, id] of [
  ["an unknown role ID", UNKNOWN_ROLE],
  ["a user's ID", STRANGER],
] as const) {
  test(`set_role_permission refuses ${label} with no overwrite written`, async () => {
    const puts = stubRest();
    await assert.rejects(
      setRole(id),
      new RegExp(`^Error: Role ${id} not found in this server\\.$`),
    );
    assert.equal(puts.length, 0);
  });
}
