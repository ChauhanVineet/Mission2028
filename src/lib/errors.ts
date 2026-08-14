// Turns an unknown thrown value into a short, user-facing message. Used by
// server actions so unexpected failures (network blips, provider outages,
// bugs we haven't seen yet) always surface *something* actionable to the
// user instead of failing silently or leaking a raw stack trace.
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const message = err.message;

    if (/credit balance is too low/i.test(message)) {
      return "The AI question generator is out of credits. Add credits at console.anthropic.com, then try again.";
    }
    if (/rate limit/i.test(message)) {
      return "The AI question generator is temporarily rate-limited. Wait a minute and try again.";
    }
    if (/timeout|timed out/i.test(message)) {
      return "That took too long and timed out. Try again, or select fewer topics at once.";
    }
    if (/overloaded/i.test(message)) {
      return "The AI question generator is overloaded right now. Try again in a bit.";
    }
  }

  return fallback;
}
