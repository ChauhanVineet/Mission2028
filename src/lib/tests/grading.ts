import type { QuestionType } from "@/lib/questions/generate";

const NUMERICAL_TOLERANCE = 0.01;

export function gradeAnswer(
  question: { question_type: QuestionType; correct_answer: string },
  selectedAnswer: string | null,
): { isCorrect: boolean | null; marks: number } {
  if (selectedAnswer === null || selectedAnswer.trim() === "") {
    return { isCorrect: null, marks: 0 }; // skipped — no penalty
  }

  if (question.question_type === "mcq_single") {
    const isCorrect = selectedAnswer === question.correct_answer;
    return { isCorrect, marks: isCorrect ? 4 : -1 };
  }

  // numerical — no negative marking, tolerant of small formatting differences
  const given = Number.parseFloat(selectedAnswer);
  const correct = Number.parseFloat(question.correct_answer);
  const isCorrect =
    !Number.isNaN(given) &&
    !Number.isNaN(correct) &&
    Math.abs(given - correct) < NUMERICAL_TOLERANCE;
  return { isCorrect, marks: isCorrect ? 4 : 0 };
}

export function maxMarksForCount(questionCount: number): number {
  return questionCount * 4;
}
