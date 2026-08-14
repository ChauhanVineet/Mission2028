import "server-only";
import OpenAI from "openai";

// Which model OpenRouter routes to. Overridable without a code change —
// set OPENROUTER_MODEL in the environment to try a different one.
// Must support structured outputs (json_schema response format); question
// generation depends on it. Verified alternatives with that support:
// anthropic/claude-opus-5 (stronger, ~2.5x the input cost),
// google/gemini-2.5-pro (cheaper input), openai/gpt-4o.
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5";

export function createOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your environment to generate questions.",
    );
  }
  // OpenRouter is OpenAI-API-compatible, so the OpenAI SDK works against it
  // with a different baseURL.
  //
  // Fail fast instead of the SDK's default retry behavior, which can
  // silently stretch a stuck request across several minutes — a full
  // 25-question subject batch measures ~76-95s, so 110s leaves headroom
  // without the old multi-minute hangs. Keep below the maxDuration on any
  // route that calls generateQuestions.
  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    timeout: 110_000,
    maxRetries: 0,
    defaultHeaders: {
      // Optional OpenRouter attribution headers.
      "HTTP-Referer": "https://mission2028-chauhanvineet1.vercel.app",
      "X-Title": "Mission2028",
    },
  });
}
