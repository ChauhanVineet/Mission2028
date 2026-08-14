import "server-only";
import OpenAI from "openai";

// The app talks to whichever LLM provider has a key configured. Both are
// reached through the OpenAI SDK: OpenRouter and Google both expose
// OpenAI-compatible endpoints, so only baseURL/model/limits differ.
//
// Precedence: GEMINI_API_KEY wins if both are set. Force one explicitly
// with LLM_PROVIDER=gemini | openrouter.

export type ProviderName = "gemini" | "openrouter";

export type ProviderConfig = {
  name: ProviderName;
  model: string;
  /**
   * Max requests we're willing to have in flight at once. Gemini's free
   * tier has low per-minute request limits, and scheduling a 3-subject
   * test fires one request per subject — enough to trip a 429 if
   * unthrottled. OpenRouter is far more permissive.
   */
  maxConcurrency: number;
};

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Default Gemini model. Must be free-tier eligible (gemini-3.1-pro-preview
// is NOT) and support json_schema structured outputs. gemini-2.5-pro is
// confirmed on both counts and is the strongest reasoning model available
// on the free tier — reasoning quality matters most here, since a wrong
// worked solution actively teaches the wrong thing.
// Other free-tier-eligible options: gemini-3.7-flash, gemini-3.6-flash,
// gemini-3.5-flash, gemini-2.5-flash (faster, lighter on quota).
const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

export function resolveProvider(): ProviderConfig {
  const forced = process.env.LLM_PROVIDER?.toLowerCase();
  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;

  if (forced && forced !== "gemini" && forced !== "openrouter") {
    throw new Error(
      `LLM_PROVIDER must be "gemini" or "openrouter" (got "${forced}").`,
    );
  }

  const useGemini = forced === "gemini" || (forced !== "openrouter" && hasGemini);

  if (useGemini) {
    if (!hasGemini) {
      throw new Error(
        "GEMINI_API_KEY is not set. Add it to your environment to generate questions.",
      );
    }
    return {
      name: "gemini",
      model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
      maxConcurrency: Number(process.env.LLM_MAX_CONCURRENCY) || 1,
    };
  }

  if (!hasOpenRouter) {
    throw new Error(
      "No LLM key is set. Add GEMINI_API_KEY or OPENROUTER_API_KEY to your environment to generate questions.",
    );
  }
  return {
    name: "openrouter",
    model: process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
    maxConcurrency: Number(process.env.LLM_MAX_CONCURRENCY) || 3,
  };
}

export function createLlmClient(): { client: OpenAI; provider: ProviderConfig } {
  const provider = resolveProvider();

  // Fail fast rather than relying on the SDK's built-in retries, which can
  // silently stretch a stuck request across several minutes. Retries that
  // *are* worth doing (429s) are handled explicitly in callWithRetry so we
  // stay in control of the total time budget.
  const common = { timeout: 110_000, maxRetries: 0 };

  const client =
    provider.name === "gemini"
      ? new OpenAI({
          ...common,
          apiKey: process.env.GEMINI_API_KEY,
          baseURL: GEMINI_BASE_URL,
        })
      : new OpenAI({
          ...common,
          apiKey: process.env.OPENROUTER_API_KEY,
          baseURL: OPENROUTER_BASE_URL,
          defaultHeaders: {
            "HTTP-Referer": "https://mission2028-chauhanvineet1.vercel.app",
            "X-Title": "Mission2028",
          },
        });

  return { client, provider };
}

function isRateLimited(err: unknown): boolean {
  const e = err as { status?: number; message?: string };
  // Match HTTP status first — Gemini's compat layer returns both the newer
  // string-code envelope and legacy RESOURCE_EXHAUSTED bodies.
  if (e?.status === 429) return true;
  return /rate limit|quota|resource_exhausted/i.test(e?.message ?? "");
}

/**
 * Runs an LLM call, retrying only on rate limiting. Free-tier Gemini keys
 * have low per-minute limits, and a transient 429 shouldn't fail a whole
 * test generation — but retries are bounded so a sustained outage still
 * surfaces quickly instead of hanging.
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 4000 }: { retries?: number; baseDelayMs?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimited(err) || attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Runs tasks with a cap on how many are in flight at once. Used so a
 * multi-subject test doesn't fire every request simultaneously and trip a
 * provider's per-minute request limit.
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
