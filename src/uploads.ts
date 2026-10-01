import { realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, sep } from "node:path";
import { AttachmentBuilder } from "discord.js";
import { z } from "zod";

/** Discord's per-message attachment cap. */
const MAX_UPLOAD_FILES = 10;

/**
 * Zod field for tools that can attach local files to a message: spread into a tool's
 * `z.object({...})` schema, then pass the validated value to {@link resolveUploads}.
 */
export const uploadFieldsShape = {
  files: z
    .array(z.string())
    .min(1)
    .max(MAX_UPLOAD_FILES)
    .optional()
    .describe(
      "Optional absolute paths of local files to attach (max 10; Discord's size limit applies). Every file must sit inside a directory listed in DISCORD_UPLOAD_DIRS, and uploads are refused while that variable is unset. Discord infers each file's type itself (a declared Content-Type is ignored) and may guess a non-UTF-8 charset for text files, so accents can look garbled in some viewers. Requires the Attach Files permission.",
    ),
} as const;

/** Reads DISCORD_UPLOAD_DIRS lazily so module import order cannot freeze an empty list. */
function uploadDirs(): string[] {
  return (process.env.DISCORD_UPLOAD_DIRS ?? "")
    .split(",")
    .map((dir) => dir.trim())
    .filter(Boolean);
}

/** True when `file` lies strictly inside `dir`; both must already be real paths. */
function isInside(dir: string, file: string): boolean {
  const rel = relative(dir, file);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Turns validated `files` paths into attachments, refusing anything the operator did not
 * allow. Uploads are opt-in: a tool call must not be able to read arbitrary local files
 * (credentials, keys) and publish them to Discord. Paths are resolved through symlinks
 * before the check, so a link inside an allowed directory cannot point out of it.
 * @returns The attachments, or `undefined` when no file was requested.
 * @throws {Error} If uploads are disabled, a path is relative, missing, not a regular file,
 * or outside every directory in DISCORD_UPLOAD_DIRS.
 */
export async function resolveUploads(
  paths: readonly string[] | undefined,
): Promise<AttachmentBuilder[] | undefined> {
  if (!paths) return undefined;
  const dirs = uploadDirs();
  if (dirs.length === 0)
    throw new Error(
      "File uploads are disabled: set DISCORD_UPLOAD_DIRS to a comma-separated list of absolute directories the server may attach files from.",
    );
  const allowed = await Promise.all(dirs.map((dir) => realpath(dir)));
  return Promise.all(
    paths.map(async (path) => {
      if (!isAbsolute(path)) throw new Error(`File path must be absolute: "${path}".`);
      const real = await realpath(path);
      if (!(await stat(real)).isFile()) throw new Error(`Not a regular file: "${path}".`);
      if (!allowed.some((dir) => isInside(dir, real)))
        throw new Error(`"${path}" is outside the directories allowed by DISCORD_UPLOAD_DIRS.`);
      return new AttachmentBuilder(real, { name: basename(path) });
    }),
  );
}
