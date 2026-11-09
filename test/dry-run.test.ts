import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";
import channels from "../src/tools/channels.js";
import members from "../src/tools/members.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const USER = "222222222222222222";

afterEach(() => mock.restoreAll());

function textOf(res: { content: { text?: string }[] }): string {
  return res.content[0]?.text ?? "";
}

test("delete_channel: default previews and never deletes; dry_run:false deletes with the reason", async () => {
  const deletions: unknown[] = [];
  const fakeChannel = {
    name: "victim",
    guildId: GUILD,
    delete: async (reason: unknown) => void deletions.push(reason),
  };
  mock.method(discord.channels, "fetch", async () => fakeChannel as never);
  const handler = channels.handlers.get("discord_delete_channel")!;

  const preview = await handler({ channel_id: CHANNEL });
  assert.match(textOf(preview), /Dry run/);
  assert.equal(deletions.length, 0, "dry run must not delete");

  await handler({ channel_id: CHANNEL, dry_run: false, reason: "cleanup" });
  assert.deepEqual(deletions, ["cleanup"]);
});

test("bulk_delete_messages: default previews via fetch; dry_run:false calls bulkDelete once", async () => {
  const bulkCalls: unknown[][] = [];
  const fakeChannel = {
    name: "chan",
    guildId: GUILD,
    isDMBased: () => false,
    isTextBased: () => true,
    messages: { fetch: async () => ({ filter: () => ({ size: 1 }), size: 3 }) },
    bulkDelete: async (...args: unknown[]) => {
      bulkCalls.push(args);
      return { size: 3 };
    },
  };
  mock.method(discord.channels, "fetch", async () => fakeChannel as never);
  const handler = messages.handlers.get("discord_bulk_delete_messages")!;

  const preview = await handler({ channel_id: CHANNEL, count: 3 });
  assert.match(textOf(preview), /Dry run/);
  assert.equal(bulkCalls.length, 0, "dry run must not bulk-delete");

  await handler({ channel_id: CHANNEL, count: 3, dry_run: false });
  assert.equal(bulkCalls.length, 1);
});

test("bulk_ban: default previews the exact IDs; dry_run:false calls bulkBan with the reason", async () => {
  const banCalls: unknown[][] = [];
  const fakeGuild = {
    members: {
      bulkBan: async (...args: unknown[]) => {
        banCalls.push(args);
        return { bannedUsers: [USER], failedUsers: [] };
      },
    },
  };
  mock.method(discord.guilds, "fetch", async () => fakeGuild as never);
  const handler = members.handlers.get("discord_bulk_ban")!;

  const preview = await handler({ guild_id: GUILD, user_ids: [USER] });
  assert.deepEqual(preview.structuredContent, { dry_run: true, would_ban: [USER] });
  assert.equal(banCalls.length, 0, "dry run must not ban");

  await handler({ guild_id: GUILD, user_ids: [USER], dry_run: false, reason: "raid" });
  assert.equal(banCalls.length, 1);
  assert.deepEqual(banCalls[0][0], [USER]);
  assert.match(JSON.stringify(banCalls[0][1]), /raid/);
});

test("bulk_ban returns the banned and failed IDs, not just their counts", async () => {
  const OTHER = "333333333333333333";
  const fakeGuild = {
    members: { bulkBan: async () => ({ bannedUsers: [USER], failedUsers: [OTHER] }) },
  };
  mock.method(discord.guilds, "fetch", async () => fakeGuild as never);
  const result = await members.handlers.get("discord_bulk_ban")!({
    guild_id: GUILD,
    user_ids: [USER, OTHER],
    dry_run: false,
  });
  assert.equal(result.isError, undefined);
  assert.deepEqual(result.structuredContent, { dry_run: false, banned: [USER], failed: [OTHER] });
  assert.match(textOf(result), new RegExp(OTHER), "the text block carries the failed IDs too");
});

test("prune_members: dry_run flips Discord's native dry flag", async () => {
  const pruneCalls: { dry?: boolean }[] = [];
  const fakeGuild = {
    members: {
      prune: async (opts: { dry?: boolean }) => {
        pruneCalls.push(opts);
        return 4;
      },
    },
  };
  mock.method(discord.guilds, "fetch", async () => fakeGuild as never);
  const handler = members.handlers.get("discord_prune_members")!;

  await handler({ guild_id: GUILD, days: 30 });
  await handler({ guild_id: GUILD, days: 30, dry_run: false });
  assert.equal(pruneCalls[0].dry, true);
  assert.equal(pruneCalls[1].dry, false);
});

test("ban and kick propagate the audit-log reason to the terminal discord.js call", async () => {
  const bans: unknown[][] = [];
  const kicks: unknown[] = [];
  const fakeMember = { user: { tag: "u#0" }, kick: async (r: unknown) => void kicks.push(r) };
  const fakeGuild = {
    members: {
      ban: async (...args: unknown[]) => void bans.push(args),
      fetch: async () => fakeMember,
    },
  };
  mock.method(discord.guilds, "fetch", async () => fakeGuild as never);

  await members.handlers.get("discord_ban_member")!({
    guild_id: GUILD,
    user_id: USER,
    reason: "ban reason",
  });
  assert.match(JSON.stringify(bans[0][1]), /ban reason/);

  await members.handlers.get("discord_kick_member")!({
    guild_id: GUILD,
    user_id: USER,
    reason: "kick reason",
  });
  assert.deepEqual(kicks, ["kick reason"]);
});
