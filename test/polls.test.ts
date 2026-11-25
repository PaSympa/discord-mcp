import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  DiscordAPIError,
  PollLayoutType,
  RESTJSONErrorCodes,
  Routes,
  resolvePartialEmoji,
  type GuildTextBasedChannel,
} from "discord.js";
import { discord } from "../src/client.js";
import polls from "../src/tools/polls.js";

const GUILD = "111111111111111111";
const CHANNEL = "333333333333333333";
const MESSAGE = "444444444444444444";
const BOT = "555555555555555555";
const HOUR = 3_600_000;

afterEach(() => {
  mock.restoreAll();
  delete process.env.DISCORD_ALLOWED_GUILDS;
});

const run = (tool: string, args: Record<string, unknown>) => polls.handlers.get(tool)!(args);
const args = { channel_id: CHANNEL, message_id: MESSAGE };

type Adder = { _add: (...args: unknown[]) => unknown };
const asAdder = (manager: unknown) => manager as unknown as Adder;

asAdder(discord.guilds)._add({
  id: GUILD,
  name: "polls-guild",
  owner_id: BOT,
  afk_timeout: 300,
  verification_level: 0,
  default_message_notifications: 0,
  explicit_content_filter: 0,
  roles: [],
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
  channels: [{ id: CHANNEL, type: 0, guild_id: GUILD, name: "polls", position: 0 }],
  threads: [],
  presences: [],
  stage_instances: [],
  guild_scheduled_events: [],
  stickers: [],
  premium_tier: 0,
  preferred_locale: "en-US",
  nsfw_level: 0,
});
const channel = discord.channels.cache.get(CHANNEL) as GuildTextBasedChannel;

const rawUser = (n: number, bot = false) => ({
  id: String(1700000000000000000n + BigInt(n)),
  username: `user_${n}`,
  discriminator: "0",
  global_name: null,
  avatar: null,
  bot,
});

function rawPollMessage({
  counts = [] as [number, number][],
  expiresIn = HOUR,
  finalized = false,
} = {}) {
  return {
    id: MESSAGE,
    channel_id: CHANNEL,
    author: { ...rawUser(0, true), id: BOT },
    content: "",
    timestamp: new Date().toISOString(),
    edited_timestamp: null,
    tts: false,
    mention_everyone: false,
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
    pinned: false,
    type: 0,
    poll: {
      question: { text: "Q?" },
      answers: [
        { answer_id: 1, poll_media: { text: "A" } },
        { answer_id: 2, poll_media: { text: "B", emoji: { id: null, name: "👍" } } },
      ],
      expiry: new Date(Date.now() + expiresIn).toISOString(),
      allow_multiselect: false,
      layout_type: PollLayoutType.Default,
      results: {
        is_finalized: finalized,
        answer_counts: counts.map(([id, count]) => ({ id, count, me_voted: false })),
      },
    },
  };
}

/** Serves the poll message on its route; `voters` answers the voter route of answer 1. */
function stubRest(message: () => unknown, voters: ReturnType<typeof rawUser>[] = []) {
  const voterCalls: { after: string | null; limit: number }[] = [];
  const get = mock.method(discord.rest, "get", (async (
    route: string,
    options?: { query?: URLSearchParams },
  ) => {
    if (route === Routes.channelMessage(CHANNEL, MESSAGE)) return message();
    if (route === Routes.pollAnswerVoters(CHANNEL, MESSAGE, 1)) {
      const after = options?.query?.get("after") ?? null;
      const limit = Number(options?.query?.get("limit"));
      voterCalls.push({ after, limit });
      const rest = after ? voters.filter((u) => BigInt(u.id) > BigInt(after)) : voters;
      return { users: rest.slice(0, limit) };
    }
    throw new Error(`unexpected GET ${route}`);
  }) as never);
  return { get, voterCalls };
}

test("every poll read drops the cached message before fetching it", async () => {
  for (const [tool, extra] of [
    ["discord_get_poll_results", {}],
    ["discord_end_poll", {}],
    ["discord_get_poll_voters", { answer_id: 1 }],
  ] as const) {
    const order: string[] = [];
    mock.method(channel.messages.cache, "delete", (id: string) => {
      order.push(`delete ${id}`);
      return false;
    });
    stubRest(() => {
      order.push("GET message");
      return rawPollMessage({ expiresIn: -10 });
    });
    await run(tool, { ...args, ...extra });
    assert.deepEqual(order, [`delete ${MESSAGE}`, "GET message"], tool);
    mock.restoreAll();
  }
});

test("a vote count the new payload omits is not kept from the cached message", async () => {
  asAdder(channel.messages)._add(
    rawPollMessage({
      counts: [
        [1, 3],
        [2, 1],
      ],
    }),
  );
  stubRest(() => rawPollMessage({ counts: [[2, 1]] }));
  const result = await run("discord_get_poll_results", args);
  const answers = (result.structuredContent as { answers: { id: number; voteCount: number }[] })
    .answers;
  assert.deepEqual(
    answers.map((a) => [a.id, a.voteCount]),
    [
      [1, 0],
      [2, 1],
    ],
  );
  assert.equal(channel.messages.cache.has(MESSAGE), false);
});

test("get_poll_results reports an error when the message carries no poll", async () => {
  stubRest(() => ({ ...rawPollMessage(), poll: undefined }));
  await assert.rejects(run("discord_get_poll_results", args), /does not carry a poll/);
});

test("end_poll ends an open poll through Discord once", async () => {
  stubRest(() => rawPollMessage({ counts: [[1, 2]] }));
  const post = mock.method(discord.rest, "post", (async () =>
    rawPollMessage({ counts: [[1, 2]], expiresIn: 0 })) as never);
  const result = await run("discord_end_poll", args);
  assert.equal(post.mock.callCount(), 1);
  assert.equal(post.mock.calls[0].arguments[0], Routes.expirePoll(CHANNEL, MESSAGE));
  const summary = result.structuredContent as { resultsFinalized: boolean; answers: unknown[] };
  assert.equal(summary.resultsFinalized, false);
  assert.equal(summary.answers.length, 2);
});

for (const [label, state] of [
  ["an expired but not finalized", { expiresIn: -1000, finalized: false }],
  ["a finalized", { expiresIn: -HOUR, finalized: true }],
] as const) {
  test(`end_poll returns ${label} poll without calling Discord`, async () => {
    stubRest(() => rawPollMessage(state));
    const post = mock.method(discord.rest, "post", (async () => {
      throw new Error("must not be called");
    }) as never);
    const result = await run("discord_end_poll", args);
    assert.equal(post.mock.callCount(), 0);
    assert.equal(
      (result.structuredContent as { resultsFinalized: boolean }).resultsFinalized,
      state.finalized,
    );
  });
}

test("end_poll twice: the second call reads the ended poll and changes nothing", async () => {
  let ended = false;
  stubRest(() => rawPollMessage({ expiresIn: ended ? -10 : HOUR }));
  const post = mock.method(discord.rest, "post", (async () => {
    ended = true;
    return rawPollMessage({ expiresIn: 0 });
  }) as never);
  const first = await run("discord_end_poll", args);
  const second = await run("discord_end_poll", args);
  assert.equal(post.mock.callCount(), 1);
  assert.equal(first.isError, undefined);
  assert.equal(second.isError, undefined);
});

test("end_poll reads the poll again when Discord says it expired meanwhile", async () => {
  let reads = 0;
  stubRest(() => rawPollMessage({ expiresIn: reads++ === 0 ? HOUR : -10 }));
  mock.method(discord.rest, "post", (async () => {
    const code = RESTJSONErrorCodes.PollExpired;
    throw new DiscordAPIError({ code, message: "Poll expired" }, code, 400, "POST", "/x", {});
  }) as never);
  const result = await run("discord_end_poll", args);
  assert.equal(reads, 2);
  assert.ok(result.structuredContent);
});

test("end_poll passes any other Discord error through", async () => {
  stubRest(() => rawPollMessage());
  mock.method(discord.rest, "post", (async () => {
    const code = RESTJSONErrorCodes.MissingPermissions;
    throw new DiscordAPIError(
      { code, message: "Missing Permissions" },
      code,
      403,
      "POST",
      "/x",
      {},
    );
  }) as never);
  await assert.rejects(run("discord_end_poll", args), /Missing Permissions/);
});

const voterPool = (n: number) => Array.from({ length: n }, (_, i) => rawUser(i + 1, i % 7 === 0));

test("get_poll_voters pages with after until hasMore is false", async () => {
  const pool = voterPool(60);
  const { voterCalls } = stubRest(() => rawPollMessage(), pool);
  const seen: string[] = [];
  let after: string | undefined;
  const pages: { hasMore: boolean; nextAfter: string | null; count: number }[] = [];
  do {
    const r = await run("discord_get_poll_voters", { ...args, answer_id: 1, after });
    const sc = r.structuredContent as {
      voters: { id: string; username: string; bot: boolean }[];
      hasMore: boolean;
      nextAfter: string | null;
    };
    seen.push(...sc.voters.map((v) => v.id));
    pages.push({ hasMore: sc.hasMore, nextAfter: sc.nextAfter, count: sc.voters.length });
    if (sc.hasMore) assert.equal(sc.nextAfter, sc.voters.at(-1)!.id);
    after = sc.nextAfter ?? undefined;
  } while (after);
  assert.deepEqual(
    pages.map((p) => [p.count, p.hasMore]),
    [
      [25, true],
      [25, true],
      [10, false],
    ],
  );
  assert.equal(pages.at(-1)!.nextAfter, null);
  assert.deepEqual(
    seen,
    pool.map((u) => u.id),
  );
  assert.deepEqual(voterCalls, [
    { after: null, limit: 26 },
    { after: pool[24].id, limit: 26 },
    { after: pool[49].id, limit: 26 },
  ]);
});

test("get_poll_voters returns the bot flag and no cursor on an exact last page", async () => {
  const pool = voterPool(3);
  const { voterCalls } = stubRest(() => rawPollMessage(), pool);
  const r = await run("discord_get_poll_voters", { ...args, answer_id: 1, limit: 3 });
  assert.deepEqual(r.structuredContent, {
    voters: pool.map((u) => ({ id: u.id, username: u.username, bot: u.bot })),
    hasMore: false,
    nextAfter: null,
  });
  assert.equal(voterCalls.length, 1);
  assert.equal(pool[0].bot, true);
});

test("get_poll_voters with no votes returns an empty page", async () => {
  stubRest(() => rawPollMessage(), []);
  const r = await run("discord_get_poll_voters", { ...args, answer_id: 1 });
  assert.deepEqual(r.structuredContent, { voters: [], hasMore: false, nextAfter: null });
});

for (const [total, more] of [
  [100, false],
  [101, true],
  [150, true],
] as const) {
  test(`get_poll_voters at limit 100 probes past a full page (${total} voters)`, async () => {
    const pool = voterPool(total);
    const { voterCalls } = stubRest(() => rawPollMessage(), pool);
    const r = await run("discord_get_poll_voters", { ...args, answer_id: 1, limit: 100 });
    const sc = r.structuredContent as { voters: unknown[]; hasMore: boolean; nextAfter: unknown };
    assert.equal(sc.voters.length, 100);
    assert.equal(sc.hasMore, more);
    assert.equal(sc.nextAfter, more ? pool[99].id : null);
    assert.deepEqual(voterCalls, [
      { after: null, limit: 100 },
      { after: pool[99].id, limit: 1 },
    ]);
  });
}

test("get_poll_voters at limit 100 makes one call when the page is short", async () => {
  const pool = voterPool(150);
  const { voterCalls } = stubRest(() => rawPollMessage(), pool);
  const r = await run("discord_get_poll_voters", {
    ...args,
    answer_id: 1,
    limit: 100,
    after: pool[99].id,
  });
  const sc = r.structuredContent as { voters: unknown[]; hasMore: boolean };
  assert.equal(sc.voters.length, 50);
  assert.equal(sc.hasMore, false);
  assert.equal(voterCalls.length, 1);
});

test("get_poll_voters refuses an unknown answer id", async () => {
  stubRest(() => rawPollMessage());
  await assert.rejects(
    run("discord_get_poll_voters", { ...args, answer_id: 9 }),
    /has no answer with id 9/,
  );
});

test("create_poll sends the poll payload Discord expects", async () => {
  const post = mock.method(discord.rest, "post", (async () => rawPollMessage()) as never);
  const result = await run("discord_create_poll", {
    channel_id: CHANNEL,
    question: "Lunch?",
    answers: [
      { text: "Pizza", emoji: "🍕" },
      { text: "Party", emoji: "<a:party:123456789012345678>" },
      { text: "None" },
    ],
    duration_hours: 2,
    allow_multiselect: true,
  });
  assert.equal(post.mock.calls[0].arguments[0], Routes.channelMessages(CHANNEL));
  const { body } = post.mock.calls[0].arguments[1] as unknown as {
    body: { poll: unknown };
  };
  assert.deepEqual(body.poll, {
    question: { text: "Lunch?" },
    answers: [
      { poll_media: { text: "Pizza", emoji: { animated: false, name: "🍕", id: undefined } } },
      {
        poll_media: {
          text: "Party",
          emoji: { animated: true, name: "party", id: "123456789012345678" },
        },
      },
      { poll_media: { text: "None", emoji: null } },
    ],
    duration: 2,
    allow_multiselect: true,
    layout_type: PollLayoutType.Default,
  });
  assert.match(result.content[0].text!, new RegExp(`message id: ${MESSAGE}`));
});

const ACCEPTED_EMOJI = [
  "👍",
  "1️⃣",
  "❤️",
  "👨‍👩‍👧‍👦",
  "party:123456789012345678",
  "<:party:123456789012345678>",
  "<a:party:1234567890123456789>",
  "123456789012345678",
  "1234567890123456789",
];
const REFUSED_EMOJI = [
  "1234567890123456",
  "12345678901234567890",
  "x:1",
  ":",
  "",
  "party:12345678901234567890",
  "x%3A1",
  ":thumbsup:",
  "thumbsup",
  "👍:",
  "na-me:123456789012345678",
  `${"a".repeat(33)}:123456789012345678`,
];

test("create_poll accepts every emoji form discord.js reads whole", async () => {
  for (const emoji of ACCEPTED_EMOJI) {
    const parsed = resolvePartialEmoji(emoji) as { name?: string; id?: string } | null;
    assert.ok(parsed?.name ?? parsed?.id, `discord.js reads ${emoji}`);
    const id = /(\d{17,19})>?$/.exec(emoji)?.[1];
    assert.equal(parsed.id, id, `${emoji} keeps its whole ID`);
    mock.method(discord.rest, "post", (async () => rawPollMessage()) as never);
    await run("discord_create_poll", {
      channel_id: CHANNEL,
      question: "q",
      answers: [{ text: "a", emoji }],
    });
    mock.restoreAll();
  }
});

test("create_poll refuses a malformed emoji before any API call", async () => {
  const post = mock.method(discord.rest, "post", (async () => rawPollMessage()) as never);
  for (const emoji of REFUSED_EMOJI)
    await assert.rejects(
      run("discord_create_poll", {
        channel_id: CHANNEL,
        question: "q",
        answers: [{ text: "a", emoji }],
      }),
      /unicode emoji/,
      `${JSON.stringify(emoji)} must be refused`,
    );
  assert.equal(post.mock.callCount(), 0);
});

test("the poll schemas refuse empty text and a non-positive answer id", async () => {
  const post = mock.method(discord.rest, "post", (async () => rawPollMessage()) as never);
  const { get } = stubRest(() => rawPollMessage());
  for (const [tool, input] of [
    ["discord_create_poll", { channel_id: CHANNEL, question: "", answers: [{ text: "a" }] }],
    ["discord_create_poll", { channel_id: CHANNEL, question: "q", answers: [{ text: "" }] }],
    ["discord_get_poll_voters", { ...args, answer_id: 0 }],
    ["discord_get_poll_voters", { ...args, answer_id: -1 }],
    ["discord_get_poll_voters", { ...args, answer_id: 1, after: "12" }],
  ] as const)
    await assert.rejects(run(tool, input), { name: "ZodError" }, JSON.stringify(input));
  assert.equal(post.mock.callCount() + get.mock.callCount(), 0);
});

test("every poll tool refuses a channel outside DISCORD_ALLOWED_GUILDS", async () => {
  process.env.DISCORD_ALLOWED_GUILDS = "222222222222222222";
  const post = mock.method(discord.rest, "post", (async () => rawPollMessage()) as never);
  const { get } = stubRest(() => rawPollMessage());
  for (const [tool, extra] of [
    ["discord_create_poll", { question: "q", answers: [{ text: "a" }] }],
    ["discord_get_poll_results", { message_id: MESSAGE }],
    ["discord_end_poll", { message_id: MESSAGE }],
    ["discord_get_poll_voters", { message_id: MESSAGE, answer_id: 1 }],
  ] as const)
    await assert.rejects(run(tool, { channel_id: CHANNEL, ...extra }), /allow-list/, tool);
  assert.equal(post.mock.callCount() + get.mock.callCount(), 0);
});
