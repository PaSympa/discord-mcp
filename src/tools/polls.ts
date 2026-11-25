import { DiscordAPIError, PollLayoutType, RESTJSONErrorCodes, type Poll } from "discord.js";
import { z } from "zod";
import { getTextChannel } from "../client.js";
import { DEFAULTS, MAX_FETCH_LIMIT } from "../constants.js";
import {
  channelId,
  defineModule,
  defineTool,
  intIn,
  messageId,
  snowflake,
  structured,
} from "./define.js";

const pollMessageId = messageId.describe("ID of the poll message.");

/**
 * discord.js drops an emoji it cannot parse without an error, reads at most 19 ID digits,
 * and URL-decodes any "%". So only the forms it reads whole get through: a unicode emoji
 * (at least one character beyond printable ASCII), or name:id, <:name:id> or <a:name:id>.
 */
const answerEmoji = z
  .string()
  .regex(
    /^(?:[^:%\s]*[^\s!-~][^:%\s]*|<?(?:a?:)?\w{2,32}:\d{17,19}>?)$/,
    "Must be a unicode emoji, or a custom emoji 'name:id' or '<:name:id>' with a 2-32 character name and a 17-19 digit ID.",
  );

const pollAnswerSummary = z.object({
  id: z.number(),
  text: z.string().nullable(),
  emoji: z.string().nullable(),
  voteCount: z.number(),
});

const pollSummary = z.object({
  messageId: z.string(),
  question: z.string().nullable(),
  answers: z.array(pollAnswerSummary),
  allowMultiselect: z.boolean(),
  expiresAt: z.string().nullable(),
  resultsFinalized: z.boolean(),
});

async function getPoll(channel_id: string, message_id: string): Promise<Poll> {
  const channel = await getTextChannel(channel_id);
  // A fetched clone shares the cached copy's Poll, and Poll#_patch keeps the count of any answer the payload omits.
  channel.messages.cache.delete(message_id);
  const msg = await channel.messages.fetch({ message: message_id, cache: false, force: true });
  if (!msg.poll) throw new Error(`Message ${message_id} does not carry a poll.`);
  return msg.poll;
}

function summarizePoll(poll: Poll) {
  return {
    messageId: poll.messageId,
    question: poll.question.text,
    answers: [...poll.answers.values()].map((a) => ({
      id: a.id,
      text: a.text,
      emoji: a.emoji?.toString() ?? null,
      voteCount: "voteCount" in a ? a.voteCount : 0,
    })),
    allowMultiselect: poll.allowMultiselect,
    expiresAt: poll.expiresAt?.toISOString() ?? null,
    resultsFinalized: poll.resultsFinalized,
  };
}

/** Tool definitions for native Discord polls. */
const tools = [
  defineTool({
    name: "discord_create_poll",
    description:
      "Create a native Discord poll in a channel or thread. Up to 10 answers (55 characters each), a question up to 300 characters, and a duration up to 768 hours (32 days). Requires the Send Messages and Send Polls permissions. Returns the poll message ID.",
    annotations: {
      title: "Create poll",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe("ID (snowflake) of the target channel or thread."),
      question: z.string().min(1).max(300).describe("Poll question (1–300 characters)."),
      answers: z
        .array(
          z.strictObject({
            text: z.string().min(1).max(55).describe("Answer text (1–55 characters)."),
            emoji: answerEmoji
              .optional()
              .describe(
                "Optional unicode emoji, or custom emoji 'name:id' or '<:name:id>' ('<a:name:id>' if animated), shown next to the answer.",
              ),
          }),
        )
        .min(1)
        .max(10)
        .describe("1 to 10 answer options."),
      duration_hours: intIn(1, 768)
        .default(24)
        .describe(
          "How long the poll stays open, in hours (1–768, i.e. up to 32 days). Default 24.",
        ),
      allow_multiselect: z
        .boolean()
        .default(false)
        .describe("Whether voters can pick more than one answer. Default false."),
    }),
    handle: async ({ channel_id, question, answers, duration_hours, allow_multiselect }) => {
      const channel = await getTextChannel(channel_id);
      const sent = await channel.send({
        poll: {
          question: { text: question },
          answers,
          duration: duration_hours,
          allowMultiselect: allow_multiselect,
          layoutType: PollLayoutType.Default,
        },
      });
      return {
        content: [
          { type: "text", text: `✅ Poll created (message id: ${sent.id}) in #${channel.name}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_get_poll_results",
    description:
      "Read a poll's current question, answers and vote counts. Counts update as people vote and are final once resultsFinalized is true, which Discord sets after the poll expires or discord_end_poll ends it. Requires the View Channel and Read Message History permissions. Read-only.",
    annotations: { title: "Get poll results", readOnlyHint: true, openWorldHint: true },
    schema: z.object({ channel_id: channelId, message_id: pollMessageId }),
    outputSchema: pollSummary,
    handle: async ({ channel_id, message_id }) => {
      return structured(summarizePoll(await getPoll(channel_id, message_id)));
    },
  }),
  defineTool({
    name: "discord_end_poll",
    description:
      "End a poll immediately instead of waiting for its duration to expire. Only the bot's own polls can be ended early. Irreversible: a poll cannot be reopened once ended. A poll that has already ended or expired is returned unchanged. Requires the View Channel and Read Message History permissions. Returns the results; resultsFinalized tells whether Discord has finished counting them.",
    annotations: {
      title: "End poll",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({ channel_id: channelId, message_id: pollMessageId }),
    outputSchema: pollSummary,
    handle: async ({ channel_id, message_id }) => {
      const poll = await getPoll(channel_id, message_id);
      // Poll#end throws PollAlreadyExpired, without calling Discord, once the expiry is past.
      const expired = poll.expiresTimestamp !== null && poll.expiresTimestamp <= Date.now();
      if (poll.resultsFinalized || expired) return structured(summarizePoll(poll));
      try {
        const ended = await poll.end();
        return structured(summarizePoll(ended.poll ?? poll));
      } catch (error) {
        if (!(error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.PollExpired))
          throw error;
        return structured(summarizePoll(await getPoll(channel_id, message_id)));
      }
    },
  }),
  defineTool({
    name: "discord_get_poll_voters",
    description:
      "List the users who voted for one specific answer of a poll. Returns { voters: [...], hasMore, nextAfter } with id, username, bot flag, ordered by user ID. Returns 25 voters by default and at most 100 per call; while hasMore is true pass nextAfter back as `after` for the next page. A vote cast while paging is missed if the voter's ID sorts before the cursor. Use discord_get_poll_results first to find an answer's id. Requires the View Channel and Read Message History permissions. Read-only.",
    annotations: { title: "Get poll voters", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: channelId,
      message_id: pollMessageId,
      answer_id: z
        .int()
        .min(1)
        .describe("The answer's numeric id (1 or more), from discord_get_poll_results."),
      limit: intIn(1, MAX_FETCH_LIMIT)
        .default(DEFAULTS.LIMIT)
        .describe("Max voters to return (1–100). Default 25."),
      after: snowflake
        .optional()
        .describe(
          "Pagination cursor: a user ID (snowflake). Pass the previous response's nextAfter to fetch the next page.",
        ),
    }),
    outputSchema: z.object({
      voters: z.array(z.object({ id: z.string(), username: z.string(), bot: z.boolean() })),
      hasMore: z.boolean(),
      nextAfter: z.string().nullable(),
    }),
    handle: async ({ channel_id, message_id, answer_id, limit, after }) => {
      const poll = await getPoll(channel_id, message_id);
      const answer = poll.answers.get(answer_id);
      if (!answer)
        throw new Error(`Poll on message ${message_id} has no answer with id ${answer_id}.`);
      const page = [
        ...(
          await answer.voters.fetch({ after, limit: Math.min(limit + 1, MAX_FETCH_LIMIT) })
        ).values(),
      ];
      const voters = page.slice(0, limit);
      const last = voters.at(-1);
      // Discord serves at most 100 voters per call, so a full page of 100 needs a probe for more.
      const more =
        page.length > limit ||
        (last !== undefined &&
          voters.length === MAX_FETCH_LIMIT &&
          (await answer.voters.fetch({ after: last.id, limit: 1 })).size > 0);
      const nextAfter = more && last ? last.id : null;
      return structured({
        voters: voters.map((u) => ({ id: u.id, username: u.username, bot: u.bot })),
        hasMore: nextAfter !== null,
        nextAfter,
      });
    },
  }),
];

export default defineModule(tools);
