import { z } from "zod";
import { discord } from "../client.js";
import { buildEmbed, embedFieldsShape } from "../embeds.js";
import { defineTool, defineModule, snowflake, intIn, structured } from "./define.js";

const userId = snowflake.describe("Discord user ID (snowflake) of the DM recipient.");
const messageId = snowflake.describe("ID of the target message within the DM conversation.");

/** Tool definitions for direct messages. */
const tools = [
  defineTool({
    name: "discord_send_dm",
    description:
      "Send a private direct message to a user by their user ID. Use discord_send_message to post in a server channel instead. Requires the bot to share at least one server with the user, and the user must allow DMs from server members (otherwise Discord rejects the send). Returns the new message ID.",
    annotations: {
      title: "Send DM",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      user_id: userId,
      content: z.string().describe("Plain-text body of the DM (max 2000 characters)."),
    }),
    handle: async ({ user_id, content }) => {
      const user = await discord.users.fetch(user_id);
      const sent = await user.send(content);
      return {
        content: [
          { type: "text", text: `✅ DM sent to ${user.username} (message id: ${sent.id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_send_dm_embed",
    description:
      "Send a rich embed as a private direct message to a user. Use discord_send_dm for plain text, or discord_send_embed to post an embed in a channel. Requires the bot to share a server with the user, and the user must allow DMs from server members. Returns the new message ID.",
    annotations: {
      title: "Send DM embed",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      user_id: userId,
      content: z.string().optional().describe("Optional plain text shown above the embed."),
      ...embedFieldsShape,
    }),
    handle: async ({ user_id, content, ...embedArgs }) => {
      const user = await discord.users.fetch(user_id);
      const sent = await user.send({
        content: content || undefined,
        embeds: [buildEmbed(embedArgs)],
      });
      return {
        content: [
          { type: "text", text: `✅ DM embed sent to ${user.username} (message id: ${sent.id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_edit_dm",
    description:
      "Edit the text content of a DM message previously sent by this bot. Only the bot's own DM messages can be edited. Use discord_edit_dm_embed for embed messages. Returns a confirmation.",
    annotations: {
      title: "Edit DM",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      user_id: userId,
      message_id: messageId,
      content: z
        .string()
        .describe(
          "New plain-text content that fully replaces the existing message (max 2000 characters).",
        ),
    }),
    handle: async ({ user_id, message_id, content }) => {
      const user = await discord.users.fetch(user_id);
      const dm = await user.createDM();
      const msg = await dm.messages.fetch({ message: message_id, cache: false });
      if (msg.author.id !== discord.user?.id)
        throw new Error("Can only edit messages sent by the bot.");
      await msg.edit(content);
      return {
        content: [
          { type: "text", text: `✅ DM message ${message_id} edited for ${user.username}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_edit_dm_embed",
    description:
      "Replace the embed on a DM message previously sent by this bot. Only the bot's own messages can be edited. Full replace, not merge: provided fields are applied and omitted fields are dropped. Returns a confirmation.",
    annotations: {
      title: "Edit DM embed",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      user_id: userId,
      message_id: messageId,
      content: z.string().optional().describe("Optional new plain text shown above the embed."),
      ...embedFieldsShape,
    }),
    handle: async ({ user_id, message_id, content, ...embedArgs }) => {
      const user = await discord.users.fetch(user_id);
      const dm = await user.createDM();
      const msg = await dm.messages.fetch({ message: message_id, cache: false });
      if (msg.author.id !== discord.user?.id)
        throw new Error("Can only edit embeds sent by the bot.");
      await msg.edit({
        content: content || undefined,
        embeds: [buildEmbed(embedArgs)],
      });
      return {
        content: [
          {
            type: "text",
            text: `✅ DM embed edited on message ${message_id} for ${user.username}.`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_delete_dm",
    description:
      "Permanently delete a DM message previously sent by this bot. IRREVERSIBLE. The bot can only delete its own DM messages, not the recipient's. Returns a confirmation.",
    annotations: {
      title: "Delete DM",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      user_id: userId,
      message_id: messageId,
    }),
    handle: async ({ user_id, message_id }) => {
      const user = await discord.users.fetch(user_id);
      const dm = await user.createDM();
      const msg = await dm.messages.fetch({ message: message_id, cache: false });
      if (msg.author.id !== discord.user?.id)
        throw new Error("Can only delete messages sent by the bot.");
      await msg.delete();
      return {
        content: [
          { type: "text", text: `✅ DM message ${message_id} deleted for ${user.username}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_read_dms",
    description:
      "Read the most recent messages from the bot's DM conversation with a user, oldest-to-newest. Returns { messages: [...] } with id, author, content, embed count, timestamp. Read-only.",
    annotations: { title: "Read DMs", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      user_id: userId,
      limit: intIn(1, 100)
        .default(20)
        .describe("How many recent messages to fetch (1–100). Default 20."),
    }),
    outputSchema: z.object({
      messages: z.array(
        z.object({
          id: z.string(),
          author: z.string(),
          content: z.string(),
          embeds: z.number(),
          timestamp: z.string(),
        }),
      ),
    }),
    handle: async ({ user_id, limit }) => {
      const user = await discord.users.fetch(user_id);
      const dm = await user.createDM();
      const messages = await dm.messages.fetch({ limit, cache: false });
      const result = [...messages.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map((m) => ({
          id: m.id,
          author: m.author.username,
          content: m.content,
          embeds: m.embeds.length,
          timestamp: m.createdAt.toISOString(),
        }));
      return structured({ messages: result });
    },
  }),
  defineTool({
    name: "discord_reply_dm",
    description:
      "Reply to a specific message in a DM, attaching a quoted reply reference. Unlike the edit/delete DM tools, this works on any message in the conversation (the bot's or the user's). Use discord_send_dm for a standalone DM with no reference. Returns the new reply's message ID.",
    annotations: {
      title: "Reply to DM",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      user_id: userId,
      message_id: messageId,
      content: z.string().describe("Plain-text body of the reply (max 2000 characters)."),
    }),
    handle: async ({ user_id, message_id, content }) => {
      const user = await discord.users.fetch(user_id);
      const dm = await user.createDM();
      const target = await dm.messages.fetch({ message: message_id, cache: false });
      const sent = await target.reply(content);
      return {
        content: [
          { type: "text", text: `✅ DM reply sent to ${user.username} (message id: ${sent.id}).` },
        ],
      };
    },
  }),
];

export default defineModule(tools);
