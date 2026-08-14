import type { QuestionType } from "@/lib/questions/generate";

// Numerical answers are accepted within a RELATIVE tolerance, not a fixed
// absolute one. JEE answers span a huge range of magnitudes — from physical
// constants (G = 6.67e-11, e = 1.6e-19) to large results (1.5e6) — so a
// fixed absolute window is wrong in both directions: it marks wildly
// incorrect answers correct for tiny values (with a 0.01 window, answering
// "0" for G scored full marks), and rejects trivially-close answers for
// large ones.
const RELATIVE_TOLERANCE = 0.005; // 0.5% — absorbs normal rounding (9.8 vs 9.81)
const ZERO_TOLERANCE = 1e-9; // only used when the correct answer is exactly 0

/**
 * Parses a student's numeric input tolerantly: strips thousands separators,
 * spaces, and a Unicode minus, so "1,500", "1 500" and "−3" behave as
 * expected instead of silently parsing to something else (parseFloat("1,500")
 * would otherwise return 1).
 */
export function parseNumericAnswer(raw: string): number {
  const cleaned = raw
    .trim()
    .replace(/[\s,]/g, "")
    .replace(/−/g, "-") // Unicode minus
    .replace(/^\+/, "");
  if (cleaned === "") return Number.NaN;
  return Number(cleaned);
}

export function isNumericallyCorrect(correctRaw: string, givenRaw: string): boolean {
  const given = parseNumericAnswer(givenRaw);
  const correct = parseNumericAnswer(correctRaw);

  if (!Number.isFinite(given) || !Number.isFinite(correct)) return false;

  if (correct === 0) return Math.abs(given) <= ZERO_TOLERANCE;

  return Math.abs(given - correct) / Math.abs(correct) <= RELATIVE_TOLERANCE;
}

export function gradeAnswer(
  question: { question_type: QuestionType; correct_answer: string },
  selectedAnswer: string | null,
): { isCorrect: boolean | null; marks: number } {
  if (selectedAnswer === null || selectedAnswer.trim() === "") {
    return { isCorrect: null, marks: 0 }; // skipped — no penalty
  }

  if (question.question_type === "mcq_single") {
    // Compare on trimmed text: the stored option and the selected option
    // should be identical, but incidental whitespace must never cost marks.
    const isCorrect =
      selectedAnswer.trim() === (question.correct_answer ?? "").trim();
    return { isCorrect, marks: isCorrect ? 4 : -1 };
  }

  // numerical — no negative marking in JEE Main
  const isCorrect = isNumericallyCorrect(question.correct_answer, selectedAnswer);
  return { isCorrect, marks: isCorrect ? 4 : 0 };
}

export function maxMarksForCount(questionCount: number): number {
  return questionCount * 4;
}
