// Diagnostic for the configured LLM provider. Run with:
//   node --env-file=.env.local scripts/check-llm.mjs
//
// Verifies, in order:
//   1. which provider/model the app resolves to
//   2. the key authenticates
//   3. the model honours our json_schema structured output
//   4. the output is actually gradeable (MCQ answers match an option)
//
// Exits non-zero on failure so problems are obvious.

import OpenAI from "openai";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const forced = process.env.LLM_PROVIDER?.toLowerCase();
const hasGemini = !!process.env.GEMINI_API_KEY;
const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
const useGemini = forced === "gemini" || (forced !== "openrouter" && hasGemini);

if (!hasGemini && !hasOpenRouter) {
  console.error("FAIL: neither GEMINI_API_KEY nor OPENROUTER_API_KEY is set in .env.local");
  process.exit(1);
}

const provider = useGemini ? "gemini" : "openrouter";
const model = useGemini
  ? process.env.GEMINI_MODEL || "gemini-2.5-pro"
  : process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-5";

const client = new OpenAI({
  apiKey: useGemini ? process.env.GEMINI_API_KEY : process.env.OPENROUTER_API_KEY,
  baseURL: useGemini ? GEMINI_BASE_URL : OPENROUTER_BASE_URL,
  timeout: 110_000,
  maxRetries: 0,
});

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

console.log(`Provider : ${provider}`);
console.log(`Model    : ${model}`);
console.log(`Endpoint : ${useGemini ? GEMINI_BASE_URL : OPENROUTER_BASE_URL}`);

// `--models` lists what this key can actually reach, so a wrong/unavailable
// model slug is easy to spot without guessing.
if (process.argv.includes("--models")) {
  try {
    const list = await client.models.list();
    const ids = [];
    for await (const m of list) ids.push(m.id);
    ids.sort();
    console.log(`\n${ids.length} models available to this key:\n`);
    for (const id of ids) console.log("  " + id);
  } catch (err) {
    console.error("\nFAIL listing models:", err?.status, err?.message);
    process.exit(1);
  }
  process.exit(0);
}

console.log("\nRequesting 4 sample questions (2 topics)...\n");

const start = Date.now();

try {
  const res = await client.chat.completions.create({
    model,
    max_tokens: 8000,
    messages: [
      {
        role: "system",
        content:
          "You are an expert JEE Main question setter. Plain text only — no LaTeX, HTML, Markdown, " +
          "or escape codes like \\u2082. Use real Unicode characters (H₂O, x², π, °C). " +
          "For mcq_single, correct_answer MUST be the exact full text of the correct option, never a letter.",
      },
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
    response_format: {
      type: "json_schema",
      json_schema: { name: "jee_questions", strict: true, schema: SCHEMA },
    },
  });

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const content = res.choices?.[0]?.message?.content;

  if (!content) {
    console.error(`FAIL: empty response (finish_reason=${res.choices?.[0]?.finish_reason})`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    console.error("FAIL: response was not valid JSON. First 300 chars:\n" + content.slice(0, 300));
    process.exit(1);
  }

  const qs = parsed.questions ?? [];
  console.log(`Structured output OK — ${qs.length} questions in ${elapsed}s`);

  const byType = {};
  for (const q of qs) byType[q.type] = (byType[q.type] ?? 0) + 1;
  console.log("  type split      :", JSON.stringify(byType));
  console.log("  topic_index vals:", JSON.stringify(qs.map((q) => q.topic_index)));

  // The check that matters most: grading compares the student's chosen
  // option text to correct_answer, so a letter answer ("B") is unusable.
  const broken = qs.filter(
    (q) => q.type === "mcq_single" && !(q.options ?? []).includes(q.correct_answer),
  );
  if (broken.length) {
    console.log(`\n  WARNING: ${broken.length}/${qs.length} MCQ answers don't match any option.`);
    console.log("  The app repairs letter-style answers automatically, but this model is sloppy.");
    for (const q of broken.slice(0, 2)) {
      console.log(`    correct_answer=${JSON.stringify(q.correct_answer)} options=${JSON.stringify(q.options)}`);
    }
  } else {
    console.log("  MCQ answers     : all match a real option (gradeable)");
  }

  const usage = res.usage;
  if (usage) {
    console.log(
      `  tokens          : ${usage.prompt_tokens} in + ${usage.completion_tokens} out = ${usage.total_tokens}`,
    );
    console.log(
      `  est. full test  : ~${Math.round(usage.total_tokens * (25 / qs.length) * 3).toLocaleString()} tokens for 3 subjects`,
    );
  }

  // A real subject batch is 25 questions, ~6x this sample, so extrapolate
  // and compare against the serverless time budget. Vercel's Hobby plan
  // caps functions at 60s; exceeding it kills generation mid-flight.
  const projected = (Number(elapsed) * 25) / qs.length;
  console.log(`  projected batch : ~${projected.toFixed(0)}s for a full 25-question subject`);
  if (projected > 55) {
    console.log(
      `  NOTE: that's close to / over Vercel's 60s Hobby function limit.\n` +
        `        Use a faster model (e.g. gemini-2.5-flash) or be on Vercel Pro.`,
    );
  }

  console.log("\nSample question:");
  console.log("  Q:", qs[0]?.question_text);
  console.log("  A:", qs[0]?.correct_answer);
  console.log("\nPASS — provider is working.");
} catch (err) {
  console.error(`\nFAIL after ${((Date.now() - start) / 1000).toFixed(1)}s`);
  console.error("  status :", err?.status);
  console.error("  message:", err?.message);
  if (err?.status === 429) {
    console.error("\n  -> Rate limited or out of quota. Wait a minute, or check your provider dashboard.");
  }
  if (err?.status === 404) {
    console.error(`\n  -> Model "${model}" not found. Set GEMINI_MODEL / OPENROUTER_MODEL to a valid slug.`);
  }
  if (err?.status === 401 || err?.status === 403) {
    console.error("\n  -> Key rejected. Check it was pasted correctly and is active.");
  }
  process.exit(1);
}
