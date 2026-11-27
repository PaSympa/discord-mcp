import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Collection, PermissionFlagsBits, PermissionsBitField } from "discord.js";
import {
  discord,
  validateId,
  serializePermissions,
  deserializePermissions,
} from "../src/client.js";
import roles from "../src/tools/roles.js";
import members from "../src/tools/members.js";

afterEach(() => mock.restoreAll());

test("validateId accepts a valid snowflake", () => {
  assert.equal(validateId("123456789012345678", "id"), "123456789012345678");
});

test("validateId rejects non-snowflakes", () => {
  assert.throws(() => validateId("abc", "id"));
  assert.throws(() => validateId("", "id"));
  assert.throws(() => validateId("123", "id"));
  assert.throws(() => validateId(undefined, "id"));
});

test("serialize/deserialize permissions round-trips", () => {
  const names = ["SendMessages", "ViewChannel"];
  const bits = deserializePermissions(names);
  assert.ok(bits instanceof PermissionsBitField);
  const back = serializePermissions(bits);
  for (const n of names) assert.ok(back.includes(n), `${n} missing from round-trip`);
});

const GUILD = "400000000000000001";
const ADMIN_ROLE = "400000000000000002";
const ADMIN = "400000000000000003";
const ALL_FLAGS = Object.keys(PermissionsBitField.Flags);
const adminOnly = () => new PermissionsBitField(PermissionFlagsBits.Administrator);

test("serializePermissions lists every flag for Administrator unless checkAdmin is false", () => {
  assert.deepEqual(serializePermissions(adminOnly()), ALL_FLAGS);
  assert.deepEqual(serializePermissions(adminOnly(), { checkAdmin: false }), ["Administrator"]);
});

test("list_roles lists only the flags set on an Administrator role; get_member_info lists every flag", async () => {
  const role = {
    id: ADMIN_ROLE,
    name: "Admins",
    hexColor: "#000000",
    position: 1,
    permissions: adminOnly(),
    hoist: false,
    mentionable: false,
  };
  const member = {
    id: ADMIN,
    user: { tag: "admin", bot: false, createdAt: new Date(0) },
    nickname: null,
    roles: { cache: new Collection() },
    permissions: adminOnly(),
    joinedAt: null,
    communicationDisabledUntil: null,
  };
  mock.method(discord.guilds, "fetch", (async () => ({
    roles: {
      fetch: async () => new Collection([[ADMIN_ROLE, role]]),
      fetchMemberCounts: async () => new Collection([[ADMIN_ROLE, 1]]),
    },
    members: { fetch: async () => member },
  })) as never);

  const listed = await roles.handlers.get("discord_list_roles")!({ guild_id: GUILD });
  const { roles: rows } = listed.structuredContent as { roles: { permissions: string[] }[] };
  assert.deepEqual(rows[0].permissions, ["Administrator"]);

  const info = await members.handlers.get("discord_get_member_info")!({
    guild_id: GUILD,
    user_id: ADMIN,
  });
  assert.deepEqual((info.structuredContent as { permissions: string[] }).permissions, ALL_FLAGS);
});
