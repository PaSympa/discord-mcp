import { ChannelType } from "discord.js";
import { discord, getGuildChannel, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for creating, deleting, editing, moving, and cloning channels. */
export const definitions = [
  {
    name: "discord_create_channel",
    description: "Create a text, voice channel or category in a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        name: { type: "string" },
        type: { type: "string", enum: ["text", "voice", "category"], description: "Defaults to 'text'." },
        topic: { type: "string" },
        category_id: { type: "string" },
      },
      required: ["guild_id", "name"],
    },
  },
  {
    name: "discord_delete_channel",
    description: "Delete a channel.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "discord_edit_channel",
    description: "Edit a channel's name, topic (text only) or slowmode (text only).",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        name: { type: "string" },
        topic: { type: "string" },
        slowmode: { type: "number", description: "Slowmode in seconds (0 to disable)." },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "discord_move_channel",
    description: "Move a channel into a category (or remove from category if category_id is omitted).",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        category_id: { type: "string" },
      },
      required: ["channel_id"],
    },
  },
  {
    name: "discord_clone_channel",
    description: "Clone a channel with its name, topic and permission overwrites.",
    inputSchema: {
      type: "object",
      properties: {
        channel_id: { type: "string" },
        new_name: { type: "string" },
      },
      required: ["channel_id"],
    },
  },
];

/**
 * Handles channel management tools: create (text/voice/category),
 * delete, edit (name/topic/slowmode), move between categories, and clone.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_create_channel": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      const typeMap: Record<string, ChannelType> = {
        text: ChannelType.GuildText, voice: ChannelType.GuildVoice, category: ChannelType.GuildCategory,
      };
      const channelType = typeMap[(args.type as string) ?? "text"] ?? ChannelType.GuildText;
      const created = await guild.channels.create({
        name: args.name as string, type: channelType as ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildCategory,
        topic: channelType === ChannelType.GuildText ? (args.topic as string | undefined) : undefined,
        parent: args.category_id as string | undefined,
      });
      return { content: [{ type: "text", text: `✅ Channel #${created.name} created (id: ${created.id}).` }] };
    }

    case "discord_delete_channel": {
      const channel = await discord.channels.fetch(args.channel_id as string);
      if (!channel) throw new Error("Channel not found.");
      const channelName = "name" in channel ? channel.name : channel.id;
      await channel.delete(args.reason as string | undefined);
      return { content: [{ type: "text", text: `✅ Channel #${channelName} deleted.` }] };
    }

    case "discord_edit_channel": {
      const channel = await getGuildChannel(args.channel_id as string);
      const editOptions: Record<string, unknown> = {};
      if (args.name !== undefined) editOptions.name = args.name as string;
      if (args.topic !== undefined && channel.type === ChannelType.GuildText) editOptions.topic = args.topic as string;
      if (args.slowmode !== undefined && channel.type === ChannelType.GuildText) editOptions.rateLimitPerUser = args.slowmode as number;
      await channel.edit(editOptions);
      return { content: [{ type: "text", text: `✅ Channel #${channel.name} updated.` }] };
    }

    case "discord_move_channel": {
      const channel = await getGuildChannel(args.channel_id as string);
      await channel.edit({ parent: (args.category_id as string | undefined) ?? null });
      return { content: [{ type: "text", text: `✅ Channel #${channel.name} moved.` }] };
    }

    case "discord_clone_channel": {
      const channel = await getGuildChannel(args.channel_id as string);
      const cloned = await channel.clone({ name: args.new_name as string | undefined });
      return { content: [{ type: "text", text: `✅ Channel cloned as #${cloned.name} (id: ${cloned.id}).` }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
