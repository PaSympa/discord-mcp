import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ZodError } from "zod";
import { ChannelType, DiscordAPIError, TextChannel } from "discord.js";
import { discord } from "../src/client.js";
import messages from "../src/tools/messages.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const THREAD = "444444444444444444";
const USER = "555555555555555555";
const MESSAGE = "666666666666666666";

afterEach(() => mock.restoreAll());

const handler = (name: string) => messages.handlers.get(name)!;
const textOf = (result: { content: { type: string; text?: string }[] }) =>
  result.content.map((c) => c.text ?? "").join("\n");

/** A parent text channel that passes `instanceof TextChannel`, recording thread creations. */
function stubTextChannel(refuse: string[] = []) {
  const created: Record<string, unknown>[] = [];
  const added: string[] = [];
  const members = {
    add: async (user: string) => {
      if (refuse.includes(user)) throw new Error("Missing Access");
      added.push(user);
      return user;
    },
  };
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
        return { id: THREAD, name: options.name, members };
      },
    },
    messages: {
      fetch: async () => ({
        startThread: async (options: Record<string, unknown>) => {
          created.push({ ...options, fromMessage: true });
          return { id: THREAD, name: options.name, members };
        },
      }),
    },
  });
  mock.method(discord.channels, "fetch", async () => channel as never);
  return Object.assign(created, { added });
}

/** Discord's refusal of a member change on an archived thread. */
const archivedError = () =>
  new DiscordAPIError(
    { code: 50083, message: "Thread is archived" },
    50083,
    400,
    "PUT",
    "https://discord.com/api/v10/channels/x/thread-members/y",
    {},
  );

/** A thread channel recording member additions and removals. */
function stubThread(overrides: Record<string, unknown> = {}) {
  const calls = { added: [] as string[], removed: [] as string[], unarchived: 0 };
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
      if (!archived) calls.unarchived++;
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
    assert.equal(attempts, 2, `${op}: one retry`);
    assert.deepEqual(done, [USER], name);
    assert.match(textOf(result), /was archived and is now open again/, name);
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

test("remove_thread_member still surfaces other Discord errors", async () => {
  stubThread({
    members: {
      remove: async () => {
        throw new Error("Missing Permissions");
      },
    },
  });
  await assert.rejects(
    handler("discord_remove_thread_member")({ thread_id: THREAD, user_id: USER }),
    /Missing Permissions/,
  );
});

test("create_thread adds member_ids once each and reports the ones Discord refused", async () => {
  const OTHER = "777777777777777777";
  const created = stubTextChannel([OTHER]);
  const result = await handler("discord_create_thread")({
    channel_id: CHANNEL,
    name: "pair",
    private: true,
    member_ids: [USER, USER, OTHER],
  });
  assert.equal(created.length, 1, "the thread stays created");
  assert.deepEqual(created.added, [USER]);
  assert.match(textOf(result), /Added 1 of 2 members; could not add 777777777777777777/);
  assert.doesNotMatch(textOf(result), /Add people with/);
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
