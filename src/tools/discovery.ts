import {
  ChannelFlagsBitField,
  ChannelType,
  Collection,
  Routes,
  type CategoryChannel,
  type Guild,
  type GuildBasedChannel,
  type GuildChannel,
} from "discord.js";
import { z } from "zod";
import { discord, isGuildAllowed, isObfuscated, splitObfuscated } from "../client.js";
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

const NO_CATEGORY = "No Category";
const HIDDEN_PARENT = "Hidden parent";

/**
 * Keys list_channels by category name, adding the ID to a name that another category or
 * a pseudo key also uses, so two categories never merge under one key.
 */
function categoryKey(categories: Iterable<{ name: string }>) {
  const uses = new Map([
    [NO_CATEGORY, 1],
    [HIDDEN_PARENT, 1],
  ]);
  for (const { name } of categories) uses.set(name, (uses.get(name) ?? 0) + 1);
  return ({ id, name }: { id: string; name: string }) =>
    (uses.get(name) ?? 0) > 1 ? `${name} (${id})` : name;
}

/** A channel whose type discord.js does not know, read from Discord's raw channel list. */
interface UnknownTypeChannel {
  id: string;
  name: string;
  type: string;
  position: number;
  parentId: string | null;
  flags: ChannelFlagsBitField;
}

/**
 * Refreshes the guild's channel cache and returns the channels discord.js leaves out of it,
 * those of a type it does not know, which its fetch maps to null. Only when there are some
 * is the channel list read a second time, raw, for their names and parents.
 */
async function fetchUnknownTypeChannels(guild: Guild): Promise<UnknownTypeChannel[]> {
  const fetched = await guild.channels.fetch();
  if (!fetched.some((c) => c === null)) return [];
  const raw = (await discord.rest.get(Routes.guildChannels(guild.id))) as {
    id: string;
    type: number;
    name?: string | null;
    position?: number;
    parent_id?: string | null;
    flags?: number;
  }[];
  return raw
    .filter((c) => fetched.get(c.id) === null)
    .map((c) => ({
      id: c.id,
      name: c.name ?? "",
      type: `Unknown(${c.type})`,
      position: c.position ?? 0,
      parentId: c.parent_id ?? null,
      flags: new ChannelFlagsBitField(c.flags ?? 0),
    }))
    .sort((a, b) => a.position - b.position || Number(BigInt(a.id) - BigInt(b.id)));
}

/** Tool definitions for server/guild discovery and channel navigation. */
const tools = [
  defineTool({
    name: "discord_list_guilds",
    description:
      "List the Discord servers (guilds) the bot is a member of (id, name, member count, icon). When DISCORD_ALLOWED_GUILDS is set, only those servers are listed. With DISCORD_GUILD_MEMBERS=false, the member count is not updated after the bot connects. Takes no arguments. Read-only. Start here to discover the guild_id needed by most other tools.",
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
      "Get details about one server: name, description, member/channel/role counts, boost tier, owner, and creation date. The owner field is a user ID. roleCount includes the @everyone role. channelCount also counts the threads in the bot's cache. With DISCORD_GUILD_MEMBERS=false, memberCount is not updated after the bot connects. Use discord_get_server_stats for a finer breakdown (humans vs bots, channel types).",
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
      'List all channels in a server, grouped by their parent category and ordered by position. Returns a JSON object keyed by category name. Channels that Discord hides from the bot behind the placeholder name ___hidden___ are left out, and discord_find_channel_by_name reports how many; a visible channel whose category is hidden is listed under "Hidden parent". Read-only. Use discord_find_channel_by_name to locate a specific channel. Use discord_get_forum_channels for forums only.',
    annotations: { title: "List channels", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({}).catchall(z.array(channelSummary)),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const unknownTypes = await fetchUnknownTypeChannels(guild);
      const { visible } = splitObfuscated(guild.channels.cache);
      const categories = visible
        .filter((c) => c.type === ChannelType.GuildCategory)
        .sort((a, b) => (a as CategoryChannel).position - (b as CategoryChannel).position);

      const keyOf = categoryKey(categories.values());
      const result: Record<string, unknown[]> = { [NO_CATEGORY]: [] };
      categories.forEach((cat) => {
        result[keyOf(cat)] = [];
      });

      const add = (entry: z.infer<typeof channelSummary>, parent?: GuildBasedChannel | null) => {
        const parentName = !parent
          ? NO_CATEGORY
          : isObfuscated(parent)
            ? HIDDEN_PARENT
            : keyOf(parent);
        if (!result[parentName]) result[parentName] = [];
        result[parentName].push(entry);
      };
      visible
        .filter((c) => c.type !== ChannelType.GuildCategory && !c.isThread())
        .sort((a, b) => (a as GuildChannel).position - (b as GuildChannel).position)
        .forEach((ch) => {
          add(
            { id: ch.id, name: ch.name, type: ChannelType[ch.type] },
            (ch as GuildChannel).parent,
          );
        });
      for (const ch of unknownTypes) {
        if (isObfuscated(ch)) continue;
        const parent = ch.parentId ? guild.channels.cache.get(ch.parentId) : undefined;
        add({ id: ch.id, name: ch.name, type: ch.type }, parent);
      }

      return structured(result);
    },
  }),
  defineTool({
    name: "discord_find_channel_by_name",
    description:
      "Find channels whose name contains a substring (case-insensitive). Returns { matches: [...], hiddenChannels } with the id, name and type of every match, active threads included. Channels that Discord hides from the bot behind the placeholder name ___hidden___ are left out of matches and counted in hiddenChannels; when it is above 0, a note field says a channel missing from matches may still exist. The list is empty when nothing matches. Useful for resolving a channel_id when you only know the channel's name. Use discord_list_channels to see every channel grouped by category.",
    annotations: { title: "Find channel by name", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      name: z.string().describe("Case-insensitive substring to match against channel names."),
    }),
    outputSchema: z.object({
      matches: z.array(channelSummary),
      hiddenChannels: z.number().int(),
      note: z.string().optional(),
    }),
    handle: async ({ guild_id, name }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const unknownTypes = await fetchUnknownTypeChannels(guild);
      const keyword = name.toLowerCase();
      const known = splitObfuscated(guild.channels.cache);
      const unknown = splitObfuscated(new Collection(unknownTypes.map((c) => [c.id, c])));
      const hiddenChannels = known.hidden + unknown.hidden;
      const matches = [
        ...known.visible
          .filter((c) => c.name.toLowerCase().includes(keyword))
          .map((c) => ({ id: c.id, name: c.name, type: ChannelType[c.type] })),
        ...unknown.visible
          .filter((c) => c.name.toLowerCase().includes(keyword))
          .map((c) => ({ id: c.id, name: c.name, type: c.type })),
      ];
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
