import { MessageReferenceType, MessageType, type Message } from "discord.js";
import { z } from "zod";

/**
 * A forward's copy of the original message. Discord keeps it in `message_snapshots`
 * and leaves the forwarding message's own content empty, so without it a forward
 * reads as a blank message.
 */
export const forwardedSummary = z.object({
  channelId: z.string(),
  messageId: z.string().nullable(),
  content: z.string(),
  attachments: z.number(),
});

/**
 * Optional message-summary fields that say what a message points at: the message it
 * replies to, or the snapshot it forwards.
 */
export const referenceShape = {
  replyTo: z.string().optional(),
  forwarded: forwardedSummary.optional(),
};

type ReferenceFields = { replyTo?: string; forwarded?: z.infer<typeof forwardedSummary> };

/** Reads {@link referenceShape} from a discord.js message; keys are omitted when absent. */
export function referenceFields(m: Message): ReferenceFields {
  const fields: ReferenceFields = {};
  const ref = m.reference;
  // Forwards and crossposts also carry a reference, but are not replies.
  if (ref?.type === MessageReferenceType.Default && ref.channelId === m.channelId && ref.messageId)
    fields.replyTo = ref.messageId;
  if (ref?.type === MessageReferenceType.Forward) {
    const snapshot = m.messageSnapshots.first();
    fields.forwarded = {
      channelId: ref.channelId,
      messageId: ref.messageId ?? null,
      content: snapshot?.content ?? "",
      attachments: snapshot?.attachments.size ?? 0,
    };
  }
  return fields;
}

/** The part of a raw API message (a search hit) that {@link rawReferenceFields} reads. */
export interface RawReferences {
  type?: number;
  message_reference?: { type?: number; channel_id?: string; message_id?: string };
  message_snapshots?: { message: { content: string; attachments?: unknown[] } }[];
}

/** Reads {@link referenceShape} from a raw API message (search results). */
export function rawReferenceFields(m: RawReferences): ReferenceFields {
  const fields: ReferenceFields = {};
  const ref = m.message_reference;
  if (m.type === MessageType.Reply && ref?.message_id) fields.replyTo = ref.message_id;
  const snapshot = m.message_snapshots?.[0]?.message;
  if (ref?.type === MessageReferenceType.Forward)
    fields.forwarded = {
      channelId: ref.channel_id ?? "",
      messageId: ref.message_id ?? null,
      content: snapshot?.content ?? "",
      attachments: snapshot?.attachments?.length ?? 0,
    };
  return fields;
}
