import type { Difficulty, DifficultyCounts, QuestionType } from "@/lib/questions/generate";

export type DifficultyMix = "easy" | "balanced" | "hard";

export type QuestionTypeCounts = Record<QuestionType, number>;

// JEE Main's fixed per-subject pattern: Section A is 20 single-correct MCQs,
// Section B is 5 numerical-value questions — a strict 4:1 (80/20) split.
// This ratio is not user-configurable; it applies regardless of topic count.
const QUESTION_TYPE_WEIGHTS: Record<QuestionType, number> = {
  mcq_single: 0.8,
  numerical: 0.2,
};

// Splits `count` questions into mcq_single/numerical using the same
// largest-remainder rounding as allocateDifficulty, so totals always add
// back up to `count` exactly.
export function allocateQuestionTypes(count: number): QuestionTypeCounts {
  const types: QuestionType[] = ["mcq_single", "numerical"];

  const raw = types.map((type) => count * QUESTION_TYPE_WEIGHTS[type]);
  const floored = raw.map(Math.floor);
  let remainder = count - floored.reduce((a, b) => a + b, 0);

  const order = types
    .map((type, i) => ({ type, frac: raw[i] - floored[i] }))
    .sort((a, b) => b.frac - a.frac);

  const result: QuestionTypeCounts = { mcq_single: 0, numerical: 0 };
  types.forEach((type, i) => {
    result[type] = floored[i];
  });

  for (const { type } of order) {
    if (remainder <= 0) break;
    result[type] += 1;
    remainder -= 1;
  }

  return result;
}

const MIX_WEIGHTS: Record<DifficultyMix, Record<Difficulty, number>> = {
  easy: { easy: 0.5, medium: 0.3, hard: 0.2 },
  balanced: { easy: 0.34, medium: 0.33, hard: 0.33 },
  hard: { easy: 0.2, medium: 0.3, hard: 0.5 },
};

// Splits `count` questions across three difficulty levels using largest-remainder
// rounding, so the totals always add back up to `count` exactly.
export function allocateDifficulty(
  count: number,
  mix: DifficultyMix,
): DifficultyCounts {
  const weights = MIX_WEIGHTS[mix];
  const levels: Difficulty[] = ["easy", "medium", "hard"];

  const raw = levels.map((level) => count * weights[level]);
  const floored = raw.map(Math.floor);
  let remainder = count - floored.reduce((a, b) => a + b, 0);

  const order = levels
    .map((level, i) => ({ level, frac: raw[i] - floored[i] }))
    .sort((a, b) => b.frac - a.frac);

  const result: DifficultyCounts = { easy: 0, medium: 0, hard: 0 };
  levels.forEach((level, i) => {
    result[level] = floored[i];
  });

  for (const { level } of order) {
    if (remainder <= 0) break;
    result[level] += 1;
    remainder -= 1;
  }

  return result;
}

// Splits `totalQuestions` as evenly as possible across N topics, e.g.
// (10, 3) -> [4, 3, 3].
export function allocateAcrossTopics(
  totalQuestions: number,
  topicCount: number,
): number[] {
  const base = Math.floor(totalQuestions / topicCount);
  let remainder = totalQuestions - base * topicCount;

  return Array.from({ length: topicCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return base + extra;
  });
}
