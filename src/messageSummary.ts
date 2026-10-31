/**
 * One shape for every message the message tools return, whichever way they got it:
 * from the gateway as a discord.js `Message` (history, channel search, pins), or as the raw
 * JSON of Discord's search endpoint. Both are reduced to the same normalized fields, then
 * assembled in one place, so the tools cannot drift apart on which keys they report or omit.
 */

import { Constants, MessageType, type Message } from "discord.js";
import { z } from "zod";
import {
  forwardedSummary,
  rawReferenceFields,
  referenceFields,
  referenceShape,
  type RawReferences,
} from "./messageReferences.js";

const pollSummary = z.object({
  question: z.string().nullable(),
  answers: z.array(z.object({ id: z.number(), text: z.string().nullable(), votes: z.number() })),
  expiresAt: z.string().optional(),
  finalized: z.boolean(),
});

/**
 * A message as the tools report it. Only the first eight keys are always there: the others are
 * left out when they do not apply, so an ordinary message carries no empty ones.
 */
export const messageSummary = z.object({
  id: z.string(),
  author: z.string(),
  authorId: z.string(),
  content: z.string(),
  timestamp: z.string(),
  attachments: z.number(),
  pinned: z.boolean(),
  bot: z.literal(true).optional(),
  editedAt: z.string().optional(),
  pinnedAt: z.string().optional(),
  type: z.string().optional(),
  poll: pollSummary.optional(),
  ...referenceShape,
  reactions: z.array(z.object({ emoji: z.string(), count: z.number() })).optional(),
});

export type MessageSummary = z.infer<typeof messageSummary>;

/** What every message-returning tool says about the fields of its messages, so they all say the same. */
export const MESSAGE_FIELDS_DOC =
  "Each message has id, author, authorId, content, timestamp, attachments (count) and pinned, plus, when they apply: bot (true for bot authors), editedAt, replyTo (id of the message it replies to; it may lie outside the page, so fetch it with the around cursor of discord_read_messages), reactions (emoji + count; use discord_get_reactions to see who reacted), poll (question, answers with vote counts, expiry and whether the count is final), forwarded (for a forward, whose own content is empty: the original's channel, message id, text and attachment count), type (system messages only, e.g. PollResult) and pinnedAt (pins only).";

/** What both sources are reduced to before the summary is assembled. */
interface Normalized {
  id: string;
  author: string;
  authorId: string;
  bot: boolean;
  content: string;
  timestamp: string;
  editedAt: string | null | undefined;
  attachments: number;
  pinned: boolean;
  pinnedAt?: string;
  /** Name of the type, for system messages only. */
  type?: string;
  poll?: z.infer<typeof pollSummary>;
  forwarded?: z.infer<typeof forwardedSummary>;
  replyTo?: string | null;
  reactions: { emoji: string; count: number }[];
}

function assemble(n: Normalized): MessageSummary {
  return {
    id: n.id,
    author: n.author,
    authorId: n.authorId,
    ...(n.bot ? { bot: true as const } : {}),
    content: n.content,
    timestamp: n.timestamp,
    ...(n.editedAt ? { editedAt: n.editedAt } : {}),
    attachments: n.attachments,
    pinned: n.pinned,
    ...(n.pinnedAt ? { pinnedAt: n.pinnedAt } : {}),
    ...(n.type ? { type: n.type } : {}),
    ...(n.poll ? { poll: n.poll } : {}),
    ...(n.forwarded ? { forwarded: n.forwarded } : {}),
    ...(n.replyTo ? { replyTo: n.replyTo } : {}),
    ...(n.reactions.length > 0 ? { reactions: n.reactions } : {}),
  };
}

/** A reaction emoji in the form the reaction tools accept: the unicode char, or `name:id` when custom. */
function reactionEmoji(emoji: { id: string | null; name: string | null }): string {
  return emoji.id ? `${emoji.name}:${emoji.id}` : (emoji.name ?? "");
}

/** Mirrors discord.js `User#tag`, which raw API users lack. Both "0" and "0000" mean migrated. */
function userTag(user: { username: string; discriminator: string }): string {
  return user.discriminator === "0" || user.discriminator === "0000"
    ? user.username
    : `${user.username}#${user.discriminator}`;
}

/**
 * Summarizes a discord.js message. `pinnedAt` comes from the pins endpoint, which is the only
 * place that knows when a message was pinned.
 */
export function summarizeMessage(m: Message, extras: { pinnedAt?: Date } = {}): MessageSummary {
  const poll = m.poll;
  return assemble({
    id: m.id,
    author: m.author.tag,
    authorId: m.author.id,
    bot: m.author.bot,
    content: m.content,
    timestamp: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString(),
    attachments: m.attachments.size,
    pinned: m.pinned,
    ...(extras.pinnedAt ? { pinnedAt: extras.pinnedAt.toISOString() } : {}),
    ...(m.system ? { type: MessageType[m.type] } : {}),
    // A poll message has no text of its own: report the question, the answers and their votes.
    ...(poll
      ? {
          poll: {
            question: poll.question.text,
            answers: [...poll.answers.values()].map((a) => ({
              id: a.id,
              text: a.text,
              votes: "voteCount" in a ? a.voteCount : 0,
            })),
            ...(poll.expiresAt ? { expiresAt: poll.expiresAt.toISOString() } : {}),
            finalized: poll.resultsFinalized,
          },
        }
      : {}),
    ...referenceFields(m),
    reactions: [...m.reactions.cache.values()].map((r) => ({
      emoji: reactionEmoji(r.emoji),
      count: r.count,
    })),
  });
}

/** The part of a raw API message the summary reads (a search hit, in snake_case). */
export interface RawMessage extends RawReferences {
  id: string;
  channel_id: string;
  content: string;
  timestamp: string;
  edited_timestamp?: string | null;
  author: { id: string; username: string; discriminator: string; bot?: boolean };
  attachments?: unknown[];
  pinned?: boolean;
  poll?: {
    question: { text?: string | null };
    answers: { answer_id: number; poll_media: { text?: string | null } }[];
    expiry?: string | null;
    results?: { answer_counts: { id: number; count: number }[]; is_finalized: boolean };
  };
  reactions?: { count: number; emoji: { id: string | null; name: string | null } }[];
}

/** Same test as discord.js `Message#system`, for a type that arrives as a bare number. */
function isSystemType(type: number): boolean {
  return !(Constants.NonSystemMessageTypes as readonly number[]).includes(type);
}

const iso = (timestamp: string) => new Date(timestamp).toISOString();

/** Summarizes a message as Discord's search endpoint returns it, in the same shape as {@link summarizeMessage}. */
export function summarizeRawMessage(m: RawMessage): MessageSummary {
  const poll = m.poll;
  const type = m.type ?? MessageType.Default;
  const votes = new Map(poll?.results?.answer_counts.map((c) => [c.id, c.count]));
  return assemble({
    id: m.id,
    author: userTag(m.author),
    authorId: m.author.id,
    bot: m.author.bot ?? false,
    content: m.content,
    timestamp: iso(m.timestamp),
    editedAt: m.edited_timestamp ? iso(m.edited_timestamp) : undefined,
    attachments: m.attachments?.length ?? 0,
    pinned: m.pinned ?? false,
    ...(isSystemType(type) ? { type: MessageType[type] } : {}),
    ...(poll
      ? {
          poll: {
            question: poll.question.text ?? null,
            answers: poll.answers.map((a) => ({
              id: a.answer_id,
              text: a.poll_media.text ?? null,
              votes: votes.get(a.answer_id) ?? 0,
            })),
            ...(poll.expiry ? { expiresAt: iso(poll.expiry) } : {}),
            finalized: poll.results?.is_finalized ?? false,
          },
        }
      : {}),
    ...rawReferenceFields(m),
    reactions: (m.reactions ?? []).map((r) => ({ emoji: reactionEmoji(r.emoji), count: r.count })),
  });
}
