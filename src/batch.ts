import { AsyncLocalStorage } from "node:async_hooks";
import { DiscordAPIError, RateLimitError, type RateLimitData } from "discord.js";
import { z } from "zod";
import { formatToolError } from "./errors.js";

/** Leaves room for one slow request under the 60 s an MCP SDK client waits by default. */
export const BATCH_BUDGET_MS = 40_000;

/**
 * How long a request started before the deadline may run past it. discord.js retries a
 * timed-out or 5xx request up to 3 times at 15 s each, so one request could otherwise
 * outlast the client's 60 s.
 */
const OVERRUN_MS = 10_000;

const deadlines = new AsyncLocalStorage<number>();

/**
 * The REST client's `rejectOnRateLimit` hook. It runs before discord.js sleeps through a
 * rate limit, a sleep that no request signal can cut short. Outside a batch it never
 * rejects, so other calls wait as before; inside one it rejects a wait that would end
 * past the batch deadline, and the batch stops there.
 */
export function rejectOnBatchRateLimit({ retryAfter }: Pick<RateLimitData, "retryAfter">) {
  const deadline = deadlines.getStore();
  return deadline !== undefined && retryAfter > deadline - Date.now();
}

/** About the bot, guild, channel or role rather than one item: every later item would fail the same way. */
const SYSTEMIC_CODES = new Set([10003, 10004, 10011, 50001, 50013]);

/** Discord's refusal of one item, as a `failed` entry reports it. */
export const failureShape = { code: z.union([z.number(), z.string()]), message: z.string() };

/** The `stopped` output field. A tool that can stop for a reason of its own passes it in. */
export const batchStopSchema = (...reasons: string[]) =>
  z
    .object({
      reason: z.enum(["time_budget", "cancelled", "error", ...reasons]),
      message: z.string(),
      code: failureShape.code.optional(),
    })
    .describe("Why the call stopped early.");

export type BatchStop = { reason: string; message: string; code?: number | string };

export interface BatchResult<T> {
  done: T[];
  failed: { item: T; code: number | string; message: string }[];
  remaining: T[];
  stopped?: BatchStop;
}

const CANCELLED: BatchStop = {
  reason: "cancelled",
  message:
    "The client cancelled the call. A request in flight at that moment may have gone through; its item is in remaining with the ones not started.",
};

const OUT_OF_TIME: BatchStop = {
  reason: "time_budget",
  message: `The call used its ${BATCH_BUDGET_MS / 1000} s time budget. Call again with remaining.`,
};

const OVERRAN: BatchStop = {
  reason: "time_budget",
  message: `A request was still running ${OVERRUN_MS / 1000} s past the time budget, so the call stopped waiting for it. It may have gone through; its item is in remaining. Call again with remaining.`,
};

/** Thrown by {@link runStep} when the batch must stop, as opposed to an error about the item. */
export class BatchStopped extends Error {
  constructor(readonly stop: BatchStop) {
    super(stop.message);
  }
}

/**
 * Runs one request of a batch in its deadline context, where the rate-limit hook can
 * refuse a wait past the deadline. `run` gets a signal that aborts when the call is
 * cancelled or at the hard stop, and the step stops waiting then even if `run` ignores it.
 * @throws {BatchStopped} If the call was cancelled, is out of time, or was rate limited past the deadline.
 */
export function runStep<R>(
  run: (signal: AbortSignal) => Promise<R>,
  { deadline, signal }: { deadline: number; signal?: AbortSignal },
): Promise<R> {
  return deadlines.run(deadline, async () => {
    if (signal?.aborted) throw new BatchStopped(CANCELLED);
    if (Date.now() >= deadline) throw new BatchStopped(OUT_OF_TIME);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort);
    const hardStop = setTimeout(abort, deadline + OVERRUN_MS - Date.now());
    const aborted = new Promise<never>((_, reject) =>
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
        once: true,
      }),
    );
    try {
      return await Promise.race([run(controller.signal), aborted]);
    } catch (err) {
      if (signal?.aborted) throw new BatchStopped(CANCELLED);
      if (controller.signal.aborted) throw new BatchStopped(OVERRAN);
      if (err instanceof RateLimitError)
        throw new BatchStopped({
          reason: "time_budget",
          message: `Discord asked to wait ${(err.retryAfter / 1000).toFixed(1)} s, past the time budget of this call. Call again with remaining.`,
        });
      throw err;
    } finally {
      clearTimeout(hardStop);
      signal?.removeEventListener("abort", abort);
    }
  });
}

/** Undefined when only this item failed. */
function stopFor(err: unknown): BatchStop | undefined {
  if (err instanceof BatchStopped) return err.stop;
  if (err instanceof DiscordAPIError && !SYSTEMIC_CODES.has(Number(err.code))) return undefined;
  return {
    reason: "error",
    message: formatToolError(err),
    ...(err instanceof DiscordAPIError ? { code: err.code } : {}),
  };
}

/**
 * Runs `run` on each item in turn, through {@link runStep}, until the call is cancelled,
 * runs out of time, or meets an error that would fail every item. The items it did not
 * finish, the one a stop hit included, go to `remaining`; a Discord error about one item
 * goes to `failed` and the batch goes on. A non-Discord error stops it too: the outcome
 * of that request is unknown. Each item gets its own signal, because discord.js adds an
 * abort listener per request and never removes it.
 */
export async function runBatch<T>(
  items: readonly T[],
  run: (item: T, signal: AbortSignal) => Promise<unknown>,
  {
    deadline = Date.now() + BATCH_BUDGET_MS,
    signal,
  }: { deadline?: number; signal?: AbortSignal } = {},
): Promise<BatchResult<T>> {
  const done: T[] = [];
  const failed: BatchResult<T>["failed"] = [];
  for (const [i, item] of items.entries()) {
    try {
      await runStep((itemSignal) => run(item, itemSignal), { deadline, signal });
      done.push(item);
    } catch (err) {
      const stopped = stopFor(err);
      if (stopped) return { done, failed, remaining: items.slice(i), stopped };
      const { code, message } = err as DiscordAPIError;
      failed.push({ item, code, message });
    }
  }
  return { done, failed, remaining: [] };
}
