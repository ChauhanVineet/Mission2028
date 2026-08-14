import type { Difficulty, QuestionType } from "@/lib/questions/generate";

export type GradedAnswer = {
  questionId: string;
  questionType: QuestionType;
  difficulty: Difficulty;
  questionText: string;
  options: string[];
  correctAnswer: string;
  solution: string;
  topicName: string;
  subjectName: string;
  selectedAnswer: string | null;
  isCorrect: boolean | null; // null = skipped
  marksAwarded: number;
  timeSpentSeconds: number;
};

export type BreakdownRow = { label: string; correct: number; total: number };

export function computeBreakdown(
  answers: GradedAnswer[],
  key: "topicName" | "difficulty",
): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow>();

  for (const answer of answers) {
    const label = answer[key];
    const row = rows.get(label) ?? { label, correct: 0, total: 0 };
    row.total += 1;
    if (answer.isCorrect) row.correct += 1;
    rows.set(label, row);
  }

  return [...rows.values()];
}

// Wrong and skipped first (most useful for review), correct questions last.
export function sortForReview(answers: GradedAnswer[]): GradedAnswer[] {
  const rank = (a: GradedAnswer) => (a.isCorrect === false ? 0 : a.isCorrect === null ? 1 : 2);
  return [...answers].sort((a, b) => rank(a) - rank(b));
}
