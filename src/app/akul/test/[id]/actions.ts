"use server";

import { createClient } from "@/lib/supabase/server";
import { gradeAnswer, maxMarksForCount } from "@/lib/tests/grading";
import type { QuestionType } from "@/lib/questions/generate";
import { friendlyErrorMessage } from "@/lib/errors";

async function requireAkul() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null } as const;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "akul") return { supabase, user: null } as const;
  return { supabase, user } as const;
}

export async function startAttempt(
  testId: string,
): Promise<
  | { success: true; attemptId: string; startedAt: string }
  | { success: false; error: string }
> {
  try {
    return await startAttemptInner(testId);
  } catch (err) {
    return {
      success: false,
      error: friendlyErrorMessage(err, "Something went wrong starting the test. Try again."),
    };
  }
}

async function startAttemptInner(
  testId: string,
): Promise<
  | { success: true; attemptId: string; startedAt: string }
  | { success: false; error: string }
> {
  const { supabase, user } = await requireAkul();
  if (!user) return { success: false, error: "Not signed in as Akul." };

  const { data: test } = await supabase
    .from("tests")
    .select("id, status")
    .eq("id", testId)
    .single();

  if (!test) return { success: false, error: "Test not found." };
  if (test.status === "completed") {
    return { success: false, error: "This test is already completed." };
  }

  const { data: existing } = await supabase
    .from("test_attempts")
    .select("id, started_at, submitted_at")
    .eq("test_id", testId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !existing.submitted_at) {
    return { success: true, attemptId: existing.id, startedAt: existing.started_at };
  }

  const { data: attempt, error } = await supabase
    .from("test_attempts")
    .insert({ test_id: testId })
    .select("id, started_at")
    .single();

  if (error || !attempt) {
    return { success: false, error: "Could not start the test." };
  }

  if (test.status === "scheduled") {
    await supabase.from("tests").update({ status: "in_progress" }).eq("id", testId);
  }

  return { success: true, attemptId: attempt.id, startedAt: attempt.started_at };
}

export type SubmitAnswer = {
  questionId: string;
  selectedAnswer: string | null;
  timeSpentSeconds: number;
};

export async function submitAttempt(
  attemptId: string,
  answers: SubmitAnswer[],
): Promise<
  | {
      success: true;
      score: number;
      totalMarks: number;
      correctCount: number;
      incorrectCount: number;
      skippedCount: number;
    }
  | { success: false; error: string }
> {
  try {
    return await submitAttemptInner(attemptId, answers);
  } catch (err) {
    return {
      success: false,
      error: friendlyErrorMessage(err, "Something went wrong submitting the test. Try again."),
    };
  }
}

async function submitAttemptInner(
  attemptId: string,
  answers: SubmitAnswer[],
): Promise<
  | {
      success: true;
      score: number;
      totalMarks: number;
      correctCount: number;
      incorrectCount: number;
      skippedCount: number;
    }
  | { success: false; error: string }
> {
  const { supabase, user } = await requireAkul();
  if (!user) return { success: false, error: "Not signed in as Akul." };

  const { data: attempt } = await supabase
    .from("test_attempts")
    .select("id, test_id, submitted_at")
    .eq("id", attemptId)
    .single();

  if (!attempt) return { success: false, error: "Attempt not found." };
  if (attempt.submitted_at) {
    return { success: false, error: "This test was already submitted." };
  }

  const questionIds = answers.map((a) => a.questionId);
  const { data: questions } = await supabase
    .from("questions")
    .select("id, question_type, correct_answer")
    .in("id", questionIds)
    .returns<{ id: string; question_type: QuestionType; correct_answer: string }[]>();

  if (!questions) {
    return { success: false, error: "Could not load questions for grading." };
  }
  const questionById = new Map(questions.map((q) => [q.id, q]));

  let score = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;

  const rows = answers.map((a) => {
    const question = questionById.get(a.questionId);
    if (!question) {
      skippedCount += 1;
      return {
        attempt_id: attemptId,
        question_id: a.questionId,
        selected_answer: null,
        is_correct: null,
        marks_awarded: 0,
        time_spent_seconds: a.timeSpentSeconds,
      };
    }

    const { isCorrect, marks } = gradeAnswer(question, a.selectedAnswer);
    score += marks;
    if (isCorrect === true) correctCount += 1;
    else if (isCorrect === false) incorrectCount += 1;
    else skippedCount += 1;

    return {
      attempt_id: attemptId,
      question_id: a.questionId,
      selected_answer: a.selectedAnswer,
      is_correct: isCorrect,
      marks_awarded: marks,
      time_spent_seconds: a.timeSpentSeconds,
    };
  });

  const { error: insertError } = await supabase.from("attempt_answers").insert(rows);
  if (insertError) {
    return { success: false, error: "Failed to save answers." };
  }

  const totalMarks = maxMarksForCount(answers.length);

  const { error: updateAttemptError } = await supabase
    .from("test_attempts")
    .update({ submitted_at: new Date().toISOString(), score, total_marks: totalMarks })
    .eq("id", attemptId);

  if (updateAttemptError) {
    return { success: false, error: "Failed to finalize the attempt." };
  }

  await supabase.from("tests").update({ status: "completed" }).eq("id", attempt.test_id);

  return {
    success: true,
    score,
    totalMarks,
    correctCount,
    incorrectCount,
    skippedCount,
  };
}
