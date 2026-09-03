import { z } from "zod";
import { discord, fetchChannelChecked, assertAllowedGuild } from "../client.js";
import { defineTool, defineModule, snowflake, guildId, intIn, structured } from "./define.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

const inviteSummary = z.object({
  code: z.string(),
  url: z.string(),
  guild_id: z.string().nullable(),
  guild_name: z.string().nullable(),
  channel_id: z.string().nullable(),
  channel_name: z.string().nullable(),
  inviter: z
    .object({
      id: z.string(),
      username: z.string(),
    })
    .nullable(),
  uses: z.number(),
  max_uses: z.number(),
  max_age: z.number(),
  temporary: z.boolean(),
  created_at: z.string().nullable(),
  expires_at: z.string().nullable(),
});

function serializeInvite(invite: import("discord.js").Invite) {
  return {
    code: invite.code,
    url: invite.url,
    guild_id: invite.guild?.id ?? null,
    guild_name: invite.guild?.name ?? null,
    channel_id: invite.channelId ?? null,
    channel_name: invite.channel?.name ?? null,
    inviter: invite.inviter ? { id: invite.inviter.id, username: invite.inviter.username } : null,
    uses: invite.uses ?? 0,
    max_uses: invite.maxUses ?? 0,
    max_age: invite.maxAge ?? 0,
    temporary: invite.temporary ?? false,
    created_at: invite.createdAt?.toISOString() ?? null,
    expires_at: invite.expiresAt?.toISOString() ?? null,
  };
}

/** Tool definitions for managing guild invites. */
const tools = [
  defineTool({
    name: "discord_list_invites",
    description:
      "List all active invites across a server (code, url, channel, inviter, uses, expiry). Requires the Manage Server permission. Read-only. Use discord_list_channel_invites to scope to one channel.",
    annotations: { title: "List invites", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({
      invites: z.array(inviteSummary),
    }),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const invites = await guild.invites.fetch();
      const list = [...invites.values()].map(serializeInvite);
      return structured({ invites: list });
    },
  }),
  defineTool({
    name: "discord_get_invite",
    description:
      "Look up a single invite by its code: target server and channel, inviter, and expiry. Works for any public invite, but this endpoint never returns usage counters (uses/max_uses/max_age read 0); use discord_list_invites or discord_list_channel_invites for real counters. Read-only. Returns a JSON object.",
    annotations: { title: "Get invite", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      invite_code: z
        .string()
        .describe(
          "The invite code, e.g. 'abc123'. A full discord.gg/abc123 URL is also accepted and stripped.",
        ),
    }),
    outputSchema: inviteSummary,
    handle: async ({ invite_code }) => {
      const code = invite_code.replace(/^(https?:\/\/)?(discord\.gg\/)?/, "");
      if (!code) throw new Error("invite_code is required.");
      const invite = await discord.fetchInvite(code);
      assertAllowedGuild(invite.guild?.id);
      return structured(serializeInvite(invite));
    },
  }),
  defineTool({
    name: "discord_create_invite",
    description:
      "Create an invite link for a channel, optionally limiting its lifetime, uses, and membership type. SECURITY: anyone with the returned link can join the server. Requires the Create Instant Invite permission. Returns the invite URL and code.",
    annotations: {
      title: "Create invite",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel the invite leads to."),
      max_age: intIn(0, 604800)
        .default(86400)
        .describe(
          "Invite lifetime in seconds, 0–604800 (7 days); 0 means it never expires. Default 86400 (24h).",
        ),
      max_uses: intIn(0, 100)
        .default(0)
        .describe("Maximum number of uses, 0–100; 0 means unlimited. Default 0."),
      unique: z
        .boolean()
        .optional()
        .describe(
          "If true, always mint a fresh invite instead of reusing an equivalent existing one. Default false.",
        ),
      temporary: z
        .boolean()
        .optional()
        .describe(
          "If true, members who join via this invite are removed when they disconnect (unless they get a role). Default false.",
        ),
    }),
    handle: async ({ channel_id, max_age, max_uses, unique, temporary }) => {
      const channel = await fetchChannelChecked(channel_id);
      if (!channel || !("createInvite" in channel)) {
        throw new Error(`Channel ${channel_id} does not support invites.`);
      }
      const invite = await channel.createInvite({
        maxAge: max_age,
        maxUses: max_uses,
        unique: unique ?? false,
        temporary: temporary ?? false,
      });
      return {
        content: [
          {
            type: "text",
            text: `✅ Invite created: ${invite.url} (code: ${invite.code}, max_age: ${invite.maxAge}s, max_uses: ${invite.maxUses}).`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_delete_invite",
    description:
      "Revoke an invite by its code so it can no longer be used. IRREVERSIBLE (the code is freed). Requires the Manage Channels permission (or Manage Server). The reason is recorded in the audit log.",
    annotations: {
      title: "Delete invite",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      invite_code: z
        .string()
        .describe("The invite code to revoke. A full discord.gg/<code> URL is also accepted."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
    }),
    handle: async ({ invite_code, reason }) => {
      const code = invite_code.replace(/^(https?:\/\/)?(discord\.gg\/)?/, "");
      if (!code) throw new Error("invite_code is required.");
      const invite = await discord.fetchInvite(code);
      assertAllowedGuild(invite.guild?.id);
      await invite.delete(reason);
      return {
        content: [{ type: "text", text: `✅ Invite "${code}" deleted.` }],
      };
    },
  }),
  defineTool({
    name: "discord_list_channel_invites",
    description:
      "List the active invites that point to one specific channel. Unlike discord_list_invites (server-wide), this scopes results to a single channel. Requires the Manage Channels permission. Read-only.",
    annotations: { title: "List channel invites", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to list invites for."),
    }),
    outputSchema: z.object({
      invites: z.array(inviteSummary),
    }),
    handle: async ({ channel_id }) => {
      const channel = await fetchChannelChecked(channel_id);
      if (!channel || !("fetchInvites" in channel)) {
        throw new Error(`Channel ${channel_id} does not support invites.`);
      }
      const invites = await channel.fetchInvites();
      const list = [...invites.values()].map(serializeInvite);
      return structured({ invites: list });
    },
  }),
];

export default defineModule(tools);
