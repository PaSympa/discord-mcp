import { WebhookClient } from "discord.js";
import { z } from "zod";
import { discord, fetchChannelChecked, assertAllowedGuild, allowListActive } from "../client.js";
import { buildEmbed, embedArraySchema } from "../embeds.js";
import { defineTool, defineModule, snowflake, guildId, httpUrl, structured } from "./define.js";

const webhookId = snowflake.describe("ID (snowflake) of the webhook.");
const webhookToken = z.string().describe("Secret token of the webhook.");
const messageId = snowflake.describe("ID of the webhook message.");

const webhookSummary = z.object({
  id: z.string(),
  name: z.string().nullable(),
  channel_id: z.string(),
  token: z.string().nullable(),
  creator: z.string().nullable(),
});

/** Tool definitions for managing webhooks and webhook-sent messages. */
const tools = [
  defineTool({
    name: "discord_create_webhook",
    description:
      "Create a webhook on a channel and return its ID and token. SECURITY: the returned token grants anyone the ability to post as this webhook without authentication; treat it as a secret. Requires the Manage Webhooks permission. Use the returned id+token with discord_send_webhook_message.",
    annotations: {
      title: "Create webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to attach the webhook to."),
      name: z.string().describe("Display name for the webhook (max 80 characters)."),
      avatar: httpUrl.optional().describe("Optional avatar image URL for the webhook."),
    }),
    handle: async ({ channel_id, name, avatar }) => {
      const channel = await fetchChannelChecked(channel_id);
      if (!channel || !("createWebhook" in channel))
        throw new Error("Channel does not support webhooks.");
      const webhook = await channel.createWebhook({ name, avatar: avatar ?? undefined });
      return {
        content: [
          {
            type: "text",
            text: `✅ Webhook "${webhook.name}" created (id: ${webhook.id}, token: ${webhook.token}).`,
          },
        ],
      };
    },
  }),

  defineTool({
    name: "discord_send_webhook_message",
    description:
      "Send a message through a webhook using its ID and token (no bot permissions needed; the token authorizes the send). Supports per-message username/avatar overrides and up to 10 embeds. At least one of content or embeds is required. Returns the new message ID.",
    annotations: {
      title: "Send webhook message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      webhook_id: webhookId.describe("ID (snowflake) of the webhook to send through."),
      webhook_token: webhookToken.describe(
        "Secret token of the webhook (from discord_create_webhook or discord_list_webhooks).",
      ),
      content: z
        .string()
        .optional()
        .describe(
          "Plain-text body of the message (max 2000 characters). Optional if embeds are provided.",
        ),
      username: z
        .string()
        .optional()
        .describe("Override the webhook's default display name for this message."),
      avatar_url: httpUrl
        .optional()
        .describe("Override the webhook's default avatar for this message."),
      embeds: embedArraySchema
        .optional()
        .describe("Up to 10 embed objects to attach to the webhook message."),
    }),
    handle: async ({ webhook_id, webhook_token, content, username, avatar_url, embeds }) => {
      if (!webhook_token) throw new Error("webhook_token is required.");
      if (allowListActive()) {
        const guildOfWebhook = (await discord.fetchWebhook(webhook_id, webhook_token)).guildId;
        if (!guildOfWebhook)
          throw new Error(
            "Webhook has no resolvable guild; refused while DISCORD_ALLOWED_GUILDS is active.",
          );
        assertAllowedGuild(guildOfWebhook);
      }
      const client = new WebhookClient({ id: webhook_id, token: webhook_token });
      try {
        const sendOptions: Record<string, unknown> = {};
        if (content) sendOptions.content = content;
        if (username) sendOptions.username = username;
        if (avatar_url) sendOptions.avatarURL = avatar_url;
        if (embeds) sendOptions.embeds = embeds.map((e) => buildEmbed(e));
        if (!sendOptions.content && !sendOptions.embeds) {
          throw new Error("At least one of content or embeds is required.");
        }
        const sent = await client.send(sendOptions);
        return { content: [{ type: "text", text: `✅ Webhook message sent (id: ${sent.id}).` }] };
      } finally {
        client.destroy();
      }
    },
  }),

  defineTool({
    name: "discord_edit_webhook",
    description:
      "Update a webhook's name, avatar, or the channel it posts to. Only provided fields change. Requires the Manage Webhooks permission. Returns a confirmation.",
    annotations: {
      title: "Edit webhook",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      webhook_id: webhookId.describe("ID (snowflake) of the webhook to edit."),
      name: z.string().optional().describe("New display name for the webhook (max 80 characters)."),
      avatar: httpUrl.optional().describe("New avatar image URL for the webhook."),
      channel_id: snowflake
        .optional()
        .describe("ID (snowflake) of a channel to move the webhook to."),
    }),
    handle: async ({ webhook_id, name, avatar, channel_id }) => {
      const webhook = await discord.fetchWebhook(webhook_id);
      assertAllowedGuild(webhook.guildId);
      const editOptions: Record<string, unknown> = {};
      if (name !== undefined) editOptions.name = name;
      if (avatar !== undefined) editOptions.avatar = avatar;
      if (channel_id !== undefined) editOptions.channel = channel_id;
      await webhook.edit(editOptions);
      return {
        content: [
          { type: "text", text: `✅ Webhook "${webhook.name}" (id: ${webhook.id}) updated.` },
        ],
      };
    },
  }),

  defineTool({
    name: "discord_delete_webhook",
    description:
      "Permanently delete a webhook by its ID, invalidating its token. IRREVERSIBLE: any integrations using the old token will stop working. Requires the Manage Webhooks permission.",
    annotations: {
      title: "Delete webhook",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      webhook_id: webhookId.describe("ID (snowflake) of the webhook to delete."),
    }),
    handle: async ({ webhook_id }) => {
      const webhook = await discord.fetchWebhook(webhook_id);
      assertAllowedGuild(webhook.guildId);
      const webhookName = webhook.name;
      await webhook.delete();
      return {
        content: [
          { type: "text", text: `✅ Webhook "${webhookName}" (id: ${webhook_id}) deleted.` },
        ],
      };
    },
  }),

  defineTool({
    name: "discord_list_webhooks",
    description:
      "List the webhooks in a single channel or across a whole server (id, name, channel, token when visible, creator). Provide exactly one of channel_id or guild_id. Requires the Manage Webhooks permission. Read-only.",
    annotations: { title: "List webhooks", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: snowflake
        .optional()
        .describe(
          "ID (snowflake) of a channel to list webhooks for. Mutually exclusive with guild_id.",
        ),
      guild_id: guildId
        .optional()
        .describe(
          "Discord server (guild) ID (snowflake) to list all webhooks for. Mutually exclusive with channel_id.",
        ),
    }),
    outputSchema: z.object({ webhooks: z.array(webhookSummary) }),
    handle: async ({ channel_id, guild_id }) => {
      if (channel_id) {
        const channel = await fetchChannelChecked(channel_id);
        if (!channel || !("fetchWebhooks" in channel))
          throw new Error("Channel does not support webhooks.");
        const webhooks = await channel.fetchWebhooks();
        const result = [...webhooks.values()].map((w) => ({
          id: w.id,
          name: w.name,
          channel_id: w.channelId,
          token: w.token ?? null,
          creator: w.owner && "tag" in w.owner ? w.owner.tag : (w.owner?.username ?? null),
        }));
        return structured({ webhooks: result });
      } else if (guild_id) {
        const guild = await discord.guilds.fetch(guild_id);
        const webhooks = await guild.fetchWebhooks();
        const result = [...webhooks.values()].map((w) => ({
          id: w.id,
          name: w.name,
          channel_id: w.channelId,
          token: w.token ?? null,
          creator: w.owner && "tag" in w.owner ? w.owner.tag : (w.owner?.username ?? null),
        }));
        return structured({ webhooks: result });
      } else {
        throw new Error("Either channel_id or guild_id is required.");
      }
    },
  }),

  defineTool({
    name: "discord_edit_webhook_message",
    description:
      "Edit a message previously sent through a webhook, using the webhook's ID and token. Replaces the provided fields. Requires the original webhook token. Returns a confirmation.",
    annotations: {
      title: "Edit webhook message",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      webhook_id: webhookId.describe("ID (snowflake) of the webhook that sent the message."),
      webhook_token: webhookToken.describe("Secret token of the webhook."),
      message_id: messageId.describe("ID of the webhook message to edit."),
      content: z
        .string()
        .optional()
        .describe("New plain-text content for the message (max 2000 characters)."),
      embeds: embedArraySchema
        .optional()
        .describe("Up to 10 embed objects to attach to the webhook message."),
    }),
    handle: async ({ webhook_id, webhook_token, message_id, content, embeds }) => {
      if (!webhook_token) throw new Error("webhook_token is required.");
      if (allowListActive()) {
        const guildOfWebhook = (await discord.fetchWebhook(webhook_id, webhook_token)).guildId;
        if (!guildOfWebhook)
          throw new Error(
            "Webhook has no resolvable guild; refused while DISCORD_ALLOWED_GUILDS is active.",
          );
        assertAllowedGuild(guildOfWebhook);
      }
      const client = new WebhookClient({ id: webhook_id, token: webhook_token });
      try {
        const editOptions: Record<string, unknown> = {};
        if (content !== undefined) editOptions.content = content;
        if (embeds) editOptions.embeds = embeds.map((e) => buildEmbed(e));
        await client.editMessage(message_id, editOptions);
        return { content: [{ type: "text", text: `✅ Webhook message ${message_id} edited.` }] };
      } finally {
        client.destroy();
      }
    },
  }),

  defineTool({
    name: "discord_delete_webhook_message",
    description:
      "Permanently delete a message that was sent through a webhook, using the webhook's ID and token. IRREVERSIBLE. Requires the original webhook token.",
    annotations: {
      title: "Delete webhook message",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      webhook_id: webhookId.describe("ID (snowflake) of the webhook that sent the message."),
      webhook_token: webhookToken.describe("Secret token of the webhook."),
      message_id: messageId.describe("ID of the webhook message to delete."),
    }),
    handle: async ({ webhook_id, webhook_token, message_id }) => {
      if (!webhook_token) throw new Error("webhook_token is required.");
      if (allowListActive()) {
        const guildOfWebhook = (await discord.fetchWebhook(webhook_id, webhook_token)).guildId;
        if (!guildOfWebhook)
          throw new Error(
            "Webhook has no resolvable guild; refused while DISCORD_ALLOWED_GUILDS is active.",
          );
        assertAllowedGuild(guildOfWebhook);
      }
      const client = new WebhookClient({ id: webhook_id, token: webhook_token });
      try {
        await client.deleteMessage(message_id);
        return { content: [{ type: "text", text: `✅ Webhook message ${message_id} deleted.` }] };
      } finally {
        client.destroy();
      }
    },
  }),

  defineTool({
    name: "discord_fetch_webhook_message",
    description:
      "Fetch a single message sent through a webhook (id, content, embed count, timestamp), using the webhook's ID and token. Read-only. Requires the original webhook token.",
    annotations: { title: "Fetch webhook message", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      webhook_id: webhookId.describe("ID (snowflake) of the webhook that sent the message."),
      webhook_token: webhookToken.describe("Secret token of the webhook."),
      message_id: messageId.describe("ID of the webhook message to fetch."),
    }),
    outputSchema: z.object({
      id: z.string(),
      content: z.string(),
      embeds: z.number(),
      timestamp: z.string(),
    }),
    handle: async ({ webhook_id, webhook_token, message_id }) => {
      if (!webhook_token) throw new Error("webhook_token is required.");
      if (allowListActive()) {
        const guildOfWebhook = (await discord.fetchWebhook(webhook_id, webhook_token)).guildId;
        if (!guildOfWebhook)
          throw new Error(
            "Webhook has no resolvable guild; refused while DISCORD_ALLOWED_GUILDS is active.",
          );
        assertAllowedGuild(guildOfWebhook);
      }
      const client = new WebhookClient({ id: webhook_id, token: webhook_token });
      try {
        const msg = await client.fetchMessage(message_id);
        return structured({
          id: msg.id,
          content: msg.content,
          embeds: msg.embeds.length,
          timestamp: msg.timestamp,
        });
      } finally {
        client.destroy();
      }
    },
  }),
];

export default defineModule(tools);
