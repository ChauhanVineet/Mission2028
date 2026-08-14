"use client";

import { useMemo, useState } from "react";
import {
  scheduleTest,
  type ScheduledQuestion,
} from "@/app/parent/schedule/actions";
import type { DifficultyMix } from "@/lib/questions/distribute";
import { Spinner } from "@/components/Spinner";
import { themeForLabel } from "@/lib/colorTheme";

type Topic = {
  id: string;
  name: string;
  class_level: 11 | 12;
};

type Subject = {
  id: string;
  name: string;
  topics: Topic[];
};

type ScheduledTest = {
  id: string;
  title: string;
  deadline: string;
  questionCount: number;
  durationMinutes: number;
  questions: ScheduledQuestion[];
};

const MIX_OPTIONS: {
  value: DifficultyMix;
  label: string;
  emoji: string;
  active: string;
}[] = [
  { value: "easy", label: "Easier", emoji: "😊", active: "from-emerald-500 to-teal-500" },
  { value: "balanced", label: "Balanced", emoji: "⚖️", active: "from-indigo-500 to-purple-500" },
  { value: "hard", label: "Challenging", emoji: "🔥", active: "from-rose-500 to-orange-500" },
];

function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
}

export function TestScheduler({ subjects }: { subjects: Subject[] }) {
  const [activeSubjectId, setActiveSubjectId] = useState(subjects[0]?.id);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [difficultyMix, setDifficultyMix] = useState<DifficultyMix>("balanced");
  const [questionCount, setQuestionCount] = useState(10);
  const [deadline, setDeadline] = useState(defaultDeadline);

  const [scheduling, setScheduling] = useState(false);
  const [result, setResult] = useState<ScheduledTest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeSubject = subjects.find((s) => s.id === activeSubjectId);

  const selectedBySubject = useMemo(() => {
    return subjects.map((subject) => ({
      subject,
      topics: subject.topics.filter((t) => selected[t.id]),
    }));
  }, [subjects, selected]);

  const selectedTopicIds = useMemo(
    () => Object.keys(selected).filter((id) => selected[id]),
    [selected],
  );

  const totalSelected = selectedTopicIds.length;

  function toggleTopic(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function setSubjectTopics(subject: Subject, checked: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const t of subject.topics) next[t.id] = checked;
      return next;
    });
  }

  function classGroup(topics: Topic[], level: 11 | 12) {
    return topics.filter((t) => t.class_level === level);
  }

  async function handleSchedule() {
    setScheduling(true);
    setError(null);
    setResult(null);

    const res = await scheduleTest({
      topicIds: selectedTopicIds,
      questionCount,
      difficultyMix,
      deadline,
    });

    setScheduling(false);

    if (res.success) {
      setResult(res.test);
    } else {
      setError(res.error);
    }
  }

  function handleScheduleAnother() {
    setResult(null);
    setError(null);
    setSelected({});
  }

  if (!activeSubject) return null;

  if (result) {
    return <ScheduleConfirmation test={result} onScheduleAnother={handleScheduleAnother} />;
  }

  const class11 = classGroup(activeSubject.topics, 11);
  const class12 = classGroup(activeSubject.topics, 12);
  const subjectSelectedCount = activeSubject.topics.filter(
    (t) => selected[t.id],
  ).length;
  const allSelectedInSubject =
    subjectSelectedCount === activeSubject.topics.length;
  const activeTheme = themeForLabel(activeSubject.name);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="animate-fade-in-up rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex flex-wrap gap-2">
            {subjects.map((subject) => {
              const theme = themeForLabel(subject.name);
              const count = subject.topics.filter(
                (t) => selected[t.id],
              ).length;
              const isActive = subject.id === activeSubjectId;
              return (
                <button
                  key={subject.id}
                  onClick={() => setActiveSubjectId(subject.id)}
                  className={`rounded-xl border-2 px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? `scale-105 border-transparent bg-gradient-to-r ${theme.grad} text-white shadow-md`
                      : "border-slate-200 text-slate-500 hover:scale-105 hover:border-slate-300"
                  }`}
                >
                  {subject.name}
                  {count > 0 && (
                    <span
                      className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                        isActive
                          ? "bg-white/25 text-white"
                          : `${theme.solid} text-white`
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              {activeSubject.name} topics
            </h2>
            <button
              onClick={() =>
                setSubjectTopics(activeSubject, !allSelectedInSubject)
              }
              className={`text-xs font-semibold ${activeTheme.text} hover:opacity-75`}
            >
              {allSelectedInSubject ? "Clear all" : "Select all"}
            </button>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Class 11
              </h3>
              <ul className="space-y-1.5">
                {class11.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    checked={!!selected[topic.id]}
                    onToggle={() => toggleTopic(topic.id)}
                    theme={activeTheme}
                  />
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Class 12
              </h3>
              <ul className="space-y-1.5">
                {class12.map((topic) => (
                  <TopicRow
                    key={topic.id}
                    topic={topic}
                    checked={!!selected[topic.id]}
                    onToggle={() => toggleTopic(topic.id)}
                    theme={activeTheme}
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div
          className="h-fit animate-fade-in-up space-y-5 rounded-2xl bg-white p-5 shadow-sm"
          style={{ animationDelay: "80ms" }}
        >
          <div>
            <h2 className="mb-1 text-sm font-semibold text-slate-700">
              Selected topics
            </h2>
            <p className="mb-3 text-xs text-slate-400">
              {totalSelected} topic{totalSelected === 1 ? "" : "s"} selected
            </p>

            {totalSelected === 0 ? (
              <p className="text-sm text-slate-400">
                Pick topics on the left to build a test.
              </p>
            ) : (
              <div className="max-h-40 space-y-3 overflow-y-auto">
                {selectedBySubject
                  .filter((group) => group.topics.length > 0)
                  .map((group) => (
                    <div key={group.subject.id}>
                      <p className="mb-1 text-xs font-semibold text-slate-500">
                        {group.subject.name}
                      </p>
                      <ul className="space-y-0.5">
                        {group.topics.map((topic) => (
                          <li key={topic.id} className="text-xs text-slate-600">
                            {topic.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="space-y-4 border-t border-slate-100 pt-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                Difficulty
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {MIX_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDifficultyMix(opt.value)}
                    className={`rounded-xl border-2 py-1.5 text-xs font-semibold transition-all duration-200 ${
                      difficultyMix === opt.value
                        ? `scale-105 border-transparent bg-gradient-to-r ${opt.active} text-white shadow-sm`
                        : "border-slate-200 text-slate-500 hover:scale-105 hover:border-slate-300"
                    }`}
                  >
                    <span className="mr-1">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="questionCount"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Number of questions: {questionCount}
              </label>
              <input
                id="questionCount"
                type="range"
                min={4}
                max={20}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full accent-purple-600"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                ≈ {questionCount * 3} minute test
              </p>
            </div>

            <div>
              <label
                htmlFor="deadline"
                className="mb-1.5 block text-xs font-semibold text-slate-700"
              >
                Deadline
              </label>
              <input
                id="deadline"
                type="date"
                value={deadline}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-sm transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <button
              disabled={totalSelected === 0 || scheduling}
              onClick={handleSchedule}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
            >
              {scheduling && <Spinner />}
              {scheduling ? "Generating with Claude…" : "✨ Schedule test"}
            </button>
            {scheduling && (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                This can take up to a minute for larger tests.
              </p>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="animate-fade-in-up rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function TopicRow({
  topic,
  checked,
  onToggle,
  theme,
}: {
  topic: Topic;
  checked: boolean;
  onToggle: () => void;
  theme: ReturnType<typeof themeForLabel>;
}) {
  return (
    <li>
      <label
        className={`flex cursor-pointer items-start gap-2 rounded-lg px-1.5 py-1.5 text-sm transition-all duration-150 hover:scale-[1.02] ${
          checked ? `${theme.bg} ${theme.text} font-medium` : "text-slate-700 hover:bg-slate-50"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
        />
        <span>{topic.name}</span>
      </label>
    </li>
  );
}

function ScheduleConfirmation({
  test,
  onScheduleAnother,
}: {
  test: ScheduledTest;
  onScheduleAnother: () => void;
}) {
  const deadlineLabel = new Date(test.deadline).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="animate-pop-in rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 text-xl text-white shadow-md">
            ✓
          </span>
          <h2 className="text-lg font-semibold text-slate-900">
            Test scheduled! 🎉
          </h2>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {test.title} · {test.questionCount} questions · ~{test.durationMinutes}{" "}
          min · due {deadlineLabel}
        </p>
        <p className="mb-4 text-sm text-slate-500">
          Akul will see this on his dashboard and can take it any time before
          the deadline.
        </p>
        <button
          onClick={onScheduleAnother}
          className="rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
        >
          Schedule another test
        </button>
      </div>

      <div
        className="animate-fade-in-up rounded-2xl bg-white p-6 shadow-sm"
        style={{ animationDelay: "100ms" }}
      >
        <h2 className="mb-4 text-sm font-semibold text-slate-700">
          Questions in this test
        </h2>
        <div className="space-y-4">
          {test.questions.map((q, i) => {
            const qTheme = themeForLabel(q.subjectName);
            return (
            <div
              key={i}
              className="animate-fade-in-up rounded-xl border border-slate-200 p-4 transition-shadow hover:shadow-md"
              style={{ animationDelay: `${140 + i * 40}ms` }}
            >
              <div className="mb-2 flex flex-wrap gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${qTheme.bg} ${qTheme.text}`}>
                  {q.subjectName} · {q.topicName}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                  {q.type === "mcq_single" ? "MCQ" : "Numerical"}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500">
                  {q.difficulty}
                </span>
              </div>
              <p className="mb-3 text-sm text-slate-800">{q.question_text}</p>

              {q.type === "mcq_single" ? (
                <ul className="mb-3 space-y-1">
                  {q.options.map((option, oi) => {
                    const isCorrect = option === q.correct_answer;
                    return (
                      <li
                        key={oi}
                        className={`rounded-md px-3 py-1.5 text-sm ${
                          isCorrect
                            ? "bg-green-50 font-medium text-green-700"
                            : "bg-slate-50 text-slate-600"
                        }`}
                      >
                        {option}
                        {isCorrect && " ✓"}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mb-3 text-sm font-medium text-green-700">
                  Answer: {q.correct_answer}
                </p>
              )}

              <details className="text-sm text-slate-600">
                <summary className="cursor-pointer font-medium text-slate-500">
                  Solution
                </summary>
                <p className="mt-2 whitespace-pre-line">{q.solution}</p>
              </details>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
