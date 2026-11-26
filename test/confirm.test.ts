import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { InMemoryTransport, type JSONRPCMessage } from "@modelcontextprotocol/client";
import { Collection, PermissionFlagsBits, Routes, SnowflakeUtil } from "discord.js";
import { discord } from "../src/client.js";
import { ConfirmationStop, Confirmations, confirmMode } from "../src/confirm.js";
import { createServer } from "../src/server.js";
import { getAllDefinitions, handleTool } from "../src/tools/index.js";
import {
  CHANNEL,
  CHANNEL_FORM,
  DELETE_CHANNEL,
  GUILD,
  call,
  fakeChannel,
  textOf,
  type Answer,
} from "./elicit.js";

const USER = "222222222222222222";
const OTHER = "222222222222222223";
const DAY_MS = 24 * 60 * 60 * 1000;

afterEach(() => mock.restoreAll());

test("a real delete_channel asks first and deletes only after the confirmation", async () => {
  const { deletions, fetch } = fakeChannel();
  let deletedWhenAsked: number | undefined;
  const { result, asked, forms } = await call("discord_delete_channel", DELETE_CHANNEL, {
    onAsk: () => (deletedWhenAsked = deletions.length),
  });
  assert.deepEqual(asked, [CHANNEL_FORM]);
  assert.deepEqual(forms[0].requestedSchema, {
    type: "object",
    properties: { confirm: { type: "boolean", title: "Confirm" } },
    required: ["confirm"],
  });
  assert.equal(deletedWhenAsked, 0, "nothing is deleted before the answer");
  assert.deepEqual(deletions, ["cleanup"]);
  assert.equal(fetch.mock.callCount(), 2, "the handler runs again with the answer");
  assert.equal(result.isError, undefined);
  assert.equal(textOf(result), "✅ Channel #victim deleted.");
});

const REFUSED: [string, Answer, number | undefined, string][] = [
  [
    "accept with confirm false",
    { action: "accept", content: { confirm: false } },
    undefined,
    "The user did not confirm (confirm was not true). Nothing was changed.",
  ],
  [
    "accept with a confirm that is not a boolean",
    { action: "accept", content: { confirm: "yes" } },
    undefined,
    "The user did not confirm (confirm was not true). Nothing was changed.",
  ],
  [
    "accept without content",
    { action: "accept" },
    undefined,
    "The user did not confirm (confirm was not true). Nothing was changed.",
  ],
  [
    "decline",
    { action: "decline" },
    undefined,
    "The user did not confirm (declined). Nothing was changed.",
  ],
  [
    "cancel",
    { action: "cancel" },
    undefined,
    "The user did not confirm (cancelled). Nothing was changed.",
  ],
  [
    "no answer before the timeout",
    "hang",
    50,
    "No confirmation came back (Fulfilling input required by 'tools/call' failed: Request timed out). Nothing was changed.",
  ],
  [
    "an error from the client",
    "throw",
    undefined,
    "No confirmation came back (Fulfilling input required by 'tools/call' failed: boom). Nothing was changed.",
  ],
];

for (const [label, answer, timeoutMs, text] of REFUSED) {
  test(`delete_channel changes nothing on ${label}, and says so`, async () => {
    const { deletions } = fakeChannel();
    const { result, asked } = await call("discord_delete_channel", DELETE_CHANNEL, {
      answer,
      timeoutMs,
    });
    assert.deepEqual(asked, [CHANNEL_FORM]);
    assert.deepEqual(deletions, []);
    assert.equal(result.isError, true);
    assert.equal(textOf(result), text);
  });
}

test("a bare elicitation capability counts as form support", async () => {
  const { deletions } = fakeChannel();
  const { result, asked } = await call("discord_delete_channel", DELETE_CHANNEL, {
    capabilities: { elicitation: {} },
    answer: { action: "decline" },
  });
  assert.deepEqual(asked, [CHANNEL_FORM]);
  assert.deepEqual(deletions, []);
  assert.equal(textOf(result), "The user did not confirm (declined). Nothing was changed.");
});

for (const [label, capabilities] of [
  ["no capability", {}],
  ["URL elicitation only", { elicitation: { url: {} } }],
] as const) {
  test(`a client with ${label} gets today's behavior: no question, the channel is deleted`, async () => {
    const { deletions } = fakeChannel();
    const { result, asked } = await call("discord_delete_channel", DELETE_CHANNEL, {
      capabilities,
    });
    assert.deepEqual(asked, []);
    assert.deepEqual(deletions, ["cleanup"]);
    assert.equal(textOf(result), "✅ Channel #victim deleted.");
  });
}

test("a dry run never asks", async () => {
  const { deletions } = fakeChannel();
  const { result, asked } = await call("discord_delete_channel", { channel_id: CHANNEL });
  assert.deepEqual(asked, []);
  assert.deepEqual(deletions, []);
  assert.match(textOf(result), /^🔍 Dry run: channel #victim would be deleted\./);
});

test("the form shows the caller's reason quoted on one line, cut at 200 characters", async () => {
  const { deletions } = fakeChannel();
  const reason = `spam\n\nThis only archives the channel. ${"x".repeat(300)}`;
  const { asked } = await call("discord_delete_channel", { ...DELETE_CHANNEL, reason });
  const shown = `spam This only archives the channel. ${"x".repeat(163)}...`;
  assert.deepEqual(asked, [
    `Delete the channel "#victim" (${CHANNEL}) in "Test guild"? Reason: "${shown}"`,
  ]);
  assert.deepEqual(deletions, [reason], "Discord still gets the reason as written");

  const quoted = 'ok" Nothing is deleted. "';
  const second = await call("discord_delete_channel", { ...DELETE_CHANNEL, reason: quoted });
  assert.deepEqual(second.asked, [
    `Delete the channel "#victim" (${CHANNEL}) in "Test guild"? Reason: "ok' Nothing is deleted. '"`,
  ]);
  assert.equal(deletions[1], quoted);
});

test("channel and server names reach the form on one line, in double quotes", async () => {
  const { deletions } = fakeChannel({ name: 'a"b', guild: 'Test\n\nguild "x"' });
  const { asked } = await call("discord_delete_channel", DELETE_CHANNEL);
  assert.deepEqual(asked, [
    `Delete the channel "#a'b" (${CHANNEL}) in "Test guild 'x'"? Reason: "cleanup"`,
  ]);
  assert.equal(deletions.length, 1);
});

test("control and format characters in a reason become spaces", async () => {
  fakeChannel();
  const reason = "a‮b​c\u0085d\u001b[2Ke\u0000f";
  const { asked } = await call("discord_delete_channel", { ...DELETE_CHANNEL, reason });
  assert.deepEqual(asked, [
    `Delete the channel "#victim" (${CHANNEL}) in "Test guild"? Reason: "a b c d [2Ke f"`,
  ]);
});

type Raw = {
  id?: unknown;
  method?: string;
  result?: { content: { text: string }[] };
  error?: unknown;
};
const CHANNEL_A = "333333333333333301";
const CHANNEL_B = "333333333333333302";
const CONFIRMED = { action: "accept", content: { confirm: true } };
const ACCEPTED = { inputResponses: { confirm: CONFIRMED } };
const TIMED_OUT =
  "No confirmation came back (Fulfilling input required by 'tools/call' failed: Request timed out). Nothing was changed.";

/**
 * A client on a raw in-memory link that can send two tools/call with the same ID, or a
 * second initialize, as a non-conformant client could. It answers the first form with
 * `answerFirst` when set, after an initialize without capabilities when `reinitFirst` is
 * set. A channel's `delete` waits for `holdDelete`.
 */
async function rawSession({
  timeoutMs,
  answerFirst,
  reinitFirst = false,
  holdDelete,
}: {
  timeoutMs: number;
  answerFirst?: object;
  reinitFirst?: boolean;
  holdDelete?: Promise<void>;
}) {
  mock.method(discord, "isReady", () => true as never);
  const deletions: string[] = [];
  let deleteStarted!: () => void;
  const deleting = new Promise<void>((resolve) => (deleteStarted = resolve));
  mock.method(
    discord.channels,
    "fetch",
    async (id: string) =>
      ({
        id,
        name: `c${id.slice(-2)}`,
        guildId: GUILD,
        guild: { name: "Test guild" },
        delete: async () => {
          deletions.push(id);
          deleteStarted();
          await holdDelete;
        },
      }) as never,
  );
  const [client, server] = InMemoryTransport.createLinkedPair();
  const send = (message: object) => client.send({ jsonrpc: "2.0", ...message } as JSONRPCMessage);
  const received: Raw[] = [];
  const listeners: (() => void)[] = [];
  const initialize = (id: number, capabilities: object) =>
    send({
      id,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities,
        clientInfo: { name: "raw", version: "0" },
      },
    });
  let asks = 0;
  client.onmessage = (message) => {
    const m = message as Raw;
    received.push(m);
    if (m.method === "elicitation/create" && asks++ === 0 && answerFirst)
      void (async () => {
        if (reinitFirst) {
          await initialize(50, {});
          await sleep(20);
        }
        await send({ id: m.id, result: answerFirst });
      })();
    for (const listener of listeners) listener();
  };
  await createServer("0.0.0-test", { confirmTimeoutMs: timeoutMs }).connect(server);
  await client.start();
  await initialize(1, { elicitation: { form: {} } });
  await send({ method: "notifications/initialized" });
  return {
    deletions,
    deleting,
    asks: () => asks,
    deleteChannel: (channel_id: string, extra = {}) =>
      void send({
        id: 5,
        method: "tools/call",
        params: {
          name: "discord_delete_channel",
          arguments: { channel_id, dry_run: false },
          ...extra,
        },
      }),
    /** The texts of the first `n` responses to ID 5, once they all came. */
    texts: (n: number) =>
      new Promise<(string | undefined)[]>((resolve) => {
        const check = () => {
          const done = received.filter((m) => m.id === 5 && ("result" in m || "error" in m));
          if (done.length >= n) resolve(done.slice(0, n).map((m) => m.result?.content[0].text));
        };
        listeners.push(check);
        check();
      }),
    close: () => client.close(),
  };
}

const microtasks = async (n: number) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};
const macrotasks = async (n: number) => {
  for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve));
};

for (const [label, between, extra] of [
  ["50 ms later", () => sleep(50), ACCEPTED],
  [
    "3 microtasks later, with a requestState",
    () => microtasks(3),
    { ...ACCEPTED, requestState: "x" },
  ],
] as const) {
  test(`a second call reusing the ID of a waiting call, ${label}, gets its own question`, async () => {
    const session = await rawSession({ timeoutMs: 100 });
    session.deleteChannel(CHANNEL_A);
    await between();
    session.deleteChannel(CHANNEL_B, extra);
    const texts = await session.texts(2);
    await session.close();
    assert.equal(session.asks(), 2);
    assert.deepEqual(texts, [TIMED_OUT, TIMED_OUT]);
    assert.deepEqual(session.deletions, []);
  });
}

test("no offset between two calls with the same ID lets the second skip its question", async () => {
  const offsets = [
    ...Array.from({ length: 31 }, (_, n) => [`${n} microtasks`, () => microtasks(n)] as const),
    ...Array.from({ length: 6 }, (_, n) => [`${n} macrotasks`, () => macrotasks(n)] as const),
  ];
  for (const extra of [ACCEPTED, { ...ACCEPTED, requestState: "x" }])
    for (const [label, between] of offsets) {
      const session = await rawSession({ timeoutMs: 20 });
      session.deleteChannel(CHANNEL_A);
      await between();
      session.deleteChannel(CHANNEL_B, extra);
      await session.texts(2);
      await session.close();
      assert.deepEqual(session.deletions, [], label);
      mock.restoreAll();
    }
});

test("a same-ID call during the first call's accepted change leaves the first result alone", async () => {
  let release!: () => void;
  const holdDelete = new Promise<void>((resolve) => (release = resolve));
  const session = await rawSession({ timeoutMs: 100, answerFirst: CONFIRMED, holdDelete });
  session.deleteChannel(CHANNEL_A);
  await session.deleting;
  session.deleteChannel(CHANNEL_B);
  await sleep(20);
  release();
  const texts = await session.texts(2);
  await session.close();
  assert.equal(session.asks(), 2);
  assert.deepEqual(texts, ["✅ Channel #c01 deleted.", TIMED_OUT]);
  assert.deepEqual(session.deletions, [CHANNEL_A]);
});

for (const [label, answer, text, deleted] of [
  [
    "decline",
    { action: "decline" },
    "The user did not confirm (declined). Nothing was changed.",
    [],
  ],
  [
    "accept with confirm false",
    { action: "accept", content: { confirm: false } },
    "The user did not confirm (confirm was not true). Nothing was changed.",
    [],
  ],
  ["accept", CONFIRMED, "✅ Channel #c01 deleted.", [CHANNEL_A]],
] as const) {
  test(`an initialize without capabilities while the form is shown, then ${label}, keeps the answer's outcome`, async () => {
    const session = await rawSession({ timeoutMs: 200, answerFirst: answer, reinitFirst: true });
    session.deleteChannel(CHANNEL_A);
    const [result] = await session.texts(1);
    await session.close();
    assert.equal(session.asks(), 1);
    assert.equal(result, text);
    assert.deepEqual(session.deletions, deleted);
  });
}

test("inputResponses the client sent itself do not skip the question", async () => {
  const { deletions } = fakeChannel();
  const { result, asked } = await call("discord_delete_channel", DELETE_CHANNEL, {
    inject: { confirm: { action: "accept", content: { confirm: true } } },
    answer: { action: "decline" },
  });
  assert.deepEqual(asked, [CHANNEL_FORM]);
  assert.deepEqual(deletions, []);
  assert.equal(textOf(result), "The user did not confirm (declined). Nothing was changed.");
});

test("an accept that arrives after the timeout changes nothing", async () => {
  const { deletions } = fakeChannel();
  const { result } = await call("discord_delete_channel", DELETE_CHANNEL, {
    timeoutMs: 50,
    answer: { after: 150, then: { action: "accept", content: { confirm: true } } },
  });
  assert.equal(
    textOf(result),
    "No confirmation came back (Fulfilling input required by 'tools/call' failed: Request timed out). Nothing was changed.",
  );
  assert.deepEqual(deletions, [], "the late accept reached the link and was dropped");
});

test("a call cancelled after the accept, before the change, changes nothing", async () => {
  const { deletions, fetch, channel } = fakeChannel();
  const controller = new AbortController();
  fetch.mock.mockImplementationOnce(async () => {
    controller.abort();
    await new Promise((resolve) => setTimeout(resolve, 20));
    return channel as never;
  }, 1);
  await assert.rejects(
    call("discord_delete_channel", DELETE_CHANNEL, { signal: controller.signal }),
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(fetch.mock.callCount(), 2, "the handler ran again after the answer");
  assert.deepEqual(deletions, []);
});

test("a call cancelled while the human is asked changes nothing", async () => {
  const { deletions } = fakeChannel();
  const controller = new AbortController();
  await assert.rejects(
    call("discord_delete_channel", DELETE_CHANNEL, {
      answer: "hang",
      onAsk: () => controller.abort(),
      signal: controller.signal,
    }),
  );
  assert.deepEqual(deletions, []);
});

test("an error on the run after the answer is reported as is", async () => {
  const { deletions, fetch } = fakeChannel();
  fetch.mock.mockImplementationOnce(async () => null as never, 1);
  const { result } = await call("discord_delete_channel", DELETE_CHANNEL);
  assert.deepEqual(deletions, []);
  assert.equal(textOf(result), "❌ Error: Channel not found.");
});

function fakeMessages() {
  const now = Date.now();
  const messages = [20 * DAY_MS, 2 * 60 * 60 * 1000, 60 * 60 * 1000].map((age) => {
    const createdTimestamp = now - age;
    return {
      id: SnowflakeUtil.generate({ timestamp: createdTimestamp }).toString(),
      author: { id: USER },
      webhookId: null,
      deletable: true,
      createdAt: new Date(createdTimestamp),
      createdTimestamp,
    };
  });
  const channel = {
    id: CHANNEL,
    name: "chan",
    guildId: GUILD,
    guild: { members: { me: null } },
    isDMBased: () => false,
    isTextBased: () => true,
    messages: { fetch: async () => new Collection(messages.map((m) => [m.id, m])) },
  };
  mock.method(discord.channels, "fetch", async () => channel as never);
  const post = mock.method(discord.rest, "post", async () => undefined);
  const del = mock.method(discord.rest, "delete", async () => undefined);
  return { ids: messages.map((m) => m.id), post, del };
}

const MESSAGES_FORM = `Delete 3 messages in "#chan" (${CHANNEL}), including 1 older than 14 days? This cannot be undone.`;

test("bulk_delete_messages asks with the count and the old messages, then deletes", async () => {
  const { ids, post, del } = fakeMessages();
  const { result, asked, progress } = await call("discord_bulk_delete_messages", {
    channel_id: CHANNEL,
    message_ids: ids,
    dry_run: false,
  });
  assert.deepEqual(asked, [MESSAGES_FORM]);
  assert.equal(post.mock.callCount(), 1, "the two recent ones in one bulk request");
  assert.equal(del.mock.callCount(), 1, "the old one alone");
  assert.deepEqual(progress, [2, 3], "progress still reaches the client after the answer");
  assert.equal(
    (result.structuredContent as { deleted: string[] }).deleted.length,
    3,
    "all three deleted",
  );
});

test("bulk_delete_messages deletes nothing on a decline", async () => {
  const { ids, post, del } = fakeMessages();
  const { result, asked } = await call(
    "discord_bulk_delete_messages",
    { channel_id: CHANNEL, message_ids: ids, dry_run: false },
    { answer: { action: "decline" } },
  );
  assert.deepEqual(asked, [MESSAGES_FORM]);
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
  assert.equal(textOf(result), "The user did not confirm (declined). Nothing was changed.");
  assert.equal(result.structuredContent, undefined);
});

test("bulk_delete_messages does not ask when no message it was given can be deleted", async () => {
  const { post, del } = fakeMessages();
  const elsewhere = ["444444444444444441", "444444444444444442"];
  const { result, asked } = await call("discord_bulk_delete_messages", {
    channel_id: CHANNEL,
    message_ids: elsewhere,
    dry_run: false,
  });
  assert.deepEqual(asked, []);
  assert.equal(post.mock.callCount() + del.mock.callCount(), 0);
  const content = result.structuredContent as { deleted: string[]; not_found: string[] };
  assert.deepEqual(content.deleted, []);
  assert.deepEqual(content.not_found, elsewhere);
});

test("the 40 s budget of bulk_delete_messages starts after the answer", async () => {
  const { ids, post, del } = fakeMessages();
  const now = Date.now;
  const { result } = await call(
    "discord_bulk_delete_messages",
    { channel_id: CHANNEL, message_ids: ids, dry_run: false },
    { onAsk: () => mock.method(Date, "now", () => now() + 41_000) },
  );
  const content = result.structuredContent as { deleted: string[]; stopped?: unknown };
  assert.equal(content.stopped, undefined, "a human who took 41 s does not use up the budget");
  assert.equal(content.deleted.length, 3);
  assert.equal(post.mock.callCount() + del.mock.callCount(), 2);
});

function fakeBanGuild() {
  const bans: unknown[][] = [];
  const guild = {
    id: GUILD,
    name: "Test guild",
    members: {
      bulkBan: async (...args: unknown[]) => {
        bans.push(args);
        return { bannedUsers: [USER, OTHER], failedUsers: [] };
      },
    },
  };
  mock.method(discord.guilds, "fetch", async () => guild as never);
  return bans;
}

const BAN = {
  guild_id: GUILD,
  user_ids: [USER, OTHER],
  delete_message_seconds: 3600,
  dry_run: false,
  reason: "raid",
};
const BAN_FORM = `Ban 2 users from "Test guild" (${GUILD})? Their messages from the last 3600 seconds are deleted too. Reason: "raid"`;

test("bulk_ban asks with the user count and bans after the confirmation", async () => {
  const bans = fakeBanGuild();
  const { result, asked } = await call("discord_bulk_ban", BAN);
  assert.deepEqual(asked, [BAN_FORM]);
  assert.equal(bans.length, 1);
  assert.deepEqual(result.structuredContent, {
    dry_run: false,
    banned: [USER, OTHER],
    failed: [],
  });
});

test("bulk_ban sends nothing on a decline", async () => {
  const bans = fakeBanGuild();
  const { result, asked } = await call(
    "discord_bulk_ban",
    { ...BAN, delete_message_seconds: 0, reason: undefined },
    { answer: { action: "decline" } },
  );
  assert.deepEqual(asked, [`Ban 2 users from "Test guild" (${GUILD})?`]);
  assert.equal(bans.length, 0);
  assert.equal(textOf(result), "The user did not confirm (declined). Nothing was changed.");
});

function fakePruneGuild({ estimateFails = false } = {}) {
  const prunes: { dry?: boolean; roles?: string[] }[] = [];
  const guild = {
    id: GUILD,
    name: "Test guild",
    roles: { cache: new Collection([["444444444444444444", { name: "Visitors" }]]) },
    members: {
      prune: async (options: { dry?: boolean; roles?: string[] }) => {
        prunes.push(options);
        if (options.dry && estimateFails) throw new Error("estimate refused (test)");
        return 4;
      },
    },
  };
  mock.method(discord.guilds, "fetch", async () => guild as never);
  return prunes;
}

test("prune_members asks with Discord's estimate, then prunes", async () => {
  const prunes = fakePruneGuild();
  const { result, asked } = await call("discord_prune_members", {
    guild_id: GUILD,
    days: 7,
    dry_run: false,
  });
  assert.deepEqual(asked, [
    `Prune 4 members of "Test guild" (${GUILD}), inactive for 7 days? Only members with no roles count. They can rejoin with an invite.`,
  ]);
  assert.deepEqual(
    prunes.map((p) => p.dry),
    [true, false],
    "one estimate for the form, then the real prune",
  );
  assert.equal(textOf(result), "✅ 4 members pruned (7 days inactive).");
});

test("prune_members only estimates on a decline, and names the roles it counts", async () => {
  const prunes = fakePruneGuild();
  const { result, asked } = await call(
    "discord_prune_members",
    {
      guild_id: GUILD,
      days: 1,
      roles: ["444444444444444444", "555555555555555555"],
      dry_run: false,
    },
    { answer: { action: "decline" } },
  );
  assert.deepEqual(asked, [
    `Prune 4 members of "Test guild" (${GUILD}), inactive for 1 day? A member counts only when every role they hold is among: "Visitors" (444444444444444444), 555555555555555555. They can rejoin with an invite.`,
  ]);
  assert.deepEqual(
    prunes.map((p) => p.dry),
    [true],
  );
  assert.equal(textOf(result), "The user did not confirm (declined). Nothing was changed.");
});

test("a prune_members dry run asks nothing, even with the capability", async () => {
  const prunes = fakePruneGuild();
  const { result, asked } = await call("discord_prune_members", { guild_id: GUILD, days: 7 });
  assert.deepEqual(asked, []);
  assert.deepEqual(
    prunes.map((p) => p.dry),
    [true],
  );
  assert.equal(textOf(result), "🔍 Dry run: 4 members would be pruned (7 days inactive).");
});

test("prune_members does not estimate without the capability", async () => {
  const prunes = fakePruneGuild();
  await call(
    "discord_prune_members",
    { guild_id: GUILD, days: 7, dry_run: false },
    {
      capabilities: {},
    },
  );
  assert.deepEqual(
    prunes.map((p) => p.dry),
    [false],
  );
});

test("a failing prune estimate ends the call before any question or prune", async () => {
  const prunes = fakePruneGuild({ estimateFails: true });
  const { result, asked } = await call("discord_prune_members", {
    guild_id: GUILD,
    days: 7,
    dry_run: false,
  });
  assert.deepEqual(asked, []);
  assert.deepEqual(
    prunes.map((p) => p.dry),
    [true],
  );
  assert.equal(textOf(result), "❌ Error: estimate refused (test)");
});

const BOT = "300000000000000001";
const ROLE_GUILD = "300000000000000010";
const HAS_ROLE = "300000000000000101";
const NO_ROLE = "300000000000000102";
const STRANGER = "300000000000000103";
const HELPERS = "300000000000000012";

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;
const rawUser = (id: string, bot = false) => ({
  id,
  username: `u${id.slice(-3)}`,
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot,
});
const rawMember = (id: string, roles: string[], bot = false) => ({
  user: rawUser(id, bot),
  roles,
  joined_at: new Date(0).toISOString(),
  deaf: false,
  mute: false,
  flags: 0,
});
const rawRole = (id: string, name: string, position: number, permissions: bigint) => ({
  id,
  name,
  color: 0,
  hoist: false,
  position,
  permissions: String(permissions),
  managed: false,
  mentionable: false,
  flags: 0,
});

(discord as unknown as { user: unknown }).user = asAdder(discord.users)._add(rawUser(BOT, true));
asAdder(discord.guilds)._add({
  id: ROLE_GUILD,
  name: "Role guild",
  owner_id: "1",
  afk_timeout: 300,
  verification_level: 0,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [
    rawRole(ROLE_GUILD, "@everyone", 0, PermissionFlagsBits.ViewChannel),
    rawRole("300000000000000011", "Bot", 5, PermissionFlagsBits.ManageRoles),
    rawRole(HELPERS, "Helpers", 2, 0n),
  ],
  emojis: [],
  features: [],
  mfa_level: 0,
  system_channel_flags: 0,
  joined_at: new Date(0).toISOString(),
  large: false,
  unavailable: false,
  member_count: 3,
  voice_states: [],
  members: [
    rawMember(BOT, ["300000000000000011"], true),
    rawMember(HAS_ROLE, [HELPERS]),
    rawMember(NO_ROLE, []),
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
});

/** Answers member fetches from the cache, as the gateway would: absent IDs are left out. */
function stubRoles() {
  const guild = discord.guilds.cache.get(ROLE_GUILD)!;
  mock.method(guild.members, "fetch", async (opts: { user: string | string[] }) => {
    if (!Array.isArray(opts.user)) return guild.members.cache.get(opts.user);
    return new Collection(
      opts.user.flatMap((id) => {
        const found = guild.members.cache.get(id);
        return found ? [[id, found] as const] : [];
      }),
    );
  });
  const put = mock.method(discord.rest, "put", async () => undefined);
  const del = mock.method(discord.rest, "delete", async () => undefined);
  return { put, del };
}

const ROLE_ARGS = {
  guild_id: ROLE_GUILD,
  role_id: HELPERS,
  user_ids: [HAS_ROLE, NO_ROLE, STRANGER],
  dry_run: false,
  reason: "event",
};

for (const [tool, verb, changed] of [
  ["discord_bulk_add_role", `Add the role "Helpers" (${HELPERS}) to`, NO_ROLE],
  ["discord_bulk_remove_role", `Remove the role "Helpers" (${HELPERS}) from`, HAS_ROLE],
] as const) {
  const add = tool === "discord_bulk_add_role";
  const form = `${verb} 1 member of "Role guild" (${ROLE_GUILD})? Left out: 1 ${add ? "already with" : "without"} the role, 1 not in the server. Reason: "event"`;

  test(`${tool} asks with the member counts, then changes the role`, async () => {
    const { put, del } = stubRoles();
    const { result, asked, progress } = await call(tool, ROLE_ARGS);
    assert.deepEqual(asked, [form]);
    const sent = add ? put : del;
    assert.equal(sent.mock.callCount(), 1);
    assert.equal(
      sent.mock.calls[0].arguments[0],
      Routes.guildMemberRole(ROLE_GUILD, changed, HELPERS),
    );
    assert.deepEqual(progress, [1]);
    assert.deepEqual((result.structuredContent as { done: string[] }).done, [changed]);
  });

  test(`${tool} changes nothing on a decline`, async () => {
    const { put, del } = stubRoles();
    const { result, asked } = await call(tool, ROLE_ARGS, { answer: { action: "decline" } });
    assert.deepEqual(asked, [form]);
    assert.equal(put.mock.callCount() + del.mock.callCount(), 0);
    assert.equal(textOf(result), "The user did not confirm (declined). Nothing was changed.");
  });

  test(`${tool} does not ask when no member needs the change`, async () => {
    const { put, del } = stubRoles();
    const { result, asked } = await call(tool, {
      ...ROLE_ARGS,
      user_ids: [add ? HAS_ROLE : NO_ROLE],
    });
    assert.deepEqual(asked, []);
    assert.equal(put.mock.callCount() + del.mock.callCount(), 0);
    assert.deepEqual((result.structuredContent as { done: string[] }).done, []);
  });
}

test("the 40 s budget of the role tools starts after the answer", async () => {
  const { put } = stubRoles();
  const now = Date.now;
  const { result } = await call("discord_bulk_add_role", ROLE_ARGS, {
    onAsk: () => mock.method(Date, "now", () => now() + 41_000),
  });
  assert.equal((result.structuredContent as { stopped?: unknown }).stopped, undefined);
  assert.equal(put.mock.callCount(), 1);
});

function withConfirmEnv(value: string | undefined, fn: () => void) {
  const saved = process.env.DISCORD_MCP_CONFIRM;
  if (value === undefined) delete process.env.DISCORD_MCP_CONFIRM;
  else process.env.DISCORD_MCP_CONFIRM = value;
  try {
    fn();
  } finally {
    if (saved === undefined) delete process.env.DISCORD_MCP_CONFIRM;
    else process.env.DISCORD_MCP_CONFIRM = saved;
  }
}

test("DISCORD_MCP_CONFIRM is on by default and takes the documented values", () => {
  for (const value of [undefined, "", "  ", "true", "1", "YES", " on "])
    withConfirmEnv(value, () => assert.equal(confirmMode(), true, `${value}`));
  for (const value of ["false", "0", "No", " off "])
    withConfirmEnv(value, () => assert.equal(confirmMode(), false, value));
  withConfirmEnv(" maybe ", () =>
    assert.throws(confirmMode, {
      message:
        'Invalid DISCORD_MCP_CONFIRM: "maybe". Accepted: true, 1, yes, on to enable it; false, 0, no, off to disable it.',
    }),
  );
});

/** One real call of each tool with a dry run, and a count of the writes it reached. */
const REAL_CALLS: Record<string, () => { args: Record<string, unknown>; writes: () => number }> = {
  discord_delete_channel: () => {
    const { deletions } = fakeChannel();
    return { args: DELETE_CHANNEL, writes: () => deletions.length };
  },
  discord_bulk_delete_messages: () => {
    const { ids, post, del } = fakeMessages();
    return {
      args: { channel_id: CHANNEL, message_ids: ids, dry_run: false },
      writes: () => post.mock.callCount() + del.mock.callCount(),
    };
  },
  discord_bulk_ban: () => {
    const bans = fakeBanGuild();
    return { args: BAN, writes: () => bans.length };
  },
  discord_prune_members: () => {
    const prunes = fakePruneGuild();
    return {
      args: { guild_id: GUILD, days: 7, dry_run: false },
      writes: () => prunes.filter((p) => !p.dry).length,
    };
  },
  discord_bulk_add_role: () => {
    const { put, del } = stubRoles();
    return { args: ROLE_ARGS, writes: () => put.mock.callCount() + del.mock.callCount() };
  },
  discord_bulk_remove_role: () => {
    const { put, del } = stubRoles();
    return { args: ROLE_ARGS, writes: () => put.mock.callCount() + del.mock.callCount() };
  },
};

test("every tool with a dry_run calls confirm on a real call, before any write", async () => {
  const withDryRun = getAllDefinitions()
    .filter((d) => "dry_run" in ((d.inputSchema.properties ?? {}) as Record<string, unknown>))
    .map((d) => d.name)
    .sort();
  assert.deepEqual(
    withDryRun,
    Object.keys(REAL_CALLS).sort(),
    "a tool with dry_run needs a case in REAL_CALLS",
  );
  for (const name of withDryRun) {
    const { args, writes } = REAL_CALLS[name]();
    let asked = 0;
    const confirm = async () => {
      asked++;
      throw new Error("stopped at confirm");
    };
    await assert.rejects(handleTool(name, args, { confirm }), /stopped at confirm/, name);
    assert.equal(asked, 1, `${name} calls confirm`);
    assert.equal(writes(), 0, `${name} writes before confirm`);
    mock.restoreAll();
  }
});

test("the gate refuses an accept on a request already cancelled", async () => {
  const confirmations = new Confirmations();
  const request = new AbortController();
  type Req = Parameters<Confirmations["gate"]>[0];
  const req = (inputResponses?: Record<string, unknown>) =>
    ({ id: 7, inputResponses, signal: request.signal }) as unknown as Req;
  await assert.rejects(
    confirmations.gate(req())(() => "Sure?"),
    ConfirmationStop,
  );
  request.abort();
  const accepted = { confirm: { action: "accept", content: { confirm: true } } };
  await assert.rejects(
    confirmations.gate(req(accepted))(() => "Sure?"),
    {
      result: {
        content: [
          { type: "text", text: "The call was cancelled before the change. Nothing was changed." },
        ],
        isError: true,
      },
    },
  );
});
