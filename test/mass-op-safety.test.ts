import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";
import channels from "../src/tools/channels.js";
import members from "../src/tools/members.js";

const GUILD = "111111111111111111";
const USER = "222222222222222222";

afterEach(() => mock.restoreAll());

function def(mod: { definitions: { name: string }[] }, name: string) {
  const d = mod.definitions.find((t) => t.name === name) as unknown as {
    inputSchema: { properties: Record<string, Record<string, unknown>>; required?: string[] };
  };
  assert.ok(d, `${name} not found`);
  return d;
}

test("destructive mass-op tools advertise dry_run default:true and keep it optional", () => {
  for (const [mod, name] of [
    [messages, "discord_bulk_delete_messages"],
    [channels, "discord_delete_channel"],
    [members, "discord_bulk_ban"],
    [members, "discord_prune_members"],
  ] as const) {
    const d = def(mod, name);
    assert.equal(d.inputSchema.properties.dry_run.default, true, `${name} dry_run default`);
    assert.ok(!d.inputSchema.required?.includes("dry_run"), `${name} dry_run must stay optional`);
  }
});

test("bulk_ban advertises and enforces the 200-ID Discord cap", async () => {
  const d = def(members, "discord_bulk_ban");
  const userIds = d.inputSchema.properties.user_ids;
  assert.equal(userIds.maxItems, 200);
  assert.equal(userIds.minItems, 1);
  await assert.rejects(
    () =>
      members.handlers.get("discord_bulk_ban")!({
        guild_id: GUILD,
        user_ids: Array.from({ length: 201 }, () => USER),
      }),
    /200/,
  );
});

test("set_nickname requires the nickname field: omission no longer silently clears", async () => {
  const d = def(members, "discord_set_nickname");
  assert.ok(d.inputSchema.required?.includes("nickname"));
  await assert.rejects(
    () => members.handlers.get("discord_set_nickname")!({ guild_id: GUILD, user_id: USER }),
    /nickname/,
  );
});

test("set_nickname treats null and the string 'null' as an explicit clear", async () => {
  const calls: unknown[] = [];
  const fakeMember = {
    user: { tag: "user#0" },
    setNickname: async (nick: unknown) => void calls.push(nick),
  };
  mock.method(
    discord.guilds,
    "fetch",
    async () => ({ members: { fetch: async () => fakeMember } }) as never,
  );
  const handler = members.handlers.get("discord_set_nickname")!;
  await handler({ guild_id: GUILD, user_id: USER, nickname: null });
  await handler({ guild_id: GUILD, user_id: USER, nickname: "null" });
  assert.deepEqual(calls, [null, null]);
});
