"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  submitAttempt,
  type SubmitAnswer,
} from "@/app/akul/test/[id]/actions";
import { Spinner } from "@/components/Spinner";

type RunnerQuestion = {
  id: string;
  type: "mcq_single" | "numerical";
  question_text: string;
  options: string[];
};

type SubmitResult = {
  score: number;
  totalMarks: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
};

export function TestRunner({
  attemptId,
  startedAt,
  durationMinutes,
  questions,
  testTitle,
}: {
  attemptId: string;
  startedAt: string;
  durationMinutes: number;
  questions: RunnerQuestion[];
  testTitle: string;
}) {
  const router = useRouter();
  const totalSeconds = durationMinutes * 60;
  const deadlineMs = useMemo(
    () => new Date(startedAt).getTime() + totalSeconds * 1000,
    [startedAt, totalSeconds],
  );

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [visited, setVisited] = useState<Record<string, boolean>>({
    [questions[0]?.id]: true,
  });
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.round((deadlineMs - Date.now()) / 1000)),
  );
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const timeSpent = useRef<Record<string, number>>({});
  const questionEnteredAt = useRef<number>(Date.now());

  const current = questions[currentIndex];

  const recordTimeOnCurrent = useCallback(() => {
    if (!current) return;
    const elapsed = Math.round((Date.now() - questionEnteredAt.current) / 1000);
    timeSpent.current[current.id] = (timeSpent.current[current.id] ?? 0) + elapsed;
    questionEnteredAt.current = Date.now();
  }, [current]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    recordTimeOnCurrent();
    setSubmitting(true);

    const payload: SubmitAnswer[] = questions.map((q) => ({
      questionId: q.id,
      selectedAnswer: answers[q.id] ?? null,
      timeSpentSeconds: timeSpent.current[q.id] ?? 0,
    }));

    const res = await submitAttempt(attemptId, payload);

    setSubmitting(false);
    if (res.success) {
      setResult(res);
    } else {
      alert(res.error);
    }
  }, [answers, attemptId, questions, recordTimeOnCurrent, submitting]);

  // Countdown timer — auto-submits when it reaches zero.
  useEffect(() => {
    if (result) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        handleSubmit();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [deadlineMs, handleSubmit, result]);

  function goTo(index: number) {
    if (index < 0 || index >= questions.length) return;
    recordTimeOnCurrent();
    setCurrentIndex(index);
    setVisited((prev) => ({ ...prev, [questions[index].id]: true }));
  }

  function setAnswer(value: string | null) {
    if (!current) return;
    setAnswers((prev) => ({ ...prev, [current.id]: value }));
  }

  function toggleMark() {
    if (!current) return;
    setMarked((prev) => ({ ...prev, [current.id]: !prev[current.id] }));
  }

  function clearResponse() {
    setAnswer(null);
  }

  function saveAndNext() {
    goTo(currentIndex + 1);
  }

  function markAndNext() {
    toggleMark();
    goTo(currentIndex + 1);
  }

  if (result) {
    return <ResultSummary testTitle={testTitle} result={result} />;
  }

  if (!current) return null;

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeLow = remainingSeconds < 120;

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4 flex items-center justify-between rounded-xl bg-white p-4 shadow-sm">
          <div>
            <h1 className="text-base font-semibold text-slate-900">
              {testTitle}
            </h1>
            <p className="text-xs text-slate-500">
              Question {currentIndex + 1} of {questions.length}
            </p>
          </div>
          <div
            className={`rounded-lg px-4 py-2 text-lg font-mono font-semibold ${
              timeLow ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-700"
            }`}
          >
            {minutes}:{seconds.toString().padStart(2, "0")}
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-3 flex gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                {current.type === "mcq_single" ? "MCQ" : "Numerical"}
              </span>
              {marked[current.id] && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-600">
                  Marked for review
                </span>
              )}
            </div>

            <p className="mb-6 text-base text-slate-800">
              {current.question_text}
            </p>

            {current.type === "mcq_single" ? (
              <div className="space-y-2">
                {current.options.map((option, i) => (
                  <label
                    key={i}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition ${
                      answers[current.id] === option
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name={current.id}
                      checked={answers[current.id] === option}
                      onChange={() => setAnswer(option)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                    />
                    {option}
                  </label>
                ))}
              </div>
            ) : (
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={answers[current.id] ?? ""}
                onChange={(e) => setAnswer(e.target.value === "" ? null : e.target.value)}
                placeholder="Enter your numeric answer"
                className="w-full max-w-xs rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            )}

            <div className="mt-8 flex flex-wrap gap-2">
              <button
                onClick={clearResponse}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Clear response
              </button>
              <button
                onClick={toggleMark}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                {marked[current.id] ? "Unmark review" : "Mark for review"}
              </button>
              <div className="flex-1" />
              <button
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Back
              </button>
              {currentIndex < questions.length - 1 ? (
                <>
                  <button
                    onClick={markAndNext}
                    className="rounded-lg border border-purple-200 bg-purple-50 px-4 py-1.5 text-sm font-medium text-purple-700 hover:bg-purple-100"
                  >
                    Mark &amp; Next
                  </button>
                  <button
                    onClick={saveAndNext}
                    className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
                  >
                    Save &amp; Next
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setShowSubmitConfirm(true)}
                  className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-500"
                >
                  Submit test
                </button>
              )}
            </div>
          </div>

          <div className="h-fit rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Questions
            </h2>
            <div className="grid grid-cols-5 gap-1.5 lg:grid-cols-4">
              {questions.map((q, i) => {
                const isAnswered = !!answers[q.id];
                const isMarked = !!marked[q.id];
                const isVisited = !!visited[q.id];
                const isCurrent = i === currentIndex;

                let classes =
                  "border-slate-200 bg-white text-slate-500"; // not visited
                if (isVisited && !isAnswered && !isMarked)
                  classes = "border-red-200 bg-red-50 text-red-600";
                if (isMarked)
                  classes = "border-purple-300 bg-purple-100 text-purple-700";
                if (isAnswered && !isMarked)
                  classes = "border-green-300 bg-green-100 text-green-700";

                return (
                  <button
                    key={q.id}
                    onClick={() => goTo(i)}
                    className={`rounded-md border py-1.5 text-xs font-semibold transition ${classes} ${
                      isCurrent ? "ring-2 ring-indigo-500" : ""
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-1.5 text-[11px] text-slate-500">
              <Legend color="bg-green-100 border-green-300" label="Answered" />
              <Legend color="bg-red-50 border-red-200" label="Not answered" />
              <Legend color="bg-purple-100 border-purple-300" label="Marked for review" />
              <Legend color="bg-white border-slate-200" label="Not visited" />
            </div>

            <button
              onClick={() => setShowSubmitConfirm(true)}
              className="mt-4 w-full rounded-lg bg-slate-800 py-2 text-sm font-semibold text-white hover:bg-slate-900"
            >
              Submit test
            </button>
          </div>
        </div>
      </div>

      {showSubmitConfirm && (
        <SubmitConfirmDialog
          answeredCount={Object.values(answers).filter(Boolean).length}
          totalCount={questions.length}
          submitting={submitting}
          onCancel={() => setShowSubmitConfirm(false)}
          onConfirm={handleSubmit}
        />
      )}

      {submitting && !showSubmitConfirm && (
        <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-black/40">
          <Spinner className="h-8 w-8 text-white" />
          <p className="text-sm font-medium text-white">Submitting your test…</p>
        </div>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3 w-3 rounded border ${color}`} />
      {label}
    </div>
  );
}

function SubmitConfirmDialog({
  answeredCount,
  totalCount,
  submitting,
  onCancel,
  onConfirm,
}: {
  answeredCount: number;
  totalCount: number;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-lg font-semibold text-slate-900">
          Submit test?
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          You&apos;ve answered {answeredCount} of {totalCount} questions.
          Once submitted, you can&apos;t change your answers.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Keep going
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-60"
          >
            {submitting && <Spinner className="h-4 w-4" />}
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ResultSummary({
  testTitle,
  result,
}: {
  testTitle: string;
  result: SubmitResult;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-lg">
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="mb-1 text-sm text-slate-500">{testTitle}</p>
          <p className="mb-1 text-5xl font-bold text-indigo-600">
            {result.score}
            <span className="text-2xl text-slate-400">/{result.totalMarks}</span>
          </p>
          <p className="mb-6 text-sm text-slate-500">Test complete!</p>

          <div className="mb-6 grid grid-cols-3 gap-3 text-sm">
            <Stat label="Correct" value={result.correctCount} color="text-green-600" />
            <Stat label="Incorrect" value={result.incorrectCount} color="text-red-600" />
            <Stat label="Skipped" value={result.skippedCount} color="text-slate-500" />
          </div>

          <div className="mb-4 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
            Detailed error analysis with solutions is coming in the next phase.
          </div>

          <button
            onClick={() => router.push("/akul")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 py-3">
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
