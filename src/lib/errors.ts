// Turns an unknown thrown value into a short, user-facing message. Used by
// server actions so unexpected failures (network blips, provider outages,
// bugs we haven't seen yet) always surface *something* actionable to the
// user instead of failing silently or leaking a raw stack trace.
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const message = err.message;
    // OpenAI-compatible SDK errors carry an HTTP status.
    const status = (err as { status?: number }).status;

    if (status === 401 || /invalid api key|no auth credentials/i.test(message)) {
      return "The question generator's API key is missing or invalid. Check OPENROUTER_API_KEY.";
    }
    if (
      status === 402 ||
      /credit balance is too low|insufficient credits|requires more credits/i.test(message)
    ) {
      return "The AI question generator is out of credits. Top up your OpenRouter account, then try again.";
    }
    if (status === 429 || /rate limit/i.test(message)) {
      return "The AI question generator is temporarily rate-limited. Wait a minute and try again.";
    }
    if (/timeout|timed out/i.test(message)) {
      return "That took too long and timed out. Try again, or select fewer topics at once.";
    }
    if (status === 503 || /overloaded|no (available )?providers|temporarily unavailable/i.test(message)) {
      return "The AI question generator is unavailable right now. Try again in a bit.";
    }
    if (/malformed JSON|empty response|no questions/i.test(message)) {
      return "The question generator returned an unusable response. Try again — if it keeps happening, try a different model.";
    }
  }

  return fallback;
}
