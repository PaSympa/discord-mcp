import { test, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { DiscordAPIError, REST, Routes } from "discord.js";
import { discord } from "../src/client.js";
import { BATCH_BUDGET_MS, rejectOnBatchRateLimit, runBatch } from "../src/batch.js";
import { rateLimited } from "./rate-limit.js";

afterEach(() => mock.timers.reset());

const apiError = (code: number, message: string) =>
  new DiscordAPIError({ code, message }, code, 403, "PUT", "/test", {});

test("runBatch stops at the deadline and returns the items it did not start", async () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const started: string[] = [];
  const result = await runBatch(["a", "b", "c", "d"], async (item) => {
    started.push(item);
    mock.timers.tick(15_000);
  });
  assert.deepEqual(started, ["a", "b", "c"], "d starts at 45 s, past the 40 s budget");
  assert.deepEqual(result.done, ["a", "b", "c"]);
  assert.deepEqual(result.remaining, ["d"]);
  assert.deepEqual(result.stopped, {
    reason: "time_budget",
    message: "The call used its 40 s time budget. Call again with remaining.",
  });
});

test("the REST client uses the batch rate-limit hook", () => {
  assert.equal(discord.rest.options.rejectOnRateLimit, rejectOnBatchRateLimit);
});

test("rejectOnRateLimit never rejects outside a batch", () => {
  assert.equal(rejectOnBatchRateLimit({ retryAfter: 0 }), false);
  assert.equal(rejectOnBatchRateLimit({ retryAfter: 10 * BATCH_BUDGET_MS }), false);
});

test("rejectOnRateLimit rejects inside a batch only a wait past the time left", async () => {
  mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  const seen: boolean[] = [];
  await runBatch(
    ["x"],
    async () => {
      seen.push(rejectOnBatchRateLimit({ retryAfter: 9_000 }));
      seen.push(rejectOnBatchRateLimit({ retryAfter: 11_000 }));
      mock.timers.tick(5_000);
      seen.push(rejectOnBatchRateLimit({ retryAfter: 4_000 }));
      seen.push(rejectOnBatchRateLimit({ retryAfter: 6_000 }));
    },
    { deadline: Date.now() + 10_000 },
  );
  assert.deepEqual(seen, [false, true, false, true]);
  assert.equal(rejectOnBatchRateLimit({ retryAfter: 60_000 }), false, "the batch context ends");
});

/** A REST client on a fake network: each response leaves the route's bucket empty for `resetAfter` seconds. */
function limitedRest(resetAfter: number) {
  const sent: string[] = [];
  const rest = new REST({
    retries: 0,
    rejectOnRateLimit: rejectOnBatchRateLimit,
    makeRequest: async (url) => {
      sent.push(url);
      return new Response(null, {
        status: 204,
        headers: {
          "x-ratelimit-limit": "1",
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset-after": String(resetAfter),
        },
      }) as never;
    },
  }).setToken("test-token");
  return { rest, sent };
}

const ROUTE = (user: string) =>
  Routes.guildMemberRole("100000000000000001", user, "100000000000000002");

test("inside a batch, a rate-limit wait past the deadline stops the batch before the request", async () => {
  const { rest, sent } = limitedRest(1);
  const result = await runBatch(
    ["100000000000000003", "100000000000000004", "100000000000000005"],
    (user, signal) => rest.put(ROUTE(user), { signal }),
    { deadline: Date.now() + 200 },
  );
  assert.equal(sent.length, 1, "the second request is never sent");
  assert.deepEqual(result.done, ["100000000000000003"]);
  assert.deepEqual(result.remaining, ["100000000000000004", "100000000000000005"]);
  assert.equal(result.stopped?.reason, "time_budget");
  const seconds = result.stopped?.retry_after_seconds;
  assert.ok(Number.isInteger(seconds) && seconds! >= 1, `retry_after_seconds: ${seconds}`);
  assert.equal(
    result.stopped?.message,
    `Discord asked to wait ${seconds} s before the next request, past this call's time budget. Wait about ${seconds} s, then call again with remaining.`,
  );
});

test("a rate-limit stop rounds Discord's wait up to the second and tells the caller to wait", async () => {
  const result = await runBatch(["a", "b"], async (item) => {
    if (item === "b") throw rateLimited(116_500);
  });
  assert.deepEqual(result.done, ["a"]);
  assert.deepEqual(result.remaining, ["b"]);
  assert.deepEqual(result.stopped, {
    reason: "time_budget",
    message:
      "Discord asked to wait 117 s before the next request, past this call's time budget. Wait about 117 s, then call again with remaining.",
    retry_after_seconds: 117,
  });
});

test("outside a batch, the same REST client waits the rate limit out as before", async () => {
  const { rest, sent } = limitedRest(0.2);
  await rest.put(ROUTE("100000000000000003"));
  await rest.put(ROUTE("100000000000000004"));
  assert.equal(sent.length, 2);
});

for (const [label, request] of [
  [
    "a request that honors its signal",
    (signal: AbortSignal) =>
      new Promise<void>((resolve, reject) => {
        setTimeout(resolve, 60_000);
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
  ],
  [
    "a request that ignores its signal",
    () => new Promise<void>((resolve) => setTimeout(resolve, 60_000)),
  ],
] as const) {
  test(`the hard stop abandons ${label} 10 s past the deadline`, async () => {
    mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
    const pending = runBatch(["a", "b"], (_item, signal) => request(signal));
    mock.timers.tick(70_000);
    const result = await pending;
    assert.deepEqual(result.done, [], "the 60 s request must not get to finish");
    assert.deepEqual(result.remaining, ["a", "b"]);
    assert.equal(result.stopped?.reason, "time_budget");
    assert.match(result.stopped?.message ?? "", /still running 10 s past the time budget/);
  });
}

test("an aborted signal stops the loop and leaves the interrupted item in remaining", async () => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  const result = await runBatch(
    ["a", "b", "c"],
    async (item, signal) => {
      signals.push(signal);
      if (item === "b") {
        controller.abort();
        throw new Error("This operation was aborted");
      }
    },
    { signal: controller.signal },
  );
  assert.deepEqual(result.done, ["a"]);
  assert.deepEqual(result.remaining, ["b", "c"]);
  assert.equal(result.stopped?.reason, "cancelled");
  assert.equal(signals[1].aborted, true, "the item's signal follows the call's");
  assert.equal(signals[0].aborted, false, "a finished item's signal is detached");
});

test("a signal aborted before the call starts nothing", async () => {
  let calls = 0;
  const result = await runBatch(["a"], async () => void calls++, { signal: AbortSignal.abort() });
  assert.equal(calls, 0);
  assert.deepEqual(result.remaining, ["a"]);
  assert.equal(result.stopped?.reason, "cancelled");
});

test("each item gets its own signal, so the call's signal holds one listener at most", async () => {
  const controller = new AbortController();
  const counts: number[] = [];
  await runBatch(
    Array.from({ length: 12 }, (_, i) => i),
    async () => void counts.push(getEventListeners(controller.signal, "abort").length),
    { signal: controller.signal },
  );
  assert.deepEqual(new Set(counts), new Set([1]));
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

for (const [code, message] of [
  [50013, "Missing Permissions"],
  [50001, "Missing Access"],
  [10011, "Unknown Role"],
  [10003, "Unknown Channel"],
  [10004, "Unknown Guild"],
  [50083, "Thread is archived"],
  [160005, "Thread is locked"],
] as const) {
  test(`systemic error ${code} stops the batch instead of failing every item`, async () => {
    const tried: string[] = [];
    const result = await runBatch(["a", "b", "c"], async (item) => {
      tried.push(item);
      if (item === "b") throw apiError(code, message);
    });
    assert.deepEqual(tried, ["a", "b"]);
    assert.deepEqual(result.done, ["a"]);
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.remaining, ["b", "c"]);
    assert.equal(result.stopped?.reason, "error");
    assert.equal(result.stopped?.code, code);
    assert.match(result.stopped?.message ?? "", new RegExp(`${code}.*${message}`));
  });
}

for (const [code, message] of [
  [10007, "Unknown Member"],
  [10008, "Unknown Message"],
] as const) {
  test(`per-item error ${code} fails that item and the batch goes on`, async () => {
    const result = await runBatch(["a", "b", "c"], async (item) => {
      if (item === "b") throw apiError(code, message);
    });
    assert.deepEqual(result.done, ["a", "c"]);
    assert.deepEqual(result.failed, [{ item: "b", code, message }]);
    assert.deepEqual(result.remaining, []);
    assert.equal(result.stopped, undefined);
  });
}

for (const [label, body, code] of [
  ["an empty body", {}, undefined],
  ["an OAuth error", { error: "invalid_client" }, "invalid_client"],
] as const) {
  test(`a Discord error with no numeric code (${label}) stops the batch with the HTTP status`, async () => {
    const result = await runBatch(["a", "b"], async (item) => {
      if (item === "a") throw new DiscordAPIError(body, code as never, 401, "PUT", "/test", {});
    });
    assert.deepEqual(result.failed, []);
    assert.deepEqual(result.remaining, ["a", "b"]);
    assert.equal(result.stopped?.reason, "error");
    assert.equal(result.stopped?.code, 401);
    assert.match(result.stopped?.message ?? "", /HTTP 401 with no error code/);
  });
}

test("a non-Discord error stops the batch: the outcome of that request is unknown", async () => {
  const result = await runBatch(["a", "b"], async (item) => {
    if (item === "a") throw new Error("socket hang up");
  });
  assert.deepEqual(result.done, []);
  assert.deepEqual(result.remaining, ["a", "b"]);
  assert.deepEqual(result.stopped, { reason: "error", message: "socket hang up" });
});
