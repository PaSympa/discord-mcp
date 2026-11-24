import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { ChannelType, DiscordAPIError, Routes, TextChannel } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";
import { rateLimited } from "./rate-limit.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const THREAD = "444444444444444444";
const USER = "555555555555555555";
const MESSAGE = "666666666666666666";

afterEach(() => {
  mock.restoreAll();
  mock.timers.reset();
});

const handler = (name: string) => messages.handlers.get(name)!;
const textOf = (result: { content: { type: string; text?: string }[] }) =>
  result.content.map((c) => c.text ?? "").join("\n");

/** Discord's refusal of a request, as discord.js throws it. */
const discordError = (code: number, message: string, status = 400) =>
  new DiscordAPIError(
    { code, message },
    code,
    status,
    "PUT",
    "https://discord.com/api/v10/channels/x/thread-members/y",
    {},
  );

/**
 * A parent text channel that passes `instanceof TextChannel`, recording thread creations
 * and the member adds sent to Discord. `refuse` returns the error Discord answers for a user.
 */
function stubTextChannel(refuse: (user: string) => Error | undefined = () => undefined) {
  const created: Record<string, unknown>[] = [];
  const added: string[] = [];
  const put = mock.method(discord.rest, "put", async (route: string) => {
    const user = route.split("/").pop()!;
    const err = refuse(user);
    if (err) throw err;
    added.push(user);
  });
  const channel = Object.assign(Object.create(TextChannel.prototype) as object, {
    id: CHANNEL,
    name: "general",
    guildId: GUILD,
    type: ChannelType.GuildText,
    isDMBased: () => false,
    isTextBased: () => true,
    threads: {
      create: async (options: Record<string, unknown>) => {
        created.push(options);
        return { id: THREAD, name: options.name };
      },
    },
    messages: {
      fetch: async () => ({
        startThread: async (options: Record<string, unknown>) => {
          created.push({ ...options, fromMessage: true });
          return { id: THREAD, name: options.name };
        },
      }),
    },
  });
  mock.method(discord.channels, "fetch", async () => channel as never);
  return Object.assign(created, { added, put });
}

const archivedError = () => discordError(50083, "Thread is archived");
const missingPermissions = () => discordError(50013, "Missing Permissions", 403);

/** A thread channel recording member additions and removals. */
function stubThread(overrides: Record<string, unknown> = {}) {
  const calls = { added: [] as string[], removed: [] as string[], unarchived: 0, rearchived: 0 };
  const thread = {
    id: THREAD,
    name: "pair",
    guildId: GUILD,
    type: ChannelType.PrivateThread,
    isThread: () => true,
    isDMBased: () => false,
    isTextBased: () => true,
    archived: false,
    setArchived: async (archived: boolean) => {
      if (archived) calls.rearchived++;
      else calls.unarchived++;
    },
    members: {
      add: async (user: string) => {
        calls.added.push(user);
        return user;
      },
      remove: async (user: string) => {
        calls.removed.push(user);
        return user;
      },
    },
    ...overrides,
  };
  mock.method(discord.channels, "fetch", async () => thread as never);
  return calls;
}

test("create_thread advertises private and invitable as optional booleans", () => {
  const definition = messages.definitions.find((d) => d.name === "discord_create_thread");
  assert.ok(definition);
  const schema = definition.inputSchema as {
    required: string[];
    properties: Record<string, { type?: string; default?: unknown; description?: string }>;
  };
  assert.deepEqual(schema.required, ["channel_id", "name"]);
  assert.equal(schema.properties.private.type, "boolean");
  assert.equal(schema.properties.private.default, false);
  assert.equal(schema.properties.invitable.type, "boolean");
  for (const field of ["private", "invitable"])
    assert.ok((schema.properties[field].description ?? "").length > 0, field);
});

test("create_thread still creates a public standalone thread by default", async () => {
  const created = stubTextChannel();
  const result = await handler("discord_create_thread")({ channel_id: CHANNEL, name: "topic" });
  assert.equal(created.length, 1);
  assert.equal(created[0].type, ChannelType.PublicThread);
  assert.equal("invitable" in created[0], false, "invitable only applies to private threads");
  assert.match(textOf(result), /^✅ Thread "topic" created \(id: 444444444444444444\)/);
});

test("create_thread with private creates a private thread and passes invitable", async () => {
  const created = stubTextChannel();
  const result = await handler("discord_create_thread")({
    channel_id: CHANNEL,
    name: "pair",
    private: true,
    invitable: false,
  });
  assert.equal(created[0].type, ChannelType.PrivateThread);
  assert.equal(created[0].invitable, false);
  assert.match(textOf(result), /^✅ Private thread "pair" created \(id: 444444444444444444\)/);
  assert.match(textOf(result), /discord_add_thread_member/);
});

test("create_thread refuses private with message_id before reaching Discord", async () => {
  const fetch = mock.method(discord.channels, "fetch", async () => null as never);
  await assert.rejects(
    handler("discord_create_thread")({
      channel_id: CHANNEL,
      name: "pair",
      private: true,
      message_id: MESSAGE,
    }),
    (err: unknown) => err instanceof ZodError && /message_id/.test(err.message),
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("create_thread refuses invitable without private", async () => {
  await assert.rejects(
    handler("discord_create_thread")({ channel_id: CHANNEL, name: "pair", invitable: true }),
    (err: unknown) => err instanceof ZodError && /invitable/.test(err.message),
  );
});

test("add_thread_member adds the user to the thread", async () => {
  const calls = stubThread();
  const result = await handler("discord_add_thread_member")({ thread_id: THREAD, user_id: USER });
  assert.deepEqual(calls.added, [USER]);
  assert.match(textOf(result), /^✅ /);
  assert.match(textOf(result), new RegExp(USER));
});

test("remove_thread_member removes the user from the thread", async () => {
  const calls = stubThread();
  const result = await handler("discord_remove_thread_member")({
    thread_id: THREAD,
    user_id: USER,
  });
  assert.deepEqual(calls.removed, [USER]);
  assert.match(textOf(result), /^✅ /);
});

test("thread member tools refuse a channel that is not a thread", async () => {
  stubTextChannel();
  for (const name of ["discord_add_thread_member", "discord_remove_thread_member"])
    await assert.rejects(
      handler(name)({ thread_id: CHANNEL, user_id: USER }),
      /is not a thread/,
      name,
    );
});

test("an archived thread Discord accepts changes on stays archived", async () => {
  for (const name of ["discord_add_thread_member", "discord_remove_thread_member"]) {
    const calls = stubThread({ archived: true });
    const result = await handler(name)({ thread_id: THREAD, user_id: USER });
    assert.equal(calls.unarchived, 0, name);
    assert.equal(calls.added.length + calls.removed.length, 1, name);
    assert.doesNotMatch(textOf(result), /open again/, name);
    mock.restoreAll();
  }
});

test("when Discord refuses because the thread is archived, it is unarchived and the call retried", async () => {
  for (const [name, op] of [
    ["discord_add_thread_member", "add"],
    ["discord_remove_thread_member", "remove"],
  ] as const) {
    let attempts = 0;
    const done: string[] = [];
    const change = async (user: string) => {
      if (++attempts === 1) throw archivedError();
      done.push(user);
      return user;
    };
    const calls = stubThread({ archived: true, members: { add: change, remove: change } });
    const result = await handler(name)({ thread_id: THREAD, user_id: USER });
    assert.equal(calls.unarchived, 1, name);
    assert.equal(calls.rearchived, 0, `${name}: the thread stays open`);
    assert.equal(attempts, 2, `${op}: one retry`);
    assert.deepEqual(done, [USER], name);
    assert.match(textOf(result), /was archived and is now open again/, name);
    mock.restoreAll();
  }
});

/** A member change Discord refuses as archived first, then with Missing Permissions on the retry. */
function archivedThenRefused() {
  let attempts = 0;
  const change = async () => {
    throw ++attempts === 1 ? archivedError() : missingPermissions();
  };
  return { change, attempts: () => attempts };
}

test("when the retry fails, the thread is archived again and the error says so", async () => {
  for (const name of ["discord_add_thread_member", "discord_remove_thread_member"]) {
    const { change, attempts } = archivedThenRefused();
    const calls = stubThread({ archived: true, members: { add: change, remove: change } });
    await assert.rejects(handler(name)({ thread_id: THREAD, user_id: USER }), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /^Discord API error 50013 \(HTTP 403\): Missing Permissions\./);
      assert.match(err.message, /The thread was unarchived for the retry and is archived again\.$/);
      return true;
    });
    assert.equal(attempts(), 2, name);
    assert.equal(calls.unarchived, 1, name);
    assert.equal(calls.rearchived, 1, name);
    mock.restoreAll();
  }
});

test("when the retry fails and the thread cannot be archived again, the error says it is still open", async () => {
  for (const name of ["discord_add_thread_member", "discord_remove_thread_member"]) {
    const { change, attempts } = archivedThenRefused();
    const archiving: boolean[] = [];
    stubThread({
      archived: true,
      members: { add: change, remove: change },
      setArchived: async (archived: boolean) => {
        archiving.push(archived);
        if (archived) throw missingPermissions();
      },
    });
    await assert.rejects(
      handler(name)({ thread_id: THREAD, user_id: USER }),
      /Discord API error 50013 .*could not be archived again, so it is still open\.$/,
    );
    assert.equal(attempts(), 2, name);
    assert.deepEqual(archiving, [false, true], name);
    mock.restoreAll();
  }
});

test("when the thread cannot be unarchived, the error names the unarchive, not the member change", async () => {
  for (const name of ["discord_add_thread_member", "discord_remove_thread_member"]) {
    const { change, attempts } = archivedThenRefused();
    const archiving: boolean[] = [];
    stubThread({
      archived: true,
      locked: true,
      members: { add: change, remove: change },
      setArchived: async (archived: boolean) => {
        archiving.push(archived);
        throw missingPermissions();
      },
    });
    await assert.rejects(handler(name)({ thread_id: THREAD, user_id: USER }), (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(
        err.message,
        /^The thread is archived and could not be unarchived: Discord API error 50013 \(HTTP 403\): Missing Permissions\./,
      );
      assert.ok(err.cause instanceof DiscordAPIError);
      return true;
    });
    assert.equal(attempts(), 1, `${name}: no retry`);
    assert.deepEqual(archiving, [false], `${name}: no re-archive`);
    mock.restoreAll();
  }
});

test("remove_thread_member words its result so it is true whether or not the user was in the thread", async () => {
  stubThread();
  const result = await handler("discord_remove_thread_member")({
    thread_id: THREAD,
    user_id: USER,
  });
  assert.match(textOf(result), new RegExp(`^✅ User ${USER} is not in thread "pair"`));
});

test("thread member tools surface other Discord errors without unarchiving or retrying", async () => {
  for (const name of ["discord_add_thread_member", "discord_remove_thread_member"]) {
    let attempts = 0;
    const change = async () => {
      attempts++;
      throw missingPermissions();
    };
    const calls = stubThread({ archived: true, members: { add: change, remove: change } });
    await assert.rejects(
      handler(name)({ thread_id: THREAD, user_id: USER }),
      (err: unknown) => err instanceof DiscordAPIError && err.code === 50013,
      name,
    );
    assert.equal(calls.unarchived, 0, name);
    assert.equal(attempts, 1, name);
    mock.restoreAll();
  }
});

const OTHER = "777777777777777777";
const THIRD = "888888888888888888";

test("create_thread adds member_ids once each, with a signal, and reports the ones Discord refused", async () => {
  const created = stubTextChannel((user) =>
    user === OTHER ? discordError(10013, "Unknown User", 404) : undefined,
  );
  const result = await handler("discord_create_thread")(
    { channel_id: CHANNEL, name: "pair", private: true, member_ids: [USER, USER, OTHER, THIRD] },
    { signal: new AbortController().signal },
  );
  assert.equal(created.length, 1, "the thread stays created");
  assert.deepEqual(created.added, [USER, THIRD], "a refused add does not stop the others");
  const [route, options] = created.put.mock.calls[0].arguments as unknown as [
    string,
    { signal: AbortSignal },
  ];
  assert.equal(route, Routes.threadMembers(THREAD, USER));
  assert.ok(options.signal instanceof AbortSignal);
  assert.match(
    textOf(result),
    /^✅ Private thread "pair" created \(id: 444444444444444444\)\. Added 2 of 3 members\. Discord refused 777777777777777777 \(code 10013: Unknown User\)\.$/,
  );
  assert.doesNotMatch(textOf(result), /Add people with|Not reached/);
});

test("create_thread stops adding member_ids at the time budget and still returns the thread ID", async () => {
  const created = stubTextChannel();
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  created.put.mock.mockImplementation(async () => void mock.timers.tick(15_000));
  const result = await handler("discord_create_thread")({
    channel_id: CHANNEL,
    name: "pair",
    member_ids: [USER, OTHER, THIRD, MESSAGE],
  });
  assert.equal(created.put.mock.callCount(), 3);
  const text = textOf(result);
  assert.match(
    text,
    /^✅ Thread "pair" created \(id: 444444444444444444\)\. Added 3 of 4 members\./,
  );
  assert.match(
    text,
    / Not reached: 666666666666666666\. The call used its 40 s time budget\. Add them with discord_add_thread_member\.$/,
  );
  assert.doesNotMatch(
    text,
    /call again/i,
    "calling create_thread again would create a second thread",
  );
});

test("create_thread stops adding member_ids after one systemic refusal", async () => {
  const created = stubTextChannel(() => missingPermissions());
  const result = await handler("discord_create_thread")({
    channel_id: CHANNEL,
    name: "pair",
    member_ids: [USER, OTHER, THIRD],
  });
  assert.equal(created.put.mock.callCount(), 1);
  assert.equal(created.length, 1, "the thread stays created");
  assert.equal(
    textOf(result),
    `✅ Thread "pair" created (id: ${THREAD}). Added 0 of 3 members. Not reached: ${USER}, ${OTHER}, ${THIRD}. Stopped on this error: Discord API error 50013 (HTTP 403): Missing Permissions. Missing permissions; the bot lacks the permission this action requires. Add them with discord_add_thread_member.`,
  );
});

test("create_thread reports a Missing Access on one member_ids user and still adds the next", async () => {
  const created = stubTextChannel((user) =>
    user === OTHER ? discordError(50001, "Missing Access", 403) : undefined,
  );
  const result = await handler("discord_create_thread")({
    channel_id: CHANNEL,
    name: "pair",
    member_ids: [USER, OTHER, THIRD],
  });
  assert.equal(created.put.mock.callCount(), 3);
  assert.deepEqual(created.added, [USER, THIRD]);
  assert.equal(
    textOf(result),
    `✅ Thread "pair" created (id: ${THREAD}). Added 2 of 3 members. Discord refused ${OTHER} (code 50001: Missing Access).`,
  );
});

test("create_thread passes on a rate limit's wait and a cancellation without saying to call again", async () => {
  for (const [stop, ctx, expected] of [
    [
      rateLimited(5_200),
      {},
      "Discord asked to wait 6 s, past the call's time budget, so wait that long first.",
    ],
    [undefined, { signal: AbortSignal.abort() }, "The client cancelled the call."],
  ] as const) {
    const created = stubTextChannel((user) => (user === OTHER ? stop : undefined));
    const result = await handler("discord_create_thread")(
      { channel_id: CHANNEL, name: "pair", member_ids: [USER, OTHER] },
      ctx,
    );
    const text = textOf(result);
    assert.match(text, /^✅ Thread "pair" created \(id: 444444444444444444\)\./);
    assert.ok(text.includes(` ${expected} Add them with discord_add_thread_member.`), text);
    assert.doesNotMatch(text, /call again/i);
    assert.equal(created.length, 1);
    mock.restoreAll();
  }
});

test("create_thread adds member_ids to a public thread", async () => {
  const created = stubTextChannel();
  const result = await handler("discord_create_thread")({
    channel_id: CHANNEL,
    name: "topic",
    member_ids: [USER],
  });
  assert.equal(created[0].type, ChannelType.PublicThread);
  assert.deepEqual(created.added, [USER]);
  assert.match(textOf(result), /Added 1 member\./);
});

test("create_thread adds member_ids to a thread started from a message", async () => {
  const created = stubTextChannel();
  const result = await handler("discord_create_thread")({
    channel_id: CHANNEL,
    name: "topic",
    message_id: MESSAGE,
    member_ids: [USER],
  });
  assert.equal(created[0].fromMessage, true);
  assert.deepEqual(created.added, [USER]);
  assert.match(textOf(result), /created from message.*Added 1 member\./);
});

test("create_thread caps member_ids at 50", () => {
  const definition = messages.definitions.find((d) => d.name === "discord_create_thread");
  const props = (definition!.inputSchema as { properties: Record<string, { maxItems?: number }> })
    .properties;
  assert.equal(props.member_ids.maxItems, 50);
});

test("thread member tools are idempotent writes, not destructive", () => {
  for (const name of ["discord_add_thread_member", "discord_remove_thread_member"]) {
    const definition = messages.definitions.find((d) => d.name === name);
    assert.ok(definition, `${name} should be defined`);
    assert.equal(definition.annotations?.readOnlyHint, false, name);
    assert.equal(definition.annotations?.destructiveHint, false, name);
    assert.equal(definition.annotations?.idempotentHint, true, name);
    assert.deepEqual((definition.inputSchema as { required: string[] }).required, [
      "thread_id",
      "user_id",
    ]);
  }
});
