import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildScheduledEventStatus,
  type GuildScheduledEventCreateOptions,
  type GuildScheduledEventEditOptions,
} from "discord.js";
import { z } from "zod";
import { discord } from "../client.js";
import { MAX_FETCH_LIMIT, DEFAULTS } from "../constants.js";
import {
  defineTool,
  defineModule,
  snowflake,
  guildId,
  httpUrl,
  intIn,
  structured,
} from "./define.js";

// ─── Helpers ────────────────────────────────────────────────────────────────────

const ENTITY_TYPE_MAP: Record<string, GuildScheduledEventEntityType> = {
  STAGE_INSTANCE: GuildScheduledEventEntityType.StageInstance,
  VOICE: GuildScheduledEventEntityType.Voice,
  EXTERNAL: GuildScheduledEventEntityType.External,
};

const STATUS_MAP = {
  ACTIVE: GuildScheduledEventStatus.Active,
  COMPLETED: GuildScheduledEventStatus.Completed,
  CANCELED: GuildScheduledEventStatus.Canceled,
} as const;

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

// ─── Tools ──────────────────────────────────────────────────────────────────────

const eventSummary = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.union([z.string(), z.number()]),
  entity_type: z.union([z.string(), z.number()]),
  channel_id: z.string().nullable(),
  location: z.string().nullable(),
  scheduled_start_time: z.string().nullable(),
  scheduled_end_time: z.string().nullable(),
  creator_id: z.string().nullable(),
  user_count: z.number().nullable(),
  image: z.string().nullable(),
});

const subscriberSummary = z.object({
  user_id: z.string(),
  username: z.string(),
  avatar: z.string(),
});

/** Tool definitions for managing guild scheduled events. */
const tools = [
  defineTool({
    name: "discord_list_scheduled_events",
    description:
      "List all scheduled events in a server (id, name, status, type, time, location, interested count). Read-only. Use discord_get_scheduled_event for one event's full details.",
    annotations: { title: "List scheduled events", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
    }),
    outputSchema: z.object({
      events: z.array(eventSummary),
    }),
    handle: async ({ guild_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const events = await guild.scheduledEvents.fetch();
      const list = [...events.values()].map(serializeEvent);
      return structured({ events: list });
    },
  }),
  defineTool({
    name: "discord_get_scheduled_event",
    description:
      "Get full details for one scheduled event: name, description, status, type, channel/location, start/end times, creator, and interested-user count. Read-only. Returns a JSON object.",
    annotations: { title: "Get scheduled event", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      event_id: snowflake.describe("ID (snowflake) of the scheduled event."),
    }),
    outputSchema: eventSummary,
    handle: async ({ guild_id, event_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const event = await guild.scheduledEvents.fetch(event_id);
      return structured(serializeEvent(event));
    },
  }),
  defineTool({
    name: "discord_create_scheduled_event",
    description:
      "Create a scheduled event. For 'VOICE'/'STAGE_INSTANCE' events provide channel_id; for 'EXTERNAL' events provide location AND scheduled_end_time. Requires the Manage Events permission. Returns the new event's name and ID.",
    annotations: {
      title: "Create scheduled event",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      name: z.string().describe("Event name (max 100 characters)."),
      description: z
        .string()
        .optional()
        .describe("Optional event description (max 1000 characters)."),
      entity_type: z
        .enum(["VOICE", "STAGE_INSTANCE", "EXTERNAL"])
        .describe(
          "Where the event happens: 'VOICE' or 'STAGE_INSTANCE' (needs channel_id), or 'EXTERNAL' (needs location + scheduled_end_time).",
        ),
      scheduled_start_time: z.iso
        .datetime({ offset: true })
        .describe(
          "Event start as an ISO 8601 datetime, e.g. '2026-06-01T20:00:00Z'. Must be in the future.",
        ),
      scheduled_end_time: z.iso
        .datetime({ offset: true })
        .optional()
        .describe("Event end as an ISO 8601 datetime. Required for EXTERNAL events."),
      channel_id: snowflake
        .optional()
        .describe(
          "Voice or stage channel ID (snowflake). Required for VOICE/STAGE_INSTANCE events.",
        ),
      location: z
        .string()
        .optional()
        .describe("Free-text location (e.g. a URL or place). Required for EXTERNAL events."),
      image: httpUrl.optional().describe("Optional cover image URL."),
    }),
    handle: async ({
      guild_id,
      name,
      description,
      entity_type,
      scheduled_start_time,
      scheduled_end_time,
      channel_id,
      location,
      image,
    }) => {
      const guild = await discord.guilds.fetch(guild_id);

      const entityType = ENTITY_TYPE_MAP[entity_type];

      if (
        (entityType === GuildScheduledEventEntityType.Voice ||
          entityType === GuildScheduledEventEntityType.StageInstance) &&
        !channel_id
      ) {
        throw new Error("channel_id is required for VOICE or STAGE_INSTANCE events.");
      }
      if (entityType === GuildScheduledEventEntityType.External && !location) {
        throw new Error("location is required for EXTERNAL events.");
      }
      if (entityType === GuildScheduledEventEntityType.External && !scheduled_end_time) {
        throw new Error("scheduled_end_time is required for EXTERNAL events.");
      }

      const options: GuildScheduledEventCreateOptions = {
        name,
        scheduledStartTime: scheduled_start_time,
        entityType,
        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
        description,
        scheduledEndTime: scheduled_end_time,
        channel: channel_id,
        entityMetadata: location !== undefined ? { location } : undefined,
        image,
      };

      const event = await guild.scheduledEvents.create(options);
      return {
        content: [
          { type: "text", text: `✅ Scheduled event "${event.name}" created (id: ${event.id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_edit_scheduled_event",
    description:
      "Update a scheduled event; only provided fields change. Use the status field to start ('ACTIVE'), end ('COMPLETED'), or cancel ('CANCELED') an event; Discord only allows certain status transitions. Requires the Manage Events permission.",
    annotations: {
      title: "Edit scheduled event",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      event_id: snowflake.describe("ID (snowflake) of the event to edit."),
      name: z.string().optional().describe("New event name (max 100 characters)."),
      description: z.string().optional().describe("New event description (max 1000 characters)."),
      scheduled_start_time: z.iso
        .datetime({ offset: true })
        .optional()
        .describe("New start time as an ISO 8601 datetime."),
      scheduled_end_time: z.iso
        .datetime({ offset: true })
        .optional()
        .describe("New end time as an ISO 8601 datetime."),
      channel_id: snowflake
        .optional()
        .describe("New voice/stage channel ID (snowflake) for VOICE/STAGE_INSTANCE events."),
      location: z.string().optional().describe("New free-text location for EXTERNAL events."),
      image: httpUrl.optional().describe("New cover image URL."),
      status: z
        .enum(["ACTIVE", "COMPLETED", "CANCELED"])
        .optional()
        .describe(
          "Change event status. Allowed transitions only: SCHEDULED→ACTIVE→COMPLETED, or SCHEDULED→CANCELED (no transition back to SCHEDULED exists).",
        ),
    }),
    handle: async ({
      guild_id,
      event_id,
      name,
      description,
      scheduled_start_time,
      scheduled_end_time,
      channel_id,
      location,
      image,
      status,
    }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const event = await guild.scheduledEvents.fetch(event_id);

      const options: GuildScheduledEventEditOptions<
        GuildScheduledEventStatus,
        | GuildScheduledEventStatus.Active
        | GuildScheduledEventStatus.Completed
        | GuildScheduledEventStatus.Canceled
      > = {
        name,
        description,
        scheduledStartTime: scheduled_start_time,
        scheduledEndTime: scheduled_end_time,
        channel: channel_id,
        entityMetadata: location !== undefined ? { location } : undefined,
        image,
        status: status !== undefined ? STATUS_MAP[status] : undefined,
      };

      const updated = await event.edit(options);
      return {
        content: [
          {
            type: "text",
            text: `✅ Scheduled event "${updated.name}" updated (id: ${updated.id}).`,
          },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_delete_scheduled_event",
    description:
      "Permanently delete a scheduled event. IRREVERSIBLE. To cancel an event while keeping a record, use discord_edit_scheduled_event with status:'CANCELED' instead. Requires the Manage Events permission.",
    annotations: {
      title: "Delete scheduled event",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      event_id: snowflake.describe("ID (snowflake) of the event to delete."),
    }),
    handle: async ({ guild_id, event_id }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const event = await guild.scheduledEvents.fetch(event_id);
      await event.delete();
      return {
        content: [
          { type: "text", text: `✅ Scheduled event "${event.name}" deleted (id: ${event_id}).` },
        ],
      };
    },
  }),
  defineTool({
    name: "discord_get_event_subscribers",
    description:
      "List the users who marked themselves 'Interested' in a scheduled event. Returns { subscribers: [...], nextCursor }. A page holds up to 100 users; if nextCursor is non-null, pass it back as `after` to fetch the next page. Read-only.",
    annotations: { title: "Get event subscribers", readOnlyHint: true, openWorldHint: true },
    schema: z.object({
      guild_id: guildId,
      event_id: snowflake.describe("ID (snowflake) of the scheduled event."),
      limit: intIn(1, MAX_FETCH_LIMIT)
        .default(DEFAULTS.LIMIT)
        .describe("Max subscribers per page (1–100). Default 25."),
      after: snowflake
        .optional()
        .describe(
          "Pagination cursor: a user ID (snowflake). Pass the previous response's nextCursor to fetch the next page.",
        ),
    }),
    outputSchema: z.object({
      subscribers: z.array(subscriberSummary),
      nextCursor: z.string().nullable(),
    }),
    handle: async ({ guild_id, event_id, limit, after }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const event = await guild.scheduledEvents.fetch(event_id);
      const subscribers = await event.fetchSubscribers({ limit, after });
      const list = [...subscribers.values()].map((sub) => ({
        user_id: sub.user.id,
        username: sub.user.username,
        avatar: sub.user.displayAvatarURL(),
      }));
      const nextCursor = subscribers.size === limit ? (subscribers.lastKey() ?? null) : null;
      return structured({ subscribers: list, nextCursor });
    },
  }),
  defineTool({
    name: "discord_create_event_invite",
    description:
      "Create a shareable invite URL that points to a scheduled event, so recipients land on the event when joining. Requires the Create Instant Invite permission. Returns the invite URL.",
    annotations: {
      title: "Create event invite",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    schema: z.object({
      guild_id: guildId,
      event_id: snowflake.describe("ID (snowflake) of the scheduled event to link the invite to."),
      channel_id: snowflake
        .optional()
        .describe(
          "Channel (snowflake) the invite points to. Defaults to the event's own channel; REQUIRED for EXTERNAL events, which have none.",
        ),
      max_age: intIn(0, 604800)
        .default(86400)
        .describe(
          "Invite lifetime in seconds, 0–604800 (7 days); 0 means it never expires. Default 86400 (24h).",
        ),
      max_uses: intIn(0, 100)
        .default(0)
        .describe("Maximum number of uses, 0–100; 0 means unlimited. Default 0."),
    }),
    handle: async ({ guild_id, event_id, channel_id, max_age, max_uses }) => {
      const guild = await discord.guilds.fetch(guild_id);
      const event = await guild.scheduledEvents.fetch(event_id);
      if (event.entityType === GuildScheduledEventEntityType.External && !channel_id)
        throw new Error(
          "channel_id is required for EXTERNAL events (they have no channel of their own).",
        );
      if (event.entityType !== GuildScheduledEventEntityType.External && channel_id)
        throw new Error(
          "channel_id is only honored for EXTERNAL events; VOICE/STAGE invites always point at the event's own channel; omit channel_id.",
        );
      const url = await event.createInviteURL({
        channel: channel_id,
        maxAge: max_age,
        maxUses: max_uses,
      });
      return { content: [{ type: "text", text: `✅ Event invite created: ${url}` }] };
    },
  }),
];

export default defineModule(tools);
