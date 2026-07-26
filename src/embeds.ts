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
