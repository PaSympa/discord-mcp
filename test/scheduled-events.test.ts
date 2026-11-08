import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GuildScheduledEventEntityType, GuildScheduledEventStatus } from "discord.js";
import { discord } from "../src/client.js";
import scheduledEvents from "../src/tools/scheduledEvents.js";

const GUILD = "111111111111111111";
const EVENT = "444444444444444444";

afterEach(() => mock.restoreAll());

function fakeEvent(userCount: number | null) {
  return {
    id: EVENT,
    name: "probe",
    description: null,
    status: GuildScheduledEventStatus.Scheduled,
    entityType: GuildScheduledEventEntityType.External,
    channelId: null,
    entityMetadata: { location: "mcp test" },
    scheduledStartAt: new Date("2030-01-01T10:00:00.000Z"),
    scheduledEndAt: new Date("2030-01-01T11:00:00.000Z"),
    creatorId: null,
    userCount,
    coverImageURL: () => null,
  };
}

/**
 * Mirrors GuildScheduledEventManager.fetch: the cached gateway copy comes back
 * unless the call forces a REST read, and only that read carries the count.
 */
function stubEvents(interested: number): unknown[] {
  const calls: unknown[] = [];
  const manager = {
    fetch: async (options: unknown) => {
      calls.push(options);
      const o = typeof options === "object" && options !== null ? options : {};
      const { force, withUserCount = true } = o as { force?: boolean; withUserCount?: boolean };
      return fakeEvent(force && withUserCount ? interested : null);
    },
  };
  mock.method(discord.guilds, "fetch", async () => ({ scheduledEvents: manager }) as never);
  return calls;
}

test("get_scheduled_event reads the interested count from the API, not the gateway cache", async () => {
  const calls = stubEvents(0);
  const result = await scheduledEvents.handlers.get("discord_get_scheduled_event")!({
    guild_id: GUILD,
    event_id: EVENT,
  });
  const event = result.structuredContent as { id: string; user_count: number | null };
  assert.equal(event.user_count, 0, "a count of 0 is a number, not null");
  assert.equal(event.id, EVENT);
  assert.equal(calls.length, 1);
});
