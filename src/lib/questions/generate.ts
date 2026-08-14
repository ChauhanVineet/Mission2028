import "server-only";
import { callWithRetry, createLlmClient } from "@/lib/llm/client";

export type QuestionType = "mcq_single" | "numerical";
export type Difficulty = "easy" | "medium" | "hard";
export type DifficultyCounts = Record<Difficulty, number>;

export type TopicRequest = {
  topicName: string;
  classLevel: 11 | 12;
  difficultyCounts: DifficultyCounts;
};

export type GeneratedQuestion = {
  topicIndex: number;
  type: QuestionType;
  question_text: string;
  options: string[];
  correct_answer: string;
  solution: string;
  difficulty: Difficulty;
};

// Exactly as it comes back from the model, matching QUESTIONS_SCHEMA's
// field names (snake_case topic_index). Mapped to GeneratedQuestion before
// leaving this module.
type RawGeneratedQuestion = {
  topic_index: number;
  type: QuestionType;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  solution: string;
  difficulty: Difficulty;
};

const QUESTIONS_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic_index: {
            type: "integer",
            description:
              "0-based index into the requested topic list (see the numbered topic breakdown in the prompt) that this question belongs to.",
          },
          type: {
            type: "string",
            enum: ["mcq_single", "numerical"],
            description:
              "mcq_single: single-correct multiple choice with 4 options. numerical: answer is a numeric value, no options.",
          },
          question_text: { type: "string" },
          options: {
            type: "array",
            items: { type: "string" },
            description:
              "Exactly 4 options for mcq_single, formatted without leading labels like 'A)'. Empty array for numerical.",
          },
          correct_answer: {
            type: "string",
            description:
              "For mcq_single, the exact text of the correct option. For numerical, the numeric answer (plain number, e.g. '12.5').",
          },
          solution: {
            type: "string",
            description:
              "A full worked solution explaining how to arrive at the answer, step by step.",
          },
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
} as const;

function describeCounts(counts: DifficultyCounts): string {
  return (Object.entries(counts) as [Difficulty, number][])
    .filter(([, n]) => n > 0)
    .map(([level, n]) => `${n} ${level}`)
    .join(", ");
}

function describeTopics(topics: TopicRequest[]): string {
  return topics
    .map((t, i) => {
      const total = Object.values(t.difficultyCounts).reduce((a, b) => a + b, 0);
      return (
        `Topic ${i} — "${t.topicName}" (Class ${t.classLevel} NCERT syllabus): ${total} questions. ` +
        `Difficulty breakdown: ${describeCounts(t.difficultyCounts)}.`
      );
    })
    .join("\n");
}

// One call generates every question for an entire subject (across all of
// its selected topics) in a single request, instead of one call per topic.
// A subject can have 20-30 topics, and firing that many questions calls in
// parallel (via Promise.all, one per topic) can blow through Anthropic's
// concurrency/rate limits — the resulting retries/backoff are what turned a
// "should take under a minute" generation into a 15-minute hang.
//
// The mcq_single/numerical split is enforced once for the whole subject
// total, not per topic: splitting it per topic first (when a subject's 25
// questions are spread across 20+ topics) rounds almost every topic down to
// "1 question, 100% mcq_single", so the aggregate result skewed to nearly
// all MCQ with ~0 numerical despite requesting an 80/20 split.
export async function generateQuestions(params: {
  subjectName: string;
  topics: TopicRequest[];
  typeCounts: Record<QuestionType, number>;
}): Promise<GeneratedQuestion[]> {
  const { subjectName, topics, typeCounts } = params;
  const grandTotal = topics.reduce(
    (sum, t) => sum + Object.values(t.difficultyCounts).reduce((a, b) => a + b, 0),
    0,
  );
  if (grandTotal === 0) return [];

  const { client, provider } = createLlmClient();

  const response = await callWithRetry(() =>
    client.chat.completions.create({
    model: provider.model,
    max_tokens: 16000,
    messages: [
      {
        role: "system",
        content:
          "You are an expert JEE (Joint Entrance Examination) question setter for Indian Class 11-12 students preparing for JEE Main. " +
          "You write original, exam-quality questions that strictly match the JEE Main pattern: single-correct MCQs (4 options) and " +
          "numerical-answer questions, in the exact type counts requested — this mirrors JEE Main's fixed Section A (MCQ) / Section B " +
          "(numerical) structure and is not negotiable. Every question must be self-contained, unambiguous, and solvable without " +
          "external references. Every solution must be a clear, correct, step-by-step derivation a student can learn from.\n\n" +
          "TEXT FORMATTING — strict, no exceptions: all text is rendered as plain text with no markup interpreter (no LaTeX, no " +
          "HTML, no Markdown). Never write LaTeX (no $, \\_, \\^, \\frac, \\text, etc.), HTML tags (no <sub>, <sup>), Markdown, or " +
          "literal escape-sequence text such as \\u2082 or \\u00b2. For subscripts and superscripts (chemical formulas, exponents, " +
          "units, ordinals), type the actual Unicode character directly, e.g. H₂O, CO₂, Fe²⁺, x², 10⁻³, Ω, °C, √, π, ×, ÷, ±, ≤, ≥, " +
          "→. If a required character has no clean Unicode subscript/superscript form, write it inline instead (e.g. 'x to the " +
          "power n' or 'x^n' as last resort, never a raw escape code).",
      },
      {
        role: "user",
        content:
          `Generate exactly ${grandTotal} JEE Main-style questions total for ${subjectName}, covering these topics ` +
          `(follow every count exactly — this is a strict JEE Main format requirement):\n\n` +
          describeTopics(topics) +
          `\n\nQuestion type breakdown across the ENTIRE set (follow this exactly — this is a strict JEE Main format ` +
          `requirement): ${typeCounts.mcq_single} mcq_single, ${typeCounts.numerical} numerical, distributed across ` +
          `the topics above however makes sense (a single topic can be all one type). ` +
          `Tag every question with the topic_index it belongs to, exactly matching the numbers above. ` +
          `Distribute difficulty levels across both question types as makes sense pedagogically. ` +
          `Do not repeat the same question idea twice, including across different topics.`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "jee_questions",
        strict: true,
        schema: QUESTIONS_SCHEMA,
      },
    },
    }),
  );

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("The question generator returned an empty response.");
  }

  let parsed: { questions: RawGeneratedQuestion[] };
  try {
    parsed = JSON.parse(content) as { questions: RawGeneratedQuestion[] };
  } catch {
    throw new Error("The question generator returned malformed JSON.");
  }

  if (!Array.isArray(parsed?.questions)) {
    throw new Error("The question generator returned no questions.");
  }

  // The schema uses snake_case topic_index (models follow schema field names
  // literally); map it to the camelCase shape the rest of the app expects.
  const mapped = parsed.questions.map((q) => ({
    topicIndex: q.topic_index,
    type: q.type,
    question_text: cleanQuestionText(q.question_text ?? ""),
    options: (q.options ?? []).map(stripOptionLabel),
    correct_answer: (q.correct_answer ?? "").trim(),
    solution: q.solution ?? "",
    difficulty: q.difficulty,
  }));

  // Grading compares the student's selected option text against
  // correct_answer, so an MCQ whose correct_answer isn't one of its options
  // can never be answered correctly. Repair the common case (the model
  // answered with a letter label like "B") and drop anything still
  // ungradeable rather than shipping a question that is always marked wrong.
  return mapped
    .map((q) => (q.type === "mcq_single" ? repairMcqAnswer(q) : q))
    .filter((q) => {
      if (!q.question_text || !q.correct_answer) return false;
      if (q.type !== "mcq_single") return true;
      return q.options.length > 0 && q.options.includes(q.correct_answer);
    });
}

// Models sometimes prefix options with their label ("A) 9.8 m/s²"); the UI
// renders options as-is, and grading matches on exact text, so normalize.
function stripOptionLabel(option: string): string {
  return option.trim().replace(/^\(?[A-Da-d][)\].:]\s+/, "").trim();
}

// Some models echo the scaffolding from the prompt into the question itself
// (e.g. "Topic 0 - Easy (MCQ): The gravitational force..."). Prefixes can be
// stacked, so strip repeatedly until nothing more matches.
const SCAFFOLD_PREFIXES = [
  /^Topic\s*\d+\s*[-–—:]\s*/i,
  // Combined forms like "Easy (MCQ):" / "Hard (numerical) -"
  /^(?:easy|medium|hard)\s*\((?:MCQ|numerical)\)\s*[-–—:]?\s*/i,
  /^\((?:easy|medium|hard)\)\s*[-–—:]?\s*/i,
  /^(?:easy|medium|hard)\s*[-–—:]\s*/i,
  /^\((?:MCQ|numerical)\)\s*[-–—:]?\s*/i,
  /^(?:MCQ|numerical)\s*[-–—:]\s*/i,
  /^Q\s*\d*\s*[-–—.:]\s*/i,
];

function cleanQuestionText(text: string): string {
  let out = text.trim();
  for (let pass = 0; pass < 6; pass++) {
    const before = out;
    for (const pattern of SCAFFOLD_PREFIXES) {
      out = out.replace(pattern, "").trim();
    }
    if (out === before) break;
  }
  return out;
}

// If correct_answer came back as a bare option label ("B", "(b)", "Option C")
// instead of the option's text, resolve it to the actual option.
function repairMcqAnswer<T extends { options: string[]; correct_answer: string }>(
  q: T,
): T {
  if (q.options.includes(q.correct_answer)) return q;

  const letter = q.correct_answer
    .trim()
    .replace(/^option\s+/i, "")
    .replace(/[()\].:]/g, "")
    .trim();

  if (/^[A-Da-d]$/.test(letter)) {
    const index = letter.toUpperCase().charCodeAt(0) - 65;
    if (index >= 0 && index < q.options.length) {
      return { ...q, correct_answer: q.options[index] };
    }
  }

  // Fall back to a case-insensitive text match before giving up.
  const match = q.options.find(
    (o) => o.toLowerCase() === q.correct_answer.toLowerCase(),
  );
  return match ? { ...q, correct_answer: match } : q;
}
