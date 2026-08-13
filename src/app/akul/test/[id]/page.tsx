import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { StartTestButton } from "@/components/StartTestButton";
import { TestRunner, ResultSummary } from "@/components/TestRunner";
import type { QuestionType } from "@/lib/questions/generate";

// Question generation can be slow; give this route (and its Server Actions)
// enough headroom, matching the scheduling route.
export const maxDuration = 60;

type TestRow = {
  id: string;
  title: string;
  status: string;
  deadline: string;
  duration_minutes: number;
  question_count: number;
};

type AttemptRow = {
  id: string;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
  total_marks: number | null;
};

type TestQuestionRow = {
  order_index: number;
  questions: {
    id: string;
    question_type: QuestionType;
    question_text: string;
    options: string[];
  } | null;
};

export default async function TakeTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "akul") redirect("/");

  const { data: test } = await supabase
    .from("tests")
    .select("id, title, status, deadline, duration_minutes, question_count")
    .eq("id", id)
    .single<TestRow>();

  if (!test) notFound();

  const { data: attempt } = await supabase
    .from("test_attempts")
    .select("id, started_at, submitted_at, score, total_marks")
    .eq("test_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AttemptRow>();

  // Already completed — show the final score.
  if (attempt?.submitted_at) {
    const { data: answerRows } = await supabase
      .from("attempt_answers")
      .select("is_correct")
      .eq("attempt_id", attempt.id)
      .returns<{ is_correct: boolean | null }[]>();

    const correctCount = (answerRows ?? []).filter((a) => a.is_correct === true).length;
    const incorrectCount = (answerRows ?? []).filter((a) => a.is_correct === false).length;
    const skippedCount = (answerRows ?? []).filter((a) => a.is_correct === null).length;

    return (
      <ResultSummary
        testTitle={test.title}
        result={{
          score: attempt.score ?? 0,
          totalMarks: attempt.total_marks ?? 0,
          correctCount,
          incorrectCount,
          skippedCount,
        }}
      />
    );
  }

  // In-progress attempt — resume the exam.
  if (attempt) {
    const { data: testQuestions } = await supabase
      .from("test_questions")
      .select("order_index, questions(id, question_type, question_text, options)")
      .eq("test_id", id)
      .order("order_index")
      .returns<TestQuestionRow[]>();

    const questions = (testQuestions ?? [])
      .filter((row) => row.questions)
      .map((row) => ({
        id: row.questions!.id,
        type: row.questions!.question_type,
        question_text: row.questions!.question_text,
        options: row.questions!.options,
      }));

    return (
      <TestRunner
        attemptId={attempt.id}
        startedAt={attempt.started_at}
        durationMinutes={test.duration_minutes}
        questions={questions}
        testTitle={test.title}
      />
    );
  }

  // Not started yet.
  const deadlinePassed = new Date(test.deadline).getTime() < Date.now();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/akul"
          className="mb-6 inline-block text-sm text-indigo-600 hover:text-indigo-700"
        >
          ← Back
        </Link>

        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-slate-900">
            {test.title}
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            {test.question_count} questions · {test.duration_minutes} minutes ·
            +4 for correct, −1 for wrong MCQ (0 for wrong numerical)
          </p>

          {deadlinePassed ? (
            <p className="rounded-xl bg-red-50 p-4 text-sm text-red-600">
              The deadline for this test has passed.
            </p>
          ) : (
            <>
              <p className="mb-6 text-sm text-slate-500">
                Once you start, the timer won&apos;t stop — make sure you&apos;re
                ready.
              </p>
              <StartTestButton testId={test.id} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
