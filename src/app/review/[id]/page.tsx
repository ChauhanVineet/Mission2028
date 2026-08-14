import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeBreakdown, sortForReview, type GradedAnswer } from "@/lib/tests/analysis";
import type { Difficulty, QuestionType } from "@/lib/questions/generate";
import { themeForLabel } from "@/lib/colorTheme";
import { PageNav } from "@/components/PageNav";

type AttemptAnswerRow = {
  selected_answer: string | null;
  is_correct: boolean | null;
  marks_awarded: number;
  time_spent_seconds: number;
  questions: {
    id: string;
    question_type: QuestionType;
    difficulty: Difficulty;
    question_text: string;
    options: string[];
    correct_answer: string;
    solution: string;
    topics: { name: string; subjects: { name: string } | null } | null;
  } | null;
};

const DIFFICULTY_ORDER: Difficulty[] = ["easy", "medium", "hard"];

export default async function ReviewPage({
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

  if (!profile) redirect("/login");

  const { data: test } = await supabase
    .from("tests")
    .select("id, title, question_count")
    .eq("id", id)
    .single();

  if (!test) notFound();

  const { data: attempt } = await supabase
    .from("test_attempts")
    .select("id, score, total_marks, submitted_at")
    .eq("test_id", id)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const backHref = profile.role === "parent" ? "/parent" : "/akul";

  if (!attempt) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-purple-50 to-white p-6">
        <div className="mx-auto max-w-2xl">
          <PageNav homeHref={backHref} />
          <div className="animate-pop-in rounded-2xl bg-white p-8 text-center shadow-sm">
            <h1 className="mb-2 text-lg font-semibold text-slate-900">{test.title}</h1>
            <p className="text-sm text-slate-500">This test hasn&apos;t been completed yet.</p>
          </div>
        </div>
      </div>
    );
  }

  const { data: answerRows } = await supabase
    .from("attempt_answers")
    .select(
      "selected_answer, is_correct, marks_awarded, time_spent_seconds, questions(id, question_type, difficulty, question_text, options, correct_answer, solution, topics(name, subjects(name)))",
    )
    .eq("attempt_id", attempt.id)
    .returns<AttemptAnswerRow[]>();

  const answers: GradedAnswer[] = (answerRows ?? [])
    .filter((row) => row.questions)
    .map((row) => ({
      questionId: row.questions!.id,
      questionType: row.questions!.question_type,
      difficulty: row.questions!.difficulty,
      questionText: row.questions!.question_text,
      options: row.questions!.options,
      correctAnswer: row.questions!.correct_answer,
      solution: row.questions!.solution,
      topicName: row.questions!.topics?.name ?? "Unknown",
      subjectName: row.questions!.topics?.subjects?.name ?? "Unknown",
      selectedAnswer: row.selected_answer,
      isCorrect: row.is_correct,
      marksAwarded: row.marks_awarded,
      timeSpentSeconds: row.time_spent_seconds,
    }));

  const topicBreakdown = computeBreakdown(answers, "topicName");
  const difficultyBreakdown = computeBreakdown(answers, "difficulty").sort(
    (a, b) => DIFFICULTY_ORDER.indexOf(a.label as Difficulty) - DIFFICULTY_ORDER.indexOf(b.label as Difficulty),
  );
  const orderedAnswers = sortForReview(answers);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-indigo-50 via-purple-50 to-white p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-purple-200 opacity-30 blur-3xl" />

      <div className="relative mx-auto max-w-3xl">
        <PageNav homeHref={backHref} />

        <div className="mb-6 animate-pop-in rounded-3xl bg-white p-6 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-slate-900">{test.title}</h1>
          <p className="mb-4 text-sm text-slate-500">
            Submitted {new Date(attempt.submitted_at!).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
          <p className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-4xl font-extrabold text-transparent">
            {attempt.score}
            <span className="text-xl text-slate-400">/{attempt.total_marks}</span>
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <BreakdownCard title="By topic" rows={topicBreakdown} delay={80} />
          <BreakdownCard title="By difficulty" rows={difficultyBreakdown} capitalize delay={140} />
        </div>

        <div className="space-y-4">
          {orderedAnswers.map((answer, i) => (
            <AnswerCard key={answer.questionId} answer={answer} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

function breakdownBarColor(pct: number) {
  if (pct >= 75) return "from-emerald-400 to-teal-500";
  if (pct >= 50) return "from-amber-400 to-orange-500";
  return "from-rose-400 to-red-500";
}

function BreakdownCard({
  title,
  rows,
  capitalize,
  delay = 0,
}: {
  title: string;
  rows: { label: string; correct: number; total: number }[];
  capitalize?: boolean;
  delay?: number;
}) {
  return (
    <div
      className="animate-fade-in-up rounded-2xl bg-white p-5 shadow-sm"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="mb-3 text-sm font-semibold text-slate-700">{title}</h2>
      <div className="space-y-2.5">
        {rows.map((row) => {
          const pct = row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0;
          return (
            <div key={row.label}>
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span className={capitalize ? "capitalize" : ""}>{row.label}</span>
                <span>
                  {row.correct}/{row.total}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${breakdownBarColor(pct)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnswerCard({ answer, index }: { answer: GradedAnswer; index: number }) {
  const statusLabel =
    answer.isCorrect === true ? "Correct" : answer.isCorrect === false ? "Incorrect" : "Skipped";
  const statusClasses =
    answer.isCorrect === true
      ? "bg-emerald-50 text-emerald-700"
      : answer.isCorrect === false
        ? "bg-rose-50 text-rose-700"
        : "bg-slate-100 text-slate-600";
  const borderAccent =
    answer.isCorrect === true
      ? "border-l-emerald-400"
      : answer.isCorrect === false
        ? "border-l-rose-400"
        : "border-l-slate-300";
  const subjectTheme = themeForLabel(answer.subjectName);

  const solutionBlock = (
    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
      <p className="mb-1 font-medium text-slate-500">Solution</p>
      <p className="whitespace-pre-line">{answer.solution}</p>
    </div>
  );

  return (
    <div
      className={`animate-fade-in-up rounded-2xl border-l-4 bg-white p-5 shadow-sm ${borderAccent}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-400">Q{index + 1}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClasses}`}>
          {statusLabel}
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${subjectTheme.bg} ${subjectTheme.text}`}>
          {answer.subjectName} · {answer.topicName}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500">
          {answer.difficulty}
        </span>
        {answer.timeSpentSeconds > 0 && (
          <span className="ml-auto text-[11px] text-slate-400">
            {Math.round(answer.timeSpentSeconds)}s spent
          </span>
        )}
      </div>

      <p className="mb-3 text-sm text-slate-800">{answer.questionText}</p>

      {answer.questionType === "mcq_single" ? (
        <ul className="mb-1 space-y-1">
          {answer.options.map((option, oi) => {
            const isCorrectOption = option === answer.correctAnswer;
            const isSelected = option === answer.selectedAnswer;
            let classes = "bg-slate-50 text-slate-600";
            if (isCorrectOption) classes = "bg-green-50 font-medium text-green-700";
            else if (isSelected) classes = "bg-red-50 font-medium text-red-700";
            return (
              <li key={oi} className={`rounded-md px-3 py-1.5 text-sm ${classes}`}>
                {option}
                {isCorrectOption && " ✓"}
                {isSelected && !isCorrectOption && " ✗ (your answer)"}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mb-1 space-y-1 text-sm">
          <p className="font-medium text-green-700">Correct answer: {answer.correctAnswer}</p>
          {answer.selectedAnswer && answer.isCorrect === false && (
            <p className="font-medium text-red-700">Your answer: {answer.selectedAnswer}</p>
          )}
          {!answer.selectedAnswer && <p className="text-slate-500">You skipped this question</p>}
        </div>
      )}

      {answer.isCorrect === true ? (
        <details className="mt-2 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-500">Solution</summary>
          <p className="mt-2 whitespace-pre-line">{answer.solution}</p>
        </details>
      ) : (
        solutionBlock
      )}
    </div>
  );
}
