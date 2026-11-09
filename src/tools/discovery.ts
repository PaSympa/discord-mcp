import { ChannelType, CategoryChannel, GuildChannel } from "discord.js";
import { z } from "zod";
import { discord, isGuildAllowed, isObfuscated } from "../client.js";
import { defineTool, defineModule, guildId, structured } from "./define.js";

const guildSummary = z.object({
  id: z.string(),
  name: z.string(),
  memberCount: z.number(),
  icon: z.string().nullable(),
});

const channelSummary = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
});

/** Tool definitions for server/guild discovery and channel navigation. */
const tools = [
  defineTool({
    name: "discord_list_guilds",
    description:
      "List every Discord server (guild) the bot is a member of (id, name, member count, icon). Takes no arguments. Read-only. Start here to discover the guild_id needed by most other tools.",
    annotations: { title: "List servers", readOnlyHint: true, openWorldHint: true },
    schema: z.object({}),
    outputSchema: z.object({ guilds: z.array(guildSummary) }),
    handle: async () => {
      const guilds = discord.guilds.cache
        .filter((g) => isGuildAllowed(g.id))
        .map((g) => ({
          id: g.id,
          name: g.name,
          memberCount: g.memberCount,
          icon: g.iconURL(),
        }));
      return structured({ guilds });
    },
  }),
  defineTool({
    name: "discord_get_guild_info",
    description:
      "Get details about one server: name, description, member/channel/role counts, boost tier, owner, and creation date. The owner field is a user ID. roleCount includes the @everyone role. Use discord_get_server_stats for a finer breakdown (humans vs bots, channel types).",
    annotations: { title: "Get server info", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      memberCount: z.number(),
      channelCount: z.number(),
      roleCount: z.number(),
      boostLevel: z.number(),
      boostCount: z.number().nullable(),
      createdAt: z.string(),
      owner: z.string(),
    }),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      return structured({
        id: guild.id,
        name: guild.name,
        description: guild.description,
        memberCount: guild.memberCount,
        channelCount: guild.channels.cache.size,
        roleCount: guild.roles.cache.size,
        boostLevel: guild.premiumTier,
        boostCount: guild.premiumSubscriptionCount,
        createdAt: guild.createdAt.toISOString(),
        owner: guild.ownerId,
      });
    },
  }),
  defineTool({
    name: "discord_list_channels",
    description:
      'List all channels in a server, grouped by their parent category and ordered by position. Returns a JSON object keyed by category name. Channels that Discord hides from the bot behind the placeholder name ___hidden___ are left out and counted in hiddenChannels, present only when above 0; a visible channel whose category is hidden is listed under "Hidden parent". Read-only. Use discord_find_channel_by_name to locate a specific channel.',
    annotations: { title: "List channels", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z
      .object({ hiddenChannels: z.number().optional() })
      .catchall(z.array(channelSummary)),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      await guild.channels.fetch();
      const visible = guild.channels.cache.filter((c) => !isObfuscated(c));
      const hiddenChannels = guild.channels.cache.size - visible.size;
      const categories = visible
        .filter((c) => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a as CategoryChannel).position - (b as CategoryChannel).position);

      const result: Record<string, unknown[]> = { "No Category": [] };
      categories.forEach((cat) => {
        result[cat.name] = [];
      });

      visible
        .filter((c) => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => (a as GuildChannel).position - (b as GuildChannel).position)
        .forEach((ch) => {
          const entry = { id: ch.id, name: ch.name, type: ChannelType[ch.type] };
          const parent = (ch as GuildChannel).parent;
          const parentName = !parent
            ? "No Category"
            : isObfuscated(parent)
              ? "Hidden parent"
              : parent.name;
          if (!result[parentName]) result[parentName] = [];
          result[parentName].push(entry);
        });

      return structured(hiddenChannels > 0 ? { ...result, hiddenChannels } : result);
    },
  }),
  defineTool({
    name: "discord_find_channel_by_name",
    description:
      "Find channels whose name contains a substring (case-insensitive). Returns { matches: [...], hiddenChannels } with the id, name and type of every match, active threads included. Channels that Discord hides from the bot behind the placeholder name ___hidden___ are left out of matches and counted in hiddenChannels. The list is empty when nothing matches, which does not prove the channel is absent while hiddenChannels is above 0. Useful for resolving a channel_id when you only know the channel's name. Use discord_list_channels to see every channel grouped by category.",
    annotations: { title: "Find channel by name", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      name: z.string().describe("Case-insensitive substring to match against channel names."),
    }),
    outputSchema: z.object({
      matches: z.array(channelSummary),
      hiddenChannels: z.number(),
      note: z.string().optional(),
    }),
    handle: async ({ guild_id, name }) => {
      const guild = await discord.guilds.fetch(guild_id);
      await guild.channels.fetch();
      const keyword = name.toLowerCase();
      const visible = guild.channels.cache.filter((c) => !isObfuscated(c));
      const hiddenChannels = guild.channels.cache.size - visible.size;
      const matches = visible
        .filter((c) => c.name.toLowerCase().includes(keyword))
        .map((c) => ({ id: c.id, name: c.name, type: ChannelType[c.type] }));
      return structured({
        matches,
        hiddenChannels,
        ...(hiddenChannels > 0 && {
          note: `${hiddenChannels} channel(s) are hidden from the bot and left out of matches, so a channel missing here may still exist. Grant the bot View Channel on it to find it.`,
        }),
      });
    },
  }),
];

export default defineModule(tools);
