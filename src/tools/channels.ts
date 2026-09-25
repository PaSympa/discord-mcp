import { ChannelType, NewsChannel } from "discord.js";
import { z } from "zod";
import { discord, getGuildChannel, fetchChannelChecked } from "../client.js";
import { defineTool, defineModule, snowflake, guildId, intIn } from "./define.js";

/** Tool definitions for guild channels: lifecycle, layout, following, and permission sync. */
const tools = [
  defineTool({
    name: "discord_create_channel",
    description:
      "Create a text channel, voice channel, or category in a server. Requires the Manage Channels permission. For forum channels use discord_create_forum_channel instead. Returns the new channel's name and ID.",
    annotations: {
      title: "Create channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId.describe("Discord server (guild) ID (snowflake) to create the channel in."),
      name: z.string().describe("Name of the new channel (max 100 characters)."),
      type: z
        .enum(["text", "voice", "category"])
        .optional()
        .describe("Channel type to create. Defaults to 'text'."),
      topic: z
        .string()
        .optional()
        .describe("Optional channel topic/description. Applies to text channels only."),
      category_id: snowflake
        .optional()
        .describe("Optional category (snowflake) to nest the new channel under."),
    }),
    handle: async ({ guild_id, name, type, topic, category_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const typeMap: Record<string, ChannelType> = {
        text: ChannelType.GuildText,
        voice: ChannelType.GuildVoice,
        category: ChannelType.GuildCategory,
      };
      const channelType = typeMap[type ?? "text"];
      const created = await guild.channels.create({
        name,
        type: channelType as
          ChannelType.GuildText | ChannelType.GuildVoice | ChannelType.GuildCategory,
        topic: channelType === ChannelType.GuildText ? topic : undefined,
        parent: category_id,
      });
      return {
        content: [
          { type: "text", text: `✅ Channel #${created.name} created (id: ${created.id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_delete_channel",
    description:
      "Permanently delete a channel and all of its messages. IRREVERSIBLE. SAFE BY DEFAULT: dry_run is true unless explicitly set to false, so call it first to preview, then re-call with dry_run:false to actually delete. Requires the Manage Channels permission. An optional reason is recorded in the audit log.",
    annotations: {
      title: "Delete channel",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to delete."),
      reason: z.string().optional().describe("Optional reason recorded in the server audit log."),
      dry_run: z
        .boolean()
        .default(true)
        .describe(
          "If true (default), only reports which channel would be deleted without deleting it. Set false to actually delete.",
        ),
    }),
    handle: async ({ channel_id, reason, dry_run }) => {
      const channel = await fetchChannelChecked(channel_id);
      if (!channel) throw new Error("Channel not found.");
      const channelName = "name" in channel ? channel.name : channel.id;
      if (dry_run) {
        return {
          content: [
            {
              type: "text",
              text: `🔍 Dry run: channel #${channelName} would be deleted. Re-call with dry_run:false to delete.`,
            },
          ],
        };
      }
      await channel.delete(reason);
      return { content: [{ type: "text", text: `✅ Channel #${channelName} deleted.` }] };
    },
  }),
  defineTool({
    name: "discord_edit_channel",
    description:
      "Update a channel's name, topic, slowmode, or NSFW flag. Only provided fields change; topic and slowmode apply to text channels only. Requires the Manage Channels permission. Returns a confirmation.",
    annotations: {
      title: "Edit channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to edit."),
      name: z.string().optional().describe("New channel name (max 100 characters)."),
      topic: z.string().optional().describe("New topic/description (text channels only)."),
      slowmode: intIn(0, 21600)
        .optional()
        .describe("Per-user message cooldown in seconds, 0–21600. 0 disables slowmode."),
      nsfw: z
        .boolean()
        .optional()
        .describe("Mark (true) or unmark (false) the channel as age-restricted (NSFW)."),
    }),
    handle: async ({ channel_id, name, topic, slowmode, nsfw }) => {
      const channel = await getGuildChannel(channel_id);
      const editOptions: Record<string, unknown> = {};
      if (name !== undefined) editOptions.name = name;
      if (topic !== undefined && channel.type === ChannelType.GuildText) editOptions.topic = topic;
      if (slowmode !== undefined && channel.type === ChannelType.GuildText)
        editOptions.rateLimitPerUser = slowmode;
      if (nsfw !== undefined) editOptions.nsfw = nsfw;
      await channel.edit(editOptions);
      return { content: [{ type: "text", text: `✅ Channel #${channel.name} updated.` }] };
    },
  }),
  defineTool({
    name: "discord_move_channel",
    description:
      "Move a channel into a category, or remove it from its category when category_id is omitted. Requires the Manage Channels permission. Use discord_set_channel_position to reorder within a category. Returns a confirmation.",
    annotations: {
      title: "Move channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to move."),
      category_id: snowflake
        .optional()
        .describe("Target category (snowflake). Omit to move the channel out of any category."),
    }),
    handle: async ({ channel_id, category_id }) => {
      const channel = await getGuildChannel(channel_id);
      await channel.edit({ parent: category_id ?? null });
      return { content: [{ type: "text", text: `✅ Channel #${channel.name} moved.` }] };
    },
  }),
  defineTool({
    name: "discord_clone_channel",
    description:
      "Create a copy of a channel, including its name, topic, and permission overwrites (but not its messages). Requires the Manage Channels permission. Returns the cloned channel's name and ID.",
    annotations: {
      title: "Clone channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to clone."),
      new_name: z
        .string()
        .optional()
        .describe("Optional name for the clone. Defaults to the source channel's name."),
    }),
    handle: async ({ channel_id, new_name }) => {
      const channel = await getGuildChannel(channel_id);
      const cloned = await channel.clone({ name: new_name });
      return {
        content: [
          { type: "text", text: `✅ Channel cloned as #${cloned.name} (id: ${cloned.id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_set_channel_position",
    description:
      "Set a channel's display order within its category. Use discord_move_channel to change which category it belongs to. Requires the Manage Channels permission. Returns a confirmation.",
    annotations: {
      title: "Set channel position",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe("ID (snowflake) of the channel to reposition."),
      position: z.int().min(0).describe("Zero-based position within the category (0 = top)."),
    }),
    handle: async ({ channel_id, position }) => {
      const channel = await getGuildChannel(channel_id);
      await channel.setPosition(position);
      return {
        content: [
          { type: "text", text: `✅ Channel #${channel.name} moved to position ${position}.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_follow_announcement_channel",
    description:
      "Subscribe a target channel to an announcement (news) channel, so the source's published messages are reposted into the target. The source must be an announcement channel. Requires the Manage Webhooks permission in the target. Returns a confirmation.",
    annotations: {
      title: "Follow announcement channel",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      source_channel_id: snowflake.describe(
        "ID (snowflake) of the announcement channel to follow.",
      ),
      target_channel_id: snowflake.describe(
        "ID (snowflake) of the channel that will receive published messages.",
      ),
    }),
    handle: async ({ source_channel_id, target_channel_id }) => {
      const source = await fetchChannelChecked(source_channel_id);
      if (!source || !(source instanceof NewsChannel))
        throw new Error("Source channel is not an announcement channel.");
      await fetchChannelChecked(target_channel_id);
      await source.addFollower(target_channel_id);
      return {
        content: [
          { type: "text", text: `✅ Now following announcement channel in target channel.` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_lock_channel_permissions",
    description:
      "Reset a channel's permission overwrites to exactly match its parent category (Discord's 'sync permissions'). The channel must be inside a category. Requires the Manage Roles permission. Returns a confirmation.",
    annotations: {
      title: "Sync channel permissions",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      channel_id: snowflake.describe(
        "ID (snowflake) of the channel to sync with its parent category.",
      ),
    }),
    handle: async ({ channel_id }) => {
      const channel = await getGuildChannel(channel_id);
      await channel.lockPermissions();
      return {
        content: [
          {
            type: "text",
            text: `✅ Channel #${channel.name} permissions synced with parent category.`,
          },
        ],
      };
    },
  }),
];

export default defineModule(tools);
