import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for managing guild invites. */
export const definitions = [
  {
    name: "discord_list_invites",
    description: "List all active invites in a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_get_invite",
    description: "Get details about a specific invite by its code.",
    inputSchema: {
      type: "object",
      properties: {
        invite_code: {
          type: "string",
          description: "The invite code (e.g. 'abc123' from discord.gg/abc123).",
        },
      },
      required: ["invite_code"],
    },
  },
  {
    name: "discord_create_invite",
    description: "Create an invite link for a channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        max_age: {
          type: "number",
          description: "Invite duration in seconds (0 = never expires). Default 86400 (24h).",
        },
        max_uses: {
          type: "number",
          description: "Max number of uses (0 = unlimited). Default 0.",
        },
        unique: {
          type: "boolean",
          description: "If true, create a new unique invite even if one exists. Default false.",
        },
        temporary: {
          type: "boolean",
          description: "If true, members joined via this invite are kicked when they disconnect. Default false.",
        },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "discord_delete_invite",
    description: "Delete (revoke) an invite by its code.",
    inputSchema: {
      type: "object",
      properties: {
        invite_code: {
          type: "string",
          description: "The invite code to revoke.",
        },
        reason: { type: "string" },
      },
      required: ["invite_code"],
    },
  },
  {
    name: "discord_list_channel_invites",
    description: "List all active invites for a specific channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
      },
      required: ["channel_id"],
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

function serializeInvite(invite: import("discord.js").Invite) {
  return {
    code: invite.code,
    url: invite.url,
    channel_id: invite.channelId ?? null,
    channel_name: invite.channel?.name ?? null,
    inviter: invite.inviter
      ? { id: invite.inviter.id, username: invite.inviter.username }
      : null,
    uses: invite.uses ?? 0,
    max_uses: invite.maxUses ?? 0,
    max_age: invite.maxAge ?? 0,
    temporary: invite.temporary ?? false,
    created_at: invite.createdAt?.toISOString() ?? null,
    expires_at: invite.expiresAt?.toISOString() ?? null,
  };
}

// ─── Handler ────────────────────────────────────────────────────────────────────

export async function handle(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult | null> {
  switch (name) {
    case "discord_list_invites": {
      const guildId = validateId(args.guild_id, "guild_id");
      const guild = await discord.guilds.fetch(guildId);
      const invites = await guild.invites.fetch();
      const list = [...invites.values()].map(serializeInvite);
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
    }

    case "discord_get_invite": {
      const code = String(args.invite_code ?? "").replace(/^(https?:\/\/)?(discord\.gg\/)?/, "");
      if (!code) throw new Error("invite_code is required.");
      const invite = await discord.fetchInvite(code);
      return { content: [{ type: "text", text: JSON.stringify(serializeInvite(invite), null, 2) }] };
    }

    case "discord_create_invite": {
      const channelId = validateId(args.channel_id, "channel_id");
      const channel = await discord.channels.fetch(channelId);
      if (!channel || !("createInvite" in channel)) {
        throw new Error(`Channel ${channelId} does not support invites.`);
      }

      const invite = await (channel as any).createInvite({
        maxAge: Number(args.max_age ?? 86400),
        maxUses: Number(args.max_uses ?? 0),
        unique: Boolean(args.unique ?? false),
        temporary: Boolean(args.temporary ?? false),
      });
      return {
        content: [{ type: "text", text: `✅ Invite created: ${invite.url} (code: ${invite.code}, max_age: ${invite.maxAge}s, max_uses: ${invite.maxUses}).` }],
      };
    }

    case "discord_delete_invite": {
      const code = String(args.invite_code ?? "").replace(/^(https?:\/\/)?(discord\.gg\/)?/, "");
      if (!code) throw new Error("invite_code is required.");
      const invite = await discord.fetchInvite(code);
      await invite.delete(args.reason ? String(args.reason) : undefined);
      return {
        content: [{ type: "text", text: `✅ Invite "${code}" deleted.` }],
      };
    }

    case "discord_list_channel_invites": {
      const channelId = validateId(args.channel_id, "channel_id");
      const channel = await discord.channels.fetch(channelId);
      if (!channel || !("fetchInvites" in channel)) {
        throw new Error(`Channel ${channelId} does not support invites.`);
      }
      const invites = await (channel as any).fetchInvites();
      const list = [...invites.values()].map(serializeInvite);
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
