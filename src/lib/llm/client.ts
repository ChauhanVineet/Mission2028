import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Question generation talks to Anthropic directly. This project briefly
// routed through OpenRouter and Google Gemini while the Anthropic account
// was out of credits; both were removed once credits were restored, since
// a single well-understood provider is easier to reason about than a
// fallback chain — and the alternatives were materially worse for this
// use case (weaker models returned option letters instead of answer text
// and wrapped their JSON in prose, and Gemini's free tier returned 503 on
// roughly half of requests).

// Overridable without a code change via ANTHROPIC_MODEL. Sonnet is the
// default for cost: it's meaningfully cheaper than Opus per token while
// still strong enough for JEE-level physics/chemistry/maths reasoning.
// Switch to claude-opus-5 if question quality ever looks thin.
const DEFAULT_MODEL = "claude-sonnet-5";

export function getModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/**
 * Max generation requests in flight at once, across the whole process.
 * Scheduling a full test fires 15 requests (3 subjects x 5 chunks), so
 * this is enforced by a shared semaphore rather than per-subject:
 * otherwise three subjects each running their own chunk pool would
 * multiply into a burst of unknown size.
 *
 * 15 is deliberately high enough to run a whole test in one wave. Measured
 * at 12 concurrent requests: no rate limiting, no failures, and per-request
 * speed unchanged from running alone — so the wall time of a full test is
 * one chunk (~48s) rather than the sum of them. Lower it via
 * LLM_MAX_CONCURRENCY if Anthropic ever starts returning 429s.
 */
export const MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY) || 15;

let inFlight = 0;
const waiting: (() => void)[] = [];

/**
 * Runs `fn` while holding one of MAX_CONCURRENCY slots, queueing if all
 * are taken. Every LLM call in the app goes through here, so the cap holds
 * no matter how many callers there are or how they're nested.
 */
export async function withLlmSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_CONCURRENCY) {
    // Wait to be handed a slot directly by whoever finishes next.
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    inFlight++;
  }

  try {
    return await fn();
  } finally {
    // Pass the slot straight to the next waiter instead of releasing it and
    // letting them re-acquire; releasing first would briefly leave the count
    // below the true number of callers about to run, allowing more than
    // MAX_CONCURRENCY requests in flight.
    const next = waiting.shift();
    if (next) next();
    else inFlight--;
  }
}

export function createLlmClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to generate questions.",
    );
  }

  // Fail fast rather than relying on the SDK's built-in retries, whose
  // defaults (10-minute timeout, 2 retries) can silently stretch one stuck
  // request past 30 minutes. Requests are chunked to 5 questions, which
  // measures ~48s, so 90s absorbs normal variance while still catching a
  // genuinely stuck connection well inside the route's 120s maxDuration.
  // Retries worth doing are handled in callWithRetry, under a deadline.
  return new Anthropic({ apiKey, timeout: 90_000, maxRetries: 0 });
}

function isTransient(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  // 429 rate limited, 529 Anthropic-specific "overloaded", 5xx upstream.
  if (e?.status === 429 || e?.status === 529) return true;
  if (typeof e?.status === "number" && e.status >= 500) return true;
  return /rate limit|overloaded|timeout|timed out/i.test(e?.message ?? "");
}

/**
 * Runs an LLM call, retrying only on transient failures (rate limits,
 * overload, upstream 5xx). A blip shouldn't fail a whole test generation,
 * but retries are bounded so a real outage surfaces quickly instead of
 * hanging.
 *
 * `deadlineAt` (epoch ms) is the hard stop: retrying is skipped when there
 * isn't time left for another attempt. Without it, retry counts multiply
 * with the per-request timeout — three 60s attempts is 180s, which would
 * outlast the route's maxDuration and get the whole function killed
 * mid-flight, leaving the browser spinning with no error to show.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  {
    retries = 2,
    baseDelayMs = 3000,
    deadlineAt,
    // Roughly how long a fresh attempt needs. A failure that arrives
    // quickly (a 429, say) leaves room to retry; one that burns the full
    // client timeout does not, and correctly gives up instead.
    attemptBudgetMs = 50_000,
  }: {
    retries?: number;
    baseDelayMs?: number;
    deadlineAt?: number;
    attemptBudgetMs?: number;
  } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) throw err;

      const delay = baseDelayMs * (attempt + 1);
      if (deadlineAt !== undefined && Date.now() + delay + attemptBudgetMs > deadlineAt) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Runs tasks with a cap on how many are in flight at once, so a
 * multi-subject test doesn't fire every request simultaneously.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}
