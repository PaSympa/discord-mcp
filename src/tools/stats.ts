import { ChannelType } from "discord.js";
import { z } from "zod";
import { discord } from "../client.js";
import { defineModule, defineTool, guildId, structured } from "./define.js";

/** Tool definitions for server statistics (members, channels, boosts). */
const tools = [
  defineTool({
    name: "discord_get_server_stats",
    description:
      "Get a snapshot of server metrics: total members (humans vs cached bots), channel breakdown (text/voice/category), role count, boost tier and count, and creation date. Read-only. Returns a JSON object. Note: bots are counted from the member cache only, so botsInCache is a lower bound and humans (total minus cached bots) an upper bound.",
    annotations: { title: "Get server stats", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({
      name: z.string(),
      totalMembers: z.number(),
      humans: z.number(),
      botsInCache: z.number(),
      channels: z.object({
        total: z.number(),
        text: z.number(),
        voice: z.number(),
        categories: z.number(),
      }),
      roles: z.number(),
      boostLevel: z.number(),
      boostCount: z.number(),
      createdAt: z.string(),
    }),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      await guild.channels.fetch();
      const cachedBots = guild.members.cache.filter((m) => m.user.bot).size;
      return structured({
        name: guild.name,
        totalMembers: guild.memberCount,
        humans: guild.memberCount - cachedBots,
        botsInCache: cachedBots,
        channels: {
          total: guild.channels.cache.size,
          text: guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).size,
          voice: guild.channels.cache.filter((c) => c.type === ChannelType.GuildVoice).size,
          categories: guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size,
        },
        roles: guild.roles.cache.size - 1 /* excludes @everyone */,
        boostLevel: guild.premiumTier,
        boostCount: guild.premiumSubscriptionCount ?? 0,
        createdAt: guild.createdAt.toISOString(),
      });
    },
  }),
];

export default defineModule(tools);
