import "server-only";
import { createAnthropicClient } from "@/lib/anthropic/client";

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

  const client = createAnthropicClient();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16000,
    system:
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
    messages: [
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
    output_config: {
      format: {
        type: "json_schema",
        schema: QUESTIONS_SCHEMA,
      },
    },
  });

  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text content for question generation.");
  }

  const parsed = JSON.parse(textBlock.text) as { questions: GeneratedQuestion[] };
  return parsed.questions;
}
