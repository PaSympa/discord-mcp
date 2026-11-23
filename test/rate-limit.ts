import { RateLimitError } from "discord.js";

/** What discord.js throws when the REST client's `rejectOnRateLimit` hook refuses a wait. */
export const rateLimited = (retryAfter: number) =>
  new RateLimitError({
    global: false,
    method: "PUT",
    url: "/test",
    route: "/test",
    majorParameter: "100000000000000001",
    hash: "test",
    limit: 1,
    timeToReset: retryAfter,
    retryAfter,
    sublimitTimeout: 0,
    scope: "user",
  });

type Stopped = { properties: Record<string, { type: string; description: string }> };

/** `stopped.retry_after_seconds` in the JSON Schema a tool advertises as its outputSchema. */
export const retryAfterSchema = (outputSchema: Record<string, unknown> | undefined) =>
  (outputSchema!.properties as Record<string, Stopped>).stopped.properties.retry_after_seconds;
