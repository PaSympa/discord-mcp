import { GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, GuildScheduledEventStatus } from "discord.js";
import { discord, validateId } from "../client.js";
import type { ToolModule, ToolResult } from "./types.js";

/** Tool definitions for managing guild scheduled events. */
export const definitions = [
  {
    name: "discord_list_scheduled_events",
    description: "List all scheduled events in a guild.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
      },
      required: ["guild_id"],
    },
  },
  {
    name: "discord_get_scheduled_event",
    description: "Get detailed info about a specific scheduled event.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        event_id: { type: "string" },
      },
      required: ["guild_id", "event_id"],
    },
  },
  {
    name: "discord_create_scheduled_event",
    description:
      "Create a scheduled event in a guild. Use entity_type 'VOICE' or 'STAGE_INSTANCE' with a channel_id, or 'EXTERNAL' with a location and scheduled_end_time.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        entity_type: {
          type: "string",
          description: "'VOICE', 'STAGE_INSTANCE', or 'EXTERNAL'.",
        },
        scheduled_start_time: {
          type: "string",
          description: "ISO 8601 datetime (e.g. '2025-06-01T20:00:00Z').",
        },
        scheduled_end_time: {
          type: "string",
          description: "ISO 8601 datetime. Required for EXTERNAL events.",
        },
        channel_id: {
          type: "string",
          description: "Voice or stage channel ID. Required for VOICE/STAGE_INSTANCE.",
        },
        location: {
          type: "string",
          description: "Location string. Required for EXTERNAL events.",
        },
        image: { type: "string", description: "Cover image URL." },
      },
      required: ["guild_id", "name", "entity_type", "scheduled_start_time"],
    },
  },
  {
    name: "discord_edit_scheduled_event",
    description: "Edit an existing scheduled event. Only provided fields are updated.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        event_id: { type: "string" },
        name: { type: "string" },
        description: { type: "string" },
        scheduled_start_time: { type: "string", description: "ISO 8601 datetime." },
        scheduled_end_time: { type: "string", description: "ISO 8601 datetime." },
        channel_id: { type: "string" },
        location: { type: "string" },
        image: { type: "string", description: "Cover image URL." },
        status: {
          type: "string",
          description: "'SCHEDULED', 'ACTIVE', 'COMPLETED', or 'CANCELED'.",
        },
      },
      required: ["guild_id", "event_id"],
    },
  },
  {
    name: "discord_delete_scheduled_event",
    description: "Delete a scheduled event.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        event_id: { type: "string" },
      },
      required: ["guild_id", "event_id"],
    },
  },
  {
    name: "discord_get_event_subscribers",
    description: "Get users who marked 'Interested' in a scheduled event.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        event_id: { type: "string" },
        limit: { type: "number", description: "1–100, default 25." },
      },
      required: ["guild_id", "event_id"],
    },
  },
  {
    name: "discord_create_event_invite",
    description: "Create an invite URL linked to a scheduled event.",
    inputSchema: {
      type: "object",
      properties: {
        guild_id: { type: "string" },
        event_id: { type: "string" },
        channel_id: { type: "string", description: "Channel for the invite. Uses the first text channel if omitted." },
        max_age: { type: "number", description: "Invite duration in seconds (0 = never). Default 86400." },
        max_uses: { type: "number", description: "Max uses (0 = unlimited). Default 0." },
      },
      required: ["guild_id", "event_id"],
    },
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ENTITY_TYPE_MAP: Record<string, GuildScheduledEventEntityType> = {
  STAGE_INSTANCE: GuildScheduledEventEntityType.StageInstance,
  VOICE: GuildScheduledEventEntityType.Voice,
  EXTERNAL: GuildScheduledEventEntityType.External,
};

const STATUS_MAP: Record<string, GuildScheduledEventStatus> = {
  SCHEDULED: GuildScheduledEventStatus.Scheduled,
  ACTIVE: GuildScheduledEventStatus.Active,
  COMPLETED: GuildScheduledEventStatus.Completed,
  CANCELED: GuildScheduledEventStatus.Canceled,
};

const ENTITY_TYPE_NAMES: Record<number, string> = {
  [GuildScheduledEventEntityType.StageInstance]: "STAGE_INSTANCE",
  [GuildScheduledEventEntityType.Voice]: "VOICE",
  [GuildScheduledEventEntityType.External]: "EXTERNAL",
};

const STATUS_NAMES: Record<number, string> = {
  [GuildScheduledEventStatus.Scheduled]: "SCHEDULED",
  [GuildScheduledEventStatus.Active]: "ACTIVE",
  [GuildScheduledEventStatus.Completed]: "COMPLETED",
  [GuildScheduledEventStatus.Canceled]: "CANCELED",
};

function serializeEvent(event: import("discord.js").GuildScheduledEvent) {
  return {
    id: event.id,
    name: event.name,
    description: event.description ?? null,
    status: STATUS_NAMES[event.status] ?? event.status,
    entity_type: ENTITY_TYPE_NAMES[event.entityType] ?? event.entityType,
    channel_id: event.channelId ?? null,
    location: event.entityMetadata?.location ?? null,
    scheduled_start_time: event.scheduledStartAt?.toISOString() ?? null,
    scheduled_end_time: event.scheduledEndAt?.toISOString() ?? null,
    creator_id: event.creatorId ?? null,
    user_count: event.userCount ?? null,
    image: event.coverImageURL() ?? null,
  };
}

// ─── Handler ────────────────────────────────────────────────────────────────────

export async function handle(
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult | null> {
  switch (name) {
    case "discord_list_scheduled_events": {
      const guildId = validateId(args.guild_id, "guild_id");
      const guild = await discord.guilds.fetch(guildId);
      const events = await guild.scheduledEvents.fetch();
      const list = [...events.values()].map(serializeEvent);
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
    }

    case "discord_get_scheduled_event": {
      const guildId = validateId(args.guild_id, "guild_id");
      const eventId = validateId(args.event_id, "event_id");
      const guild = await discord.guilds.fetch(guildId);
      const event = await guild.scheduledEvents.fetch(eventId);
      return { content: [{ type: "text", text: JSON.stringify(serializeEvent(event), null, 2) }] };
    }

    case "discord_create_scheduled_event": {
      const guildId = validateId(args.guild_id, "guild_id");
      const guild = await discord.guilds.fetch(guildId);

      const entityTypeStr = String(args.entity_type).toUpperCase();
      const entityType = ENTITY_TYPE_MAP[entityTypeStr];
      if (!entityType) throw new Error(`Invalid entity_type: "${args.entity_type}". Must be VOICE, STAGE_INSTANCE, or EXTERNAL.`);

      if ((entityType === GuildScheduledEventEntityType.Voice || entityType === GuildScheduledEventEntityType.StageInstance) && !args.channel_id) {
        throw new Error("channel_id is required for VOICE or STAGE_INSTANCE events.");
      }
      if (entityType === GuildScheduledEventEntityType.External && !args.location) {
        throw new Error("location is required for EXTERNAL events.");
      }
      if (entityType === GuildScheduledEventEntityType.External && !args.scheduled_end_time) {
        throw new Error("scheduled_end_time is required for EXTERNAL events.");
      }

      const options: Record<string, unknown> = {
        name: String(args.name),
        scheduledStartTime: String(args.scheduled_start_time),
        entityType,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
      };
      if (args.description) options.description = String(args.description);
      if (args.scheduled_end_time) options.scheduledEndTime = String(args.scheduled_end_time);
      if (args.channel_id) options.channel = validateId(args.channel_id, "channel_id");
      if (args.location) options.entityMetadata = { location: String(args.location) };
      if (args.image) options.image = String(args.image);

      const event = await guild.scheduledEvents.create(options as any);
      return {
        content: [{ type: "text", text: `✅ Scheduled event "${event.name}" created (id: ${event.id}).` }],
      };
    }

    case "discord_edit_scheduled_event": {
      const guildId = validateId(args.guild_id, "guild_id");
      const eventId = validateId(args.event_id, "event_id");
      const guild = await discord.guilds.fetch(guildId);
      const event = await guild.scheduledEvents.fetch(eventId);

      const options: Record<string, unknown> = {};
      if (args.name) options.name = String(args.name);
      if (args.description !== undefined) options.description = String(args.description);
      if (args.scheduled_start_time) options.scheduledStartTime = String(args.scheduled_start_time);
      if (args.scheduled_end_time) options.scheduledEndTime = String(args.scheduled_end_time);
      if (args.channel_id) options.channel = validateId(args.channel_id, "channel_id");
      if (args.location) options.entityMetadata = { location: String(args.location) };
      if (args.image) options.image = String(args.image);
      if (args.status) {
        const statusStr = String(args.status).toUpperCase();
        const status = STATUS_MAP[statusStr];
        if (!status) throw new Error(`Invalid status: "${args.status}". Must be SCHEDULED, ACTIVE, COMPLETED, or CANCELED.`);
        options.status = status;
      }

      const updated = await event.edit(options as any);
      return {
        content: [{ type: "text", text: `✅ Scheduled event "${updated.name}" updated (id: ${updated.id}).` }],
      };
    }

    case "discord_delete_scheduled_event": {
      const guildId = validateId(args.guild_id, "guild_id");
      const eventId = validateId(args.event_id, "event_id");
      const guild = await discord.guilds.fetch(guildId);
      const event = await guild.scheduledEvents.fetch(eventId);
      await event.delete();
      return {
        content: [{ type: "text", text: `✅ Scheduled event "${event.name}" deleted (id: ${eventId}).` }],
      };
    }

    case "discord_get_event_subscribers": {
      const guildId = validateId(args.guild_id, "guild_id");
      const eventId = validateId(args.event_id, "event_id");
      const guild = await discord.guilds.fetch(guildId);
      const event = await guild.scheduledEvents.fetch(eventId);
      const limit = Math.min(Number(args.limit ?? 25), 100);
      const subscribers = await event.fetchSubscribers({ limit });
      const list = [...subscribers.values()].map((sub) => ({
        user_id: sub.user.id,
        username: sub.user.username,
        avatar: sub.user.displayAvatarURL(),
      }));
      return { content: [{ type: "text", text: JSON.stringify(list, null, 2) }] };
    }

    case "discord_create_event_invite": {
      const guildId = validateId(args.guild_id, "guild_id");
      const eventId = validateId(args.event_id, "event_id");
      const guild = await discord.guilds.fetch(guildId);
      const event = await guild.scheduledEvents.fetch(eventId);
      const url = await event.createInviteURL({
        channel: args.channel_id ? validateId(args.channel_id, "channel_id") : undefined,
        maxAge: Number(args.max_age ?? 86400),
        maxUses: Number(args.max_uses ?? 0),
      });
      return { content: [{ type: "text", text: `✅ Event invite created: ${url}` }] };
    }

    default:
      return null;
  }
}

export default { definitions, handle } satisfies ToolModule;
