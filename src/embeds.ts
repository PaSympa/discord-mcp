import { EmbedBuilder, ColorResolvable } from "discord.js";
import { z } from "zod";
import { httpUrl } from "./tools/define.js";

/**
 * Zod fields of a rich embed: spread into a tool's `z.object({...})` schema.
 * The single source of truth for embed input across the message, DM, and webhook tools.
 */
export const embedFieldsShape = {
  title: z.string().optional().describe("Embed title shown in bold at the top."),
  url: httpUrl.optional().describe("URL that makes the title clickable."),
  description: z.string().optional().describe("Main body text of the embed (supports Markdown)."),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Hex color like '#5865F2'.")
    .optional()
    .describe("Side-bar color as a hex string, e.g. '#5865F2'."),
  fields: z
    .array(
      z.strictObject({
        name: z.string().describe("Field heading."),
        value: z.string().describe("Field body text."),
        inline: z
          .boolean()
          .optional()
          .describe("If true, render this field side-by-side with adjacent inline fields."),
      }),
    )
    .optional()
    .describe(
      "Up to 25 name/value field blocks. Set inline:true on a field to render it side-by-side with adjacent inline fields (up to 3 per row).",
    ),
  author: z
    .strictObject({
      name: z.string().describe("Author display name."),
      icon_url: httpUrl.optional().describe("Small icon shown next to the author name."),
      url: httpUrl.optional().describe("URL the author name links to."),
    })
    .optional()
    .describe("Author block shown at the top of the embed."),
  thumbnail_url: httpUrl.optional().describe("Small image shown in the top-right corner."),
  footer: z.string().optional().describe("Footer text shown at the bottom of the embed."),
  image_url: httpUrl.optional().describe("Large image shown below the embed body."),
  timestamp: z.boolean().optional().describe("If true, stamp the embed with the current time."),
} as const;

/** Schema for a single embed object (e.g. an item of `discord_send_multiple_embeds`). */
export const embedObjectSchema = z.strictObject(embedFieldsShape);

/** Up to 10 embeds: Discord's per-message cap, enforced at parse time and advertised as maxItems. */
export const embedArraySchema = z
  .array(embedObjectSchema)
  .max(10, "Discord allows a maximum of 10 embeds per message.");

/**
 * Caps on the embed text folded into message reads. Discord allows 4096 characters of
 * description and 25 fields per embed, and 10 embeds per message, which no reader wants
 * inline. Measured against a real guild these caps never bite: descriptions run to a
 * median of 98 characters and embeds to a median of 4 fields.
 */
const EMBED_READ_CAPS = {
  description: 500,
  url: 300,
  fields: 10,
  fieldName: 100,
  fieldValue: 300,
} as const;

/** One embed as message reads report it: the parts that carry text a reader can use. */
export const embedSummary = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  fields: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
});

/** Structural shape shared by discord.js `Embed` and the raw `APIEmbed` of a search hit. */
interface EmbedLike {
  title?: string | null;
  description?: string | null;
  url?: string | null;
  fields?: readonly { name: string; value: string }[];
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

/**
 * Folds the readable text of a message's embeds into what message reads return.
 * Call sites go through embedField; this stays internal so the module exposes one way in.
 * Bot posts routinely carry no content at all and put everything in an embed, so a
 * reader that drops embeds sees an empty message and reports the channel as silent.
 * Colour, timestamps, images and thumbnails are left out: they carry no text.
 * Returns undefined when there are no embeds, so the key stays off ordinary messages.
 */
function summarizeEmbeds(embeds: readonly EmbedLike[]): z.infer<typeof embedSummary>[] | undefined {
  if (embeds.length === 0) return undefined;
  return embeds.map((embed) => ({
    ...(embed.title ? { title: embed.title } : {}),
    ...(embed.description
      ? { description: clip(embed.description, EMBED_READ_CAPS.description) }
      : {}),
    ...(embed.url ? { url: clip(embed.url, EMBED_READ_CAPS.url) } : {}),
    ...(embed.fields?.length
      ? {
          fields: embed.fields.slice(0, EMBED_READ_CAPS.fields).map((field) => ({
            name: clip(field.name, EMBED_READ_CAPS.fieldName),
            value: clip(field.value, EMBED_READ_CAPS.fieldValue),
          })),
        }
      : {}),
  }));
}

/**
 * Spreads an `embeds` key only when the message carries any. Assigning the summary
 * directly would leave `embeds: undefined` on every ordinary message: it disappears
 * on the wire but not from `structuredContent`, so the advertised shape and the
 * returned object would disagree.
 */
export function embedField(embeds: readonly EmbedLike[]): {
  embeds?: z.infer<typeof embedSummary>[];
} {
  const summarized = summarizeEmbeds(embeds);
  return summarized ? { embeds: summarized } : {};
}

/** Validated embed input: the typed shape `buildEmbed` consumes. */
export type EmbedInput = z.infer<typeof embedObjectSchema>;

/**
 * Builds an EmbedBuilder from validated embed input.
 * Shared by the message, DM, and webhook embed tools.
 */
export function buildEmbed(args: EmbedInput): EmbedBuilder {
  const embed = new EmbedBuilder();
  if (args.title) embed.setTitle(args.title);
  if (args.url) embed.setURL(args.url);
  if (args.description) embed.setDescription(args.description);
  if (args.color) embed.setColor(args.color as ColorResolvable);
  if (args.footer) embed.setFooter({ text: args.footer });
  if (args.image_url) embed.setImage(args.image_url);
  if (args.thumbnail_url) embed.setThumbnail(args.thumbnail_url);
  if (args.timestamp) embed.setTimestamp();
  if (args.author) {
    embed.setAuthor({
      name: args.author.name,
      iconURL: args.author.icon_url,
      url: args.author.url,
    });
  }
  if (args.fields) {
    embed.addFields(
      args.fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })),
    );
  }
  return embed;
}
