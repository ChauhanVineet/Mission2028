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
 * Max generation requests in flight at once. Scheduling a test fires one
 * request per subject (at most 3), which is comfortably within Anthropic's
 * limits — measured at ~90s wall time for all three in parallel.
 */
export const MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY) || 3;

export function createLlmClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to generate questions.",
    );
  }

  // Fail fast rather than relying on the SDK's built-in retries, whose
  // defaults (10-minute timeout, 2 retries) can silently stretch one stuck
  // request past 30 minutes. A full 25-question subject batch measures
  // ~76-95s, so 110s leaves headroom. Retries that are actually worth doing
  // are handled in callWithRetry so the time budget stays bounded and below
  // the route's maxDuration.
  return new Anthropic({ apiKey, timeout: 110_000, maxRetries: 0 });
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
 * hanging — and so total time stays under the route's maxDuration.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 3000 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
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
