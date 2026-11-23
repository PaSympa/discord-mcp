import { AsyncLocalStorage } from "node:async_hooks";
import { DiscordAPIError, RateLimitError, type RateLimitData } from "discord.js";
import { z } from "zod";
import { formatToolError } from "./errors.js";

/** Leaves room for one slow request under the 60 s an MCP SDK client waits by default. */
export const BATCH_BUDGET_MS = 40_000;

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
  message: "The client cancelled the call. Nothing was started after the cancellation.",
};

const OUT_OF_TIME: BatchStop = {
  reason: "time_budget",
  message: `The call used its ${BATCH_BUDGET_MS / 1000} s time budget. Call again with remaining.`,
};

export function earlyStop(deadline: number, signal: AbortSignal | undefined) {
  if (signal?.aborted) return CANCELLED;
  if (Date.now() >= deadline) return OUT_OF_TIME;
  return undefined;
}

/** Undefined when only this item failed. */
function stopFor(err: unknown, signal: AbortSignal | undefined): BatchStop | undefined {
  if (signal?.aborted) return CANCELLED;
  if (err instanceof RateLimitError)
    return {
      reason: "time_budget",
      message: `Discord asked to wait ${(err.retryAfter / 1000).toFixed(1)} s, past the time budget of this call. Call again with remaining.`,
    };
  if (err instanceof DiscordAPIError && !SYSTEMIC_CODES.has(Number(err.code))) return undefined;
  return {
    reason: "error",
    message: formatToolError(err),
    ...(err instanceof DiscordAPIError ? { code: err.code } : {}),
  };
}

/**
 * Runs `run` on each item in turn until `deadline` passes, `signal` aborts, or an error
 * would fail every item. The items it did not finish, the one a stop hit included, go
 * to `remaining`; a Discord error about one item goes to `failed` and the batch goes on.
 * A non-Discord error stops it too: the outcome of that request is unknown.
 * Each item gets its own signal, because discord.js adds an abort listener per request
 * and never removes it.
 */
export async function runBatch<T>(
  items: readonly T[],
  run: (item: T, signal: AbortSignal) => Promise<unknown>,
  {
    deadline = Date.now() + BATCH_BUDGET_MS,
    signal,
  }: { deadline?: number; signal?: AbortSignal } = {},
): Promise<BatchResult<T>> {
  return deadlines.run(deadline, async () => {
    const done: T[] = [];
    const failed: BatchResult<T>["failed"] = [];
    for (const [i, item] of items.entries()) {
      const early = earlyStop(deadline, signal);
      if (early) return { done, failed, remaining: items.slice(i), stopped: early };
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener("abort", abort);
      try {
        await run(item, controller.signal);
        done.push(item);
      } catch (err) {
        const stopped = stopFor(err, signal);
        if (stopped) return { done, failed, remaining: items.slice(i), stopped };
        const { code, message } = err as DiscordAPIError;
        failed.push({ item, code, message });
      } finally {
        signal?.removeEventListener("abort", abort);
      }
    }
    return { done, failed, remaining: [] };
  });
}
