import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export function createAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to generate questions.",
    );
  }
  return new Anthropic({ apiKey });
}
