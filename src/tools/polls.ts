import { PollLayoutType, type Poll } from "discord.js";
import { z } from "zod";
import { getTextChannel } from "../client.js";
import { defineModule, defineTool, intIn, snowflake, structured } from "./define.js";

const channelId = snowflake.describe("ID (snowflake) of the channel or thread.");
const messageId = snowflake.describe("ID of the poll message.");

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

/** Fetches the poll carried by a message. */
async function getPoll(channel_id: string, message_id: string): Promise<Poll> {
  const channel = await getTextChannel(channel_id);
  // `force` bypasses the message cache, which holds stale vote counts for polls the bot posted itself.
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
      "Create a native Discord poll in a channel or thread. Up to 10 answers (55 characters each), a question up to 300 characters, and a duration up to 768 hours (32 days). Requires the Send Messages permission. Returns the poll message ID.",
    annotations: {
      title: "Create poll",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: channelId.describe("ID (snowflake) of the target channel or thread."),
      question: z.string().max(300).describe("Poll question (max 300 characters)."),
      answers: z
        .array(
          z.strictObject({
            text: z.string().max(55).describe("Answer text (max 55 characters)."),
            emoji: z
              .string()
              .optional()
              .describe(
                "Optional unicode emoji or custom emoji 'name:id' shown next to the answer.",
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
      "Read a poll's current question, answers and vote counts. Vote counts update live as people vote; results are not final until the poll expires or discord_end_poll is called (resultsFinalized becomes true). Read-only.",
    annotations: { title: "Get poll results", readOnlyHint: true, openWorldHint: true },
    schema: z.object({ channel_id: channelId, message_id: messageId }),
    outputSchema: pollSummary,
    handle: async ({ channel_id, message_id }) => {
      return structured(summarizePoll(await getPoll(channel_id, message_id)));
    },
  }),
  defineTool({
    name: "discord_end_poll",
    description:
      "End a poll immediately instead of waiting for its duration to expire. Only the bot's own polls can be ended early. Irreversible: a poll cannot be reopened once ended. Returns the final results.",
    annotations: {
      title: "End poll",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({ channel_id: channelId, message_id: messageId }),
    outputSchema: pollSummary,
    handle: async ({ channel_id, message_id }) => {
      const poll = await getPoll(channel_id, message_id);
      if (poll.resultsFinalized) return structured(summarizePoll(poll));
      const ended = await poll.end();
      return structured(summarizePoll(ended.poll ?? poll));
    },
  }),
  defineTool({
    name: "discord_get_poll_voters",
    description:
      "List the users who voted for one specific answer of a poll. Returns { voters: [...] } with id and username. Use discord_get_poll_results first to find an answer's id. Read-only.",
    annotations: { title: "Get poll voters", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: channelId,
      message_id: messageId,
      answer_id: z.int().describe("The answer's numeric id, from discord_get_poll_results."),
      limit: intIn(1, 100).default(25).describe("Max voters to return (1–100). Default 25."),
    }),
    outputSchema: z.object({
      voters: z.array(z.object({ id: z.string(), username: z.string() })),
    }),
    handle: async ({ channel_id, message_id, answer_id, limit }) => {
      const poll = await getPoll(channel_id, message_id);
      const answer = poll.answers.get(answer_id);
      if (!answer)
        throw new Error(`Poll on message ${message_id} has no answer with id ${answer_id}.`);
      const voters = await answer.voters.fetch({ limit });
      return structured({
        voters: [...voters.values()].map((u) => ({ id: u.id, username: u.username })),
      });
    },
  }),
];

export default defineModule(tools);
