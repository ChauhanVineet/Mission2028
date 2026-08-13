import "server-only";
import { createAnthropicClient } from "@/lib/anthropic/client";

export type QuestionType = "mcq_single" | "numerical";
export type Difficulty = "easy" | "medium" | "hard";
export type DifficultyCounts = Record<Difficulty, number>;

export type GeneratedQuestion = {
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

export async function generateQuestions(params: {
  subjectName: string;
  topicName: string;
  classLevel: 11 | 12;
  difficultyCounts: DifficultyCounts;
}): Promise<GeneratedQuestion[]> {
  const { subjectName, topicName, classLevel, difficultyCounts } = params;
  const total = Object.values(difficultyCounts).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const client = createAnthropicClient();

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 8000,
    system:
      "You are an expert JEE (Joint Entrance Examination) question setter for Indian Class 11-12 students preparing for JEE Main. " +
      "You write original, exam-quality questions that strictly match the JEE Main pattern: single-correct MCQs (4 options) and " +
      "numerical-answer questions. Every question must be self-contained, unambiguous, and solvable without external references. " +
      "Every solution must be a clear, correct, step-by-step derivation a student can learn from.",
    messages: [
      {
        role: "user",
        content:
          `Generate exactly ${total} JEE Main-style questions for:\n` +
          `Subject: ${subjectName}\n` +
          `Topic: ${topicName} (Class ${classLevel} NCERT syllabus)\n` +
          `Difficulty breakdown (follow this exactly): ${describeCounts(difficultyCounts)}\n\n` +
          `Mix question types (mcq_single and numerical) across the set where it makes sense for this topic. ` +
          `Do not repeat the same question idea twice.`,
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
