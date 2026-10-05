import { realpath, stat } from "fs/promises";
import { basename, delimiter, isAbsolute, relative, sep } from "path";
import { AttachmentBuilder } from "discord.js";
import type { APIAttachment, Message } from "discord.js";
import { z } from "zod";

/** Discord's per-message attachment cap. */
const MAX_ATTACHMENTS = 10;

/** What every file may say about itself, besides where its content comes from. */
const fileOptions = {
  description: z
    .string()
    .max(1024)
    .optional()
    .describe("Alt text of the attachment (max 1024 characters)."),
  spoiler: z
    .boolean()
    .optional()
    .describe(
      "true hides the attachment behind a spoiler warning (Discord's SPOILER_ prefix), false removes the prefix a file already has.",
    ),
};

const filename = z
  .string()
  .min(1)
  .max(255)
  .refine((name) => !/[\\/]/.test(name), "A file name has no directory.");

/**
 * Zod field for file attachments, spread/added into the message, forum, and webhook send tools.
 * Each file is the absolute path of a local file, an object with that `path`, or an object with
 * base64 `data` and the `filename` it gets; either object may add a `description` and a `spoiler`
 * flag. Items are strict objects, matching the registry rule that every nesting level rejects
 * unknown keys (`additionalProperties: false`). Pass the validated value to
 * {@link resolveAttachments}.
 */
export const attachmentsSchema = z
  .array(
    z.union([
      z.string().min(1),
      z.strictObject({
        path: z.string().min(1).describe("Absolute path of the local file."),
        filename: filename
          .optional()
          .describe("Name of the file on Discord. Default: the name of the local file."),
        ...fileOptions,
      }),
      z.strictObject({
        data: z.base64().describe("Base64-encoded content of the file."),
        filename: filename.describe("Name of the file on Discord."),
        ...fileOptions,
      }),
    ]),
  )
  .min(1)
  .max(MAX_ATTACHMENTS, "Discord allows a maximum of 10 attachments per message.")
  .optional()
  .describe(
    "Optional files to attach (max 10; Discord's size limit applies). Each is the absolute path of a local file, an object with that path and optionally filename, description (alt text) and spoiler, or an object with base64 data, the filename and optionally description and spoiler. A local file must sit inside a directory listed in DISCORD_UPLOAD_DIRS, and files from disk are refused while that variable is unset; base64 data needs no directory. Discord infers each file's type itself (a declared Content-Type is ignored) and may guess a non-UTF-8 charset for text files, so accents can look garbled in some viewers; a UTF-8 byte order mark at the start of the file avoids it. Requires the Attach Files permission.",
  );

/** Validated single-attachment input: the typed shape `resolveAttachments` consumes. */
export type AttachmentInput = NonNullable<z.infer<typeof attachmentsSchema>>[number];

/**
 * Reads DISCORD_UPLOAD_DIRS lazily so module import order cannot freeze an empty list. The list is
 * separated like PATH (`:`, or `;` on Windows where a colon belongs to a drive), so that a comma,
 * which is legal in a path, is not a separator.
 */
function uploadDirs(): string[] {
  return (process.env.DISCORD_UPLOAD_DIRS ?? "")
    .split(delimiter)
    .map((dir) => dir.trim())
    .filter(Boolean);
}

/** True when `file` lies strictly inside `dir`; both must already be real paths. */
function isInside(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Turns validated attachment inputs into discord.js AttachmentBuilders, refusing any local file
 * the operator did not allow. Uploads from disk are opt-in: a tool call must not be able to read
 * arbitrary local files (credentials, keys) and publish them to Discord. Paths are resolved
 * through symlinks before the check, so a link inside an allowed directory cannot point out of
 * it. Base64 `data` reads nothing from disk and needs no directory.
 * @returns The attachments, or `undefined` when no file was requested.
 * @throws {Error} If a path is given while uploads from disk are disabled, relative, missing, not
 * a regular file, or outside every directory in DISCORD_UPLOAD_DIRS.
 */
export async function resolveAttachments(
  inputs: readonly AttachmentInput[] | undefined,
): Promise<AttachmentBuilder[] | undefined> {
  if (!inputs) return undefined;
  const items = inputs.map((input) => (typeof input === "string" ? { path: input } : input));
  const allowed = items.some((item) => "path" in item) ? await allowedDirs() : [];
  return Promise.all(
    items.map(async (item) => {
      const builder =
        "data" in item
          ? new AttachmentBuilder(Buffer.from(item.data, "base64"), { name: item.filename })
          : new AttachmentBuilder(await checkedFile(item.path, allowed), {
              name: item.filename ?? basename(item.path),
            });
      if (item.description) builder.setDescription(item.description);
      if (item.spoiler !== undefined) builder.setSpoiler(item.spoiler);
      return builder;
    }),
  );
}

/** The real paths of the directories files may be attached from. */
async function allowedDirs(): Promise<string[]> {
  const dirs = uploadDirs();
  if (dirs.length === 0)
    throw new Error(
      `File uploads from disk are disabled: set DISCORD_UPLOAD_DIRS to a ${delimiter}-separated list of absolute directories the server may attach files from (base64 data needs no directory).`,
    );
  return Promise.all(dirs.map((dir) => realpath(dir)));
}

/** The real path of a file that may be attached, or an error saying why not. */
async function checkedFile(path: string, allowed: readonly string[]): Promise<string> {
  if (!isAbsolute(path)) throw new Error(`File path must be absolute: "${path}".`);
  const real = await realpath(path);
  if (!(await stat(real)).isFile()) throw new Error(`Not a regular file: "${path}".`);
  if (!allowed.some((dir) => isInside(dir, real)))
    throw new Error(`"${path}" is outside the directories allowed by DISCORD_UPLOAD_DIRS.`);
  return real;
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
