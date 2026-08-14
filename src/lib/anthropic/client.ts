import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to generate questions.",
    );
  }
  // Fail fast instead of the SDK's default multi-retry behavior, which can
  // silently stretch a single stuck/rate-limited request across several
  // minutes-long attempts — worse than just erroring so the parent can
  // retry from the UI.
  return new Anthropic({ apiKey, timeout: 55_000, maxRetries: 0 });
}
