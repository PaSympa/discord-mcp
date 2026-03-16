import { ChannelType, CategoryChannel, GuildChannel } from "discord.js";
import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for server/guild discovery and channel navigation. */
export const definitions = [
  {
    name: "discord_list_guilds",
    description: "List all Discord servers the bot is connected to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "discord_get_guild_info",
    description: "Get detailed info about a guild: name, member count, channels, roles, boosts.",
    inputSchema: {
      type: "object",
      properties: { guild_id: { type: "string" } },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_list_channels",
    description: "List all channels in a guild grouped by category.",
    inputSchema: {
      type: "object",
      properties: { guild_id: { type: "string" } },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_find_channel_by_name",
    description: "Find a channel by name in a guild (partial match supported).",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        name: { type: "string" },
      },
      required: ["guild_id", "name"],
    },
  },
];

/**
 * Handles discovery tools: listing guilds, fetching guild info,
 * listing channels by category, and searching channels by name.
 */
export async function handle(name: string, args: Record<string, unknown>): Promise<ToolResult | null> {
  switch (name) {
    case "discord_list_guilds": {
      const guilds = discord.guilds.cache.map((g) => ({
        id: g.id, name: g.name, memberCount: g.memberCount, icon: g.iconURL(),
      }));
      return { content: [{ type: "text", text: JSON.stringify(guilds, null, 2) }] };
    }

    case "discord_get_guild_info": {
      const guild = await (await discord.guilds.fetch(validateId(args.guild_id, "guild_id"))).fetch();
      return {
        content: [{
          type: "text", text: JSON.stringify({
            id: guild.id, name: guild.name, description: guild.description,
            memberCount: guild.memberCount, channelCount: guild.channels.cache.size,
            roleCount: guild.roles.cache.size, boostLevel: guild.premiumTier,
            boostCount: guild.premiumSubscriptionCount, createdAt: guild.createdAt, owner: guild.ownerId,
          }, null, 2),
        }],
      };
    }

    case "discord_list_channels": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      await guild.channels.fetch();
      const categories = guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a as CategoryChannel).position - (b as CategoryChannel).position);

      const result: Record<string, unknown[]> = { "No Category": [] };
      categories.forEach((cat) => { result[cat.name] = []; });

      guild.channels.cache
        .filter((c) => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => (a as GuildChannel).position - (b as GuildChannel).position)
        .forEach((ch) => {
          const entry = { id: ch.id, name: ch.name, type: ChannelType[ch.type] };
          const parentName = (ch as GuildChannel).parent?.name ?? "No Category";
          if (!result[parentName]) result[parentName] = [];
          result[parentName].push(entry);
        });

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }

    case "discord_find_channel_by_name": {
      const guild = await discord.guilds.fetch(validateId(args.guild_id, "guild_id"));
      await guild.channels.fetch();
      const keyword = (args.name as string).toLowerCase();
      const matches = guild.channels.cache
        .filter((c) => c.name.toLowerCase().includes(keyword))
        .map((c) => ({ id: c.id, name: c.name, type: ChannelType[c.type] }));
      return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
