import { EmbedBuilder, ColorResolvable, ChannelType } from "discord.js";
import { discord, getTextChannel } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for reading, sending, replying, editing, reacting, threading, embedding, deleting, pinning, and searching messages. */
export const definitions = [
  {
    name: "discord_read_messages",
    description: "Read the last N messages from a text channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        limit: { type: "number", description: "1–100, default 20." },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "discord_send_message",
    description: "Send a plain text message to a channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        content: { type: "string" },
      },
      required: ["channel_id", "content"],
    },
  },
  {
    name: "discord_reply_message",
    description: "Reply to a specific message in a channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        message_id: { type: "string", description: "The message ID to reply to." },
        content: { type: "string" },
      },
      required: ["channel_id", "message_id", "content"],
    },
  },
  {
    name: "discord_edit_message",
    description: "Edit a message sent by the bot.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        message_id: { type: "string", description: "The message ID to edit (must be a bot message)." },
        content: { type: "string", description: "New text content for the message." },
      },
      required: ["channel_id", "message_id", "content"],
    },
  },
  {
    name: "discord_add_reaction",
    description: "Add a reaction emoji to a message.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        message_id: { type: "string" },
        emoji: { type: "string", description: "Unicode emoji (e.g. '👍') or custom emoji in format 'name:id'." },
      },
      required: ["channel_id", "message_id", "emoji"],
    },
  },
  {
    name: "discord_create_thread",
    description: "Create a thread from an existing message or as a standalone thread in a channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        name: { type: "string", description: "Thread name." },
        message_id: { type: "string", description: "Optional: message to start the thread from. If omitted, creates a standalone thread." },
        auto_archive_duration: { type: "number", description: "Auto-archive after N minutes of inactivity (60, 1440, 4320, 10080). Default 1440 (24h)." },
      },
      required: ["channel_id", "name"],
    },
  },
  {
    name: "discord_bulk_delete_messages",
    description: "Delete multiple messages at once (2–100, messages must be less than 14 days old).",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        count: { type: "number", description: "Number of recent messages to delete (2–100)." },
      },
      required: ["channel_id", "count"],
    },
  },
  {
    name: "discord_send_embed",
    description: "Send a rich embed message (title, description, color, fields, footer, image).",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        title: { type: "string" },
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
        footer: { type: "string" },
        image_url: { type: "string" },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "discord_delete_message",
    description: "Delete a specific message from a channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        message_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["channel_id", "message_id"],
    },
  },
  {
    name: "discord_pin_message",
    description: "Pin or unpin a message in a channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        message_id: { type: "string" },
        pin: { type: "boolean", description: "true to pin, false to unpin." },
      },
      required: ["channel_id", "message_id", "pin"],
    },
  },
  {
    name: "discord_search_messages",
    description: "Search messages in a channel by keyword (scans up to last 100 messages).",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        keyword: { type: "string" },
        limit: { type: "number", description: "Max messages to scan (default 100)." },
      },
      required: ["channel_id", "keyword"],
    },
  },
];

/**
 * Handles all message-related tools: read, send, reply, edit, react,
 * thread, bulk delete, embed, delete, pin/unpin, and keyword search.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_read_messages": {
      const channel = await getTextChannel(args.channel_id as string);
      const limit = Math.min(Number(args.limit ?? 20), 100);
      const messages = await channel.messages.fetch({ limit });
      const result = [...messages.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          id: m.id, author: m.author.tag, content: m.content,
          timestamp: m.createdAt.toISOString(), attachments: m.attachments.size, pinned: m.pinned,
        }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_send_message": {
      const channel = await getTextChannel(args.channel_id as string);
      const sent = await channel.send(args.content as string);
      return { content: [{ type: "text", text: `✅ Message sent (id: ${sent.id}) in #${channel.name}.` }] };
    }

    case "discord_reply_message": {
      const channel = await getTextChannel(args.channel_id as string);
      const target = await channel.messages.fetch(args.message_id as string);
      const sent = await target.reply(args.content as string);
      return { content: [{ type: "text", text: `✅ Reply sent (id: ${sent.id}) to message ${args.message_id} in #${channel.name}.` }] };
    }

    case "discord_edit_message": {
      const channel = await getTextChannel(args.channel_id as string);
      const msg = await channel.messages.fetch(args.message_id as string);
      if (msg.author.id !== discord.user?.id) throw new Error("Can only edit messages sent by the bot.");
      const edited = await msg.edit(args.content as string);
      return { content: [{ type: "text", text: `✅ Message ${edited.id} edited in #${channel.name}.` }] };
    }

    case "discord_add_reaction": {
      const channel = await getTextChannel(args.channel_id as string);
      const msg = await channel.messages.fetch(args.message_id as string);
      await msg.react(args.emoji as string);
      return { content: [{ type: "text", text: `✅ Reacted with ${args.emoji} to message ${msg.id} in #${channel.name}.` }] };
    }

    case "discord_create_thread": {
      const channel = await getTextChannel(args.channel_id as string);
      const duration = (args.auto_archive_duration as number) ?? 1440;
      if (args.message_id) {
        const msg = await channel.messages.fetch(args.message_id as string);
        const thread = await msg.startThread({
          name: args.name as string,
          autoArchiveDuration: duration as 60 | 1440 | 4320 | 10080,
        });
        return { content: [{ type: "text", text: `✅ Thread "${thread.name}" created from message (id: ${thread.id}).` }] };
      } else {
        const thread = await channel.threads.create({
          name: args.name as string,
          autoArchiveDuration: duration as 60 | 1440 | 4320 | 10080,
          type: ChannelType.PublicThread,
        });
        return { content: [{ type: "text", text: `✅ Thread "${thread.name}" created (id: ${thread.id}).` }] };
      }
    }

    case "discord_bulk_delete_messages": {
      const channel = await getTextChannel(args.channel_id as string);
      const count = Math.min(Math.max(Number(args.count ?? 2), 2), 100);
      const deleted = await channel.bulkDelete(count, true);
      return { content: [{ type: "text", text: `✅ Deleted ${deleted.size} messages in #${channel.name}.` }] };
    }

    case "discord_send_embed": {
      const channel = await getTextChannel(args.channel_id as string);
      const embed = new EmbedBuilder();
      if (args.title) embed.setTitle(args.title as string);
      if (args.description) embed.setDescription(args.description as string);
      if (args.color) embed.setColor(args.color as ColorResolvable);
      if (args.footer) embed.setFooter({ text: args.footer as string });
      if (args.image_url) embed.setImage(args.image_url as string);
      if (args.fields) {
        const fields = args.fields as { name: string; value: string; inline?: boolean }[];
        embed.addFields(fields.map((f) => ({ name: f.name, value: f.value, inline: f.inline ?? false })));
      }
      const sent = await channel.send({ embeds: [embed] });
      return { content: [{ type: "text", text: `✅ Embed sent (id: ${sent.id}) in #${channel.name}.` }] };
    }

    case "discord_delete_message": {
      const channel = await getTextChannel(args.channel_id as string);
      const msg = await channel.messages.fetch(args.message_id as string);
      await msg.delete();
      return { content: [{ type: "text", text: `✅ Message ${args.message_id} deleted.` }] };
    }

    case "discord_pin_message": {
      const channel = await getTextChannel(args.channel_id as string);
      const msg = await channel.messages.fetch(args.message_id as string);
      if (args.pin) { await msg.pin(); } else { await msg.unpin(); }
      return { content: [{ type: "text", text: `✅ Message ${args.pin ? "pinned" : "unpinned"}.` }] };
    }

    case "discord_search_messages": {
      const channel = await getTextChannel(args.channel_id as string);
      const limit = Math.min(Math.max(Number(args.limit ?? 100), 1), 100);
      const messages = await channel.messages.fetch({ limit });
      const keyword = (args.keyword as string).toLowerCase();
      const matches = [...messages.values()]
        .filter((m) => m.content.toLowerCase().includes(keyword))
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({ id: m.id, author: m.author.tag, content: m.content, timestamp: m.createdAt.toISOString() }));
      return { content: [{ type: "text", text: matches.length > 0 ? JSON.stringify(matches, null, 2) : `No messages found containing "${args.keyword}" in the last ${limit} messages.` }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
