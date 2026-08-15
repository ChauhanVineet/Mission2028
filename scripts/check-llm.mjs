// Quick health check for question generation, without going through the app.
//
//   node --env-file=.env.local scripts/check-llm.mjs
//
// Confirms the Anthropic key works, the model honours our JSON schema, and
// the returned questions are actually gradeable (MCQ answers must be the
// option's full text, not a letter label).

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("FAIL: ANTHROPIC_API_KEY is not set in .env.local");
  process.exit(1);
}

// Keep in sync with src/lib/llm/client.ts
const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 0 });

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic_index: { type: "integer" },
          type: { type: "string", enum: ["mcq_single", "numerical"] },
          question_text: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correct_answer: { type: "string" },
          solution: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
        },
        required: [
          "topic_index",
          "type",
          "question_text",
          "options",
          "correct_answer",
          "solution",
          "difficulty",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
};

console.log(`Provider : anthropic`);
console.log(`Model    : ${model}`);
console.log("\nRequesting 4 sample questions (2 topics)...\n");

const start = Date.now();

try {
  const res = await client.messages.create({
    model,
    max_tokens: 8000,
    system:
      "You are an expert JEE Main question setter. Plain text only — no LaTeX, HTML, Markdown, " +
      "or escape codes like \\u2082. Use real Unicode characters (H₂O, x², π, °C). " +
      "For mcq_single, correct_answer MUST be the exact full text of the correct option, never a letter.",
    messages: [
      {
        role: "user",
        content:
          "Generate exactly 4 JEE Main-style questions for Physics.\n\n" +
          'Topic 0 — "Gravitation" (Class 11): 2 questions.\n' +
          'Topic 1 — "Oscillations" (Class 11): 2 questions.\n\n' +
          "Type breakdown across the ENTIRE set: 3 mcq_single, 1 numerical. " +
          "Tag every question with its topic_index.",
      },
    ],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const block = res.content.find((b) => b.type === "text");
  if (!block) {
    console.error(`FAIL after ${elapsed}s: no text content (stop_reason=${res.stop_reason})`);
    process.exit(1);
  }

  const parsed = JSON.parse(block.text);
  const questions = parsed.questions ?? [];

  const byType = {};
  for (const q of questions) byType[q.type] = (byType[q.type] ?? 0) + 1;

  // The bug that matters most: grading compares the student's selected
  // option text to correct_answer, so an MCQ whose answer isn't one of its
  // own options can never be answered correctly.
  const ungradeable = questions.filter(
    (q) => q.type === "mcq_single" && !(q.options ?? []).includes(q.correct_answer),
  );

  console.log(`OK in ${elapsed}s — ${questions.length} questions`);
  console.log("  type split      :", JSON.stringify(byType));
  console.log("  topic_index vals:", JSON.stringify(questions.map((q) => q.topic_index)));
  console.log("  usage           :", `${res.usage.input_tokens} in / ${res.usage.output_tokens} out`);
  console.log(
    "  gradeable MCQs  :",
    ungradeable.length === 0
      ? "all good"
      : `${ungradeable.length} BAD (answer not among options) e.g. ${JSON.stringify(ungradeable[0].correct_answer)}`,
  );

  const sample = questions[0];
  if (sample) {
    console.log("\n  sample question :", sample.question_text);
    if (sample.options?.length) console.log("  options         :", JSON.stringify(sample.options));
    console.log("  correct answer  :", sample.correct_answer);
  }

  process.exit(ungradeable.length === 0 ? 0 : 1);
} catch (err) {
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`\nFAIL after ${elapsed}s`);
  console.error("  status :", err?.status);
  console.error("  message:", err?.message);
  if (err?.status === 404) {
    console.error(`\n  -> Model "${model}" not found. Set ANTHROPIC_MODEL to a valid name.`);
  }
  if (err?.status === 400 && /credit/i.test(err?.message ?? "")) {
    console.error("\n  -> Out of credits. Top up at console.anthropic.com.");
  }
  process.exit(1);
}
