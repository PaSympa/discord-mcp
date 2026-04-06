import { EmbedBuilder, ColorResolvable } from "discord.js";
import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Builds an EmbedBuilder from a flat args object. */
function buildEmbed(args: Record<string, unknown>): EmbedBuilder {
  const embed = new EmbedBuilder();
  if (args.title) embed.setTitle(args.title as string);
  if (args.url) embed.setURL(args.url as string);
  if (args.description) embed.setDescription(args.description as string);
  if (args.color) embed.setColor(args.color as ColorResolvable);
  if (args.footer) embed.setFooter({ text: args.footer as string });
  if (args.image_url) embed.setImage(args.image_url as string);
  if (args.thumbnail_url) embed.setThumbnail(args.thumbnail_url as string);
  if (args.timestamp) embed.setTimestamp();
  if (args.author) {
    const a = args.author as { name: string; icon_url?: string; url?: string };
    embed.setAuthor({ name: a.name, iconURL: a.icon_url, url: a.url });
  }
  if (args.fields) {
    const fields = args.fields as { name: string; value: string; inline?: boolean }[];
    embed.addFields(fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
  }
  return embed;
}

/** Embed input schema properties (shared across embed tools). */
const embedProperties = {
  title: { type: "string" },
  url: { type: "string", description: "URL that makes the title clickable." },
  description: { type: "string" },
  color: { type: "string", description: "Hex color e.g. #5865F2" },
  fields: {
    type: "array",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        value: { type: "string" },
        inline: { type: "boolean" },
      },
      required: ["name", "value"],
    },
  },
  author: {
    type: "object",
    description: "Author block shown at the top of the embed.",
    properties: {
      name: { type: "string" },
      icon_url: { type: "string" },
      url: { type: "string" },
    },
    required: ["name"],
  },
  thumbnail_url: { type: "string", description: "Small image shown in the top-right corner." },
  footer: { type: "string" },
  image_url: { type: "string" },
  timestamp: { type: "boolean", description: "If true, adds the current timestamp to the embed." },
} as const;

const userIdProp = {
  user_id: { type: "string", description: "The Discord user ID." },
} as const;

const messageIdProp = {
  message_id: { type: "string", description: "The message ID (must be a bot message)." },
} as const;

/** Tool definitions for direct messages. */
export const definitions = [
  {
    name: "discord_send_dm",
    description:
      "Send a direct message to a user by their user ID. The bot must share at least one server with the user.",
    inputSchema: {
      type: "object",
      properties: {
        ...userIdProp,
        content: { type: "string", description: "The message content to send." },
      },
      required: ["user_id", "content"],
    },
  },
  {
    name: "discord_send_dm_embed",
    description:
      "Send a rich embed as a direct message to a user.",
    inputSchema: {
      type: "object",
      properties: {
        ...userIdProp,
        content: { type: "string", description: "Optional text content above the embed." },
        ...embedProperties,
      },
      required: ["user_id"],
    },
  },
  {
    name: "discord_edit_dm",
    description:
      "Edit a text message previously sent by the bot in a DM.",
    inputSchema: {
      type: "object",
      properties: {
        ...userIdProp,
        ...messageIdProp,
        content: { type: "string", description: "New text content for the message." },
      },
      required: ["user_id", "message_id", "content"],
    },
  },
  {
    name: "discord_edit_dm_embed",
    description:
      "Edit an embed previously sent by the bot in a DM. Only provided fields are updated; omitted fields are removed.",
    inputSchema: {
      type: "object",
      properties: {
        ...userIdProp,
        ...messageIdProp,
        content: { type: "string", description: "Optional new text content above the embed." },
        ...embedProperties,
      },
      required: ["user_id", "message_id"],
    },
  },
  {
    name: "discord_delete_dm",
    description:
      "Delete a message sent by the bot in a DM.",
    inputSchema: {
      type: "object",
      properties: {
        ...userIdProp,
        ...messageIdProp,
      },
      required: ["user_id", "message_id"],
    },
  },
  {
    name: "discord_read_dms",
    description:
      "Read the last N messages from a DM conversation with a user.",
    inputSchema: {
      type: "object",
      properties: {
        ...userIdProp,
        limit: { type: "number", description: "1–100, default 20." },
      },
      required: ["user_id"],
    },
  },
  {
    name: "discord_reply_dm",
    description:
      "Reply to a specific message in a DM conversation.",
    inputSchema: {
      type: "object",
      properties: {
        ...userIdProp,
        ...messageIdProp,
        content: { type: "string", description: "The reply content." },
      },
      required: ["user_id", "message_id", "content"],
    },
  },
];

/** Handles direct message tools. */
async function handle(
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult | null> {
  switch (name) {
    case "discord_send_dm": {
      const user = await discord.users.fetch(validateId(args.user_id, "user_id"));
      const sent = await user.send(args.content as string);
      return { content: [{ type: "text", text: `✅ DM sent to ${user.username} (message id: ${sent.id}).` }] };
    }

    case "discord_send_dm_embed": {
      const user = await discord.users.fetch(validateId(args.user_id, "user_id"));
      const embed = buildEmbed(args);
      const sent = await user.send({
        content: (args.content as string) || undefined,
        embeds: [embed],
      });
      return { content: [{ type: "text", text: `✅ DM embed sent to ${user.username} (message id: ${sent.id}).` }] };
    }

    case "discord_edit_dm": {
      const user = await discord.users.fetch(validateId(args.user_id, "user_id"));
      const dm = await user.createDM();
      const msgId = validateId(args.message_id, "message_id");
      const msg = await dm.messages.fetch(msgId);
      if (msg.author.id !== discord.user?.id) throw new Error("Can only edit messages sent by the bot.");
      await msg.edit(args.content as string);
      return { content: [{ type: "text", text: `✅ DM message ${msgId} edited for ${user.username}.` }] };
    }

    case "discord_edit_dm_embed": {
      const user = await discord.users.fetch(validateId(args.user_id, "user_id"));
      const dm = await user.createDM();
      const msgId = validateId(args.message_id, "message_id");
      const msg = await dm.messages.fetch(msgId);
      if (msg.author.id !== discord.user?.id) throw new Error("Can only edit embeds sent by the bot.");
      const embed = buildEmbed(args);
      await msg.edit({
        content: (args.content as string) || undefined,
        embeds: [embed],
      });
      return { content: [{ type: "text", text: `✅ DM embed edited on message ${msgId} for ${user.username}.` }] };
    }

    case "discord_delete_dm": {
      const user = await discord.users.fetch(validateId(args.user_id, "user_id"));
      const dm = await user.createDM();
      const msgId = validateId(args.message_id, "message_id");
      const msg = await dm.messages.fetch(msgId);
      if (msg.author.id !== discord.user?.id) throw new Error("Can only delete messages sent by the bot.");
      await msg.delete();
      return { content: [{ type: "text", text: `✅ DM message ${msgId} deleted for ${user.username}.` }] };
    }

    case "discord_read_dms": {
      const user = await discord.users.fetch(validateId(args.user_id, "user_id"));
      const dm = await user.createDM();
      const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100);
      const messages = await dm.messages.fetch({ limit });
      const result = [...messages.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          id: m.id,
          author: m.author.username,
          content: m.content,
          embeds: m.embeds.length,
          timestamp: m.createdAt.toISOString(),
        }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_reply_dm": {
      const user = await discord.users.fetch(validateId(args.user_id, "user_id"));
      const dm = await user.createDM();
      const msgId = validateId(args.message_id, "message_id");
      const target = await dm.messages.fetch(msgId);
      const sent = await target.reply(args.content as string);
      return { content: [{ type: "text", text: `✅ DM reply sent to ${user.username} (message id: ${sent.id}).` }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
