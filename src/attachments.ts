import { AttachmentBuilder } from "discord.js";
import type { APIAttachment, Message } from "discord.js";
import { z } from "zod";

/**
 * Zod field for file attachments, spread/added into the message, forum, and webhook
 * send tools. Each item must supply exactly one source: url, file_path, or data.
 * The 10-attachment cap is Discord's per-message limit, enforced at parse time.
 * Items are strict objects, matching the registry rule that every nesting level
 * rejects unknown keys (`additionalProperties: false`).
 */
export const attachmentsSchema = z
  .array(
    z.strictObject({
      url: z.string().optional().describe("Public URL of the file to upload."),
      file_path: z.string().optional().describe("Absolute path to a local file."),
      data: z.string().optional().describe("Base64-encoded file content."),
      filename: z
        .string()
        .optional()
        .describe("Filename (required with data, optional otherwise)."),
      description: z.string().optional().describe("Alt text for the attachment."),
      spoiler: z.boolean().optional().describe("Mark the attachment as a spoiler."),
    }),
  )
  .max(10, "Discord allows a maximum of 10 attachments per message.")
  .optional()
  .describe(
    "Files to attach (max 10, 25MB each). Provide exactly one of url, file_path, or data for each.",
  );

/** Validated single-attachment input: the typed shape `buildAttachments` consumes. */
export type AttachmentInput = NonNullable<z.infer<typeof attachmentsSchema>>[number];

/**
 * Turns validated attachment inputs into discord.js AttachmentBuilders. A base64
 * `data` field becomes a Buffer; otherwise the file_path or url is used directly.
 * The filename falls back to the basename of the path/url, then to "file".
 */
export function buildAttachments(inputs: AttachmentInput[]): AttachmentBuilder[] {
  return inputs.map((a) => {
    if (!a.data && !a.file_path && !a.url)
      throw new Error("Each attachment must provide one of url, file_path, or data.");
    const source = a.data ? Buffer.from(a.data, "base64") : (a.file_path ?? a.url!);
    const name =
      a.filename ??
      (a.file_path ? a.file_path.split("/").pop()! : undefined) ??
      (a.url ? a.url.split("/").pop()?.split("?")[0] : undefined) ??
      "file";
    const builder = new AttachmentBuilder(source);
    builder.setName(name);
    if (a.description) builder.setDescription(a.description);
    if (a.spoiler) builder.setSpoiler(true);
    return builder;
  });
}

/** Output schema for an attachment on a fetched message. */
export const attachmentSummarySchema = z.object({
  id: z.string(),
  filename: z.string(),
  url: z.string(),
  size: z.number(),
  content_type: z.string().nullable(),
  description: z.string().nullable(),
});

/** Summarizes the attachments on a discord.js Message for structured tool output. */
export function formatAttachments(msg: Message): z.infer<typeof attachmentSummarySchema>[] {
  return [...msg.attachments.values()].map((a) => ({
    id: a.id,
    filename: a.name,
    url: a.url,
    size: a.size,
    content_type: a.contentType ?? null,
    description: a.description ?? null,
  }));
}

/**
 * Same summary for raw API attachments (webhook fetches, guild message search),
 * which carry snake_case fields and no discord.js Attachment wrapper.
 */
export function formatApiAttachments(
  attachments: readonly APIAttachment[] | undefined,
): z.infer<typeof attachmentSummarySchema>[] {
  return (attachments ?? []).map((a) => ({
    id: a.id,
    filename: a.filename,
    url: a.url,
    size: a.size,
    content_type: a.content_type ?? null,
    description: a.description ?? null,
  }));
}
