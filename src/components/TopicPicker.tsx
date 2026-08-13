"use client";

import { useMemo, useState } from "react";
import {
  generatePreviewQuestions,
  type PreviewGroup,
} from "@/app/parent/schedule/actions";

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

export function TopicPicker({ subjects }: { subjects: Subject[] }) {
  const [activeSubjectId, setActiveSubjectId] = useState(subjects[0]?.id);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [previewGroups, setPreviewGroups] = useState<PreviewGroup[] | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);

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

  async function handleGeneratePreview() {
    setGenerating(true);
    setPreviewError(null);
    setPreviewGroups(null);

    const result = await generatePreviewQuestions(selectedTopicIds);

    setGenerating(false);
    setPreviewGroups(result.groups);
    if (result.error) setPreviewError(result.error);
  }

  if (!activeSubject) return null;

  const class11 = classGroup(activeSubject.topics, 11);
  const class12 = classGroup(activeSubject.topics, 12);
  const subjectSelectedCount = activeSubject.topics.filter(
    (t) => selected[t.id],
  ).length;
  const allSelectedInSubject =
    subjectSelectedCount === activeSubject.topics.length;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex gap-2">
            {subjects.map((subject) => {
              const count = subject.topics.filter(
                (t) => selected[t.id],
              ).length;
              return (
                <button
                  key={subject.id}
                  onClick={() => setActiveSubjectId(subject.id)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
                    subject.id === activeSubjectId
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {subject.name}
                  {count > 0 && (
                    <span className="ml-1.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs text-white">
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
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
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
                  />
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="h-fit rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-slate-700">
            Selected topics
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            {totalSelected} topic{totalSelected === 1 ? "" : "s"} selected
          </p>

          {totalSelected === 0 ? (
            <p className="text-sm text-slate-400">
              Pick topics on the left to build a test.
            </p>
          ) : (
            <div className="space-y-4">
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

          <div className="mt-5 border-t border-slate-100 pt-4">
            <button
              disabled={totalSelected === 0 || generating}
              onClick={handleGeneratePreview}
              className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {generating ? "Generating with Claude…" : "Generate preview questions"}
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400">
              2 questions for up to 3 topics · full scheduling comes next
            </p>
          </div>
        </div>
      </div>

      {previewError && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {previewError}
        </div>
      )}

      {previewGroups && previewGroups.length > 0 && (
        <QuestionPreview groups={previewGroups} />
      )}
    </div>
  );
}

function TopicRow({
  topic,
  checked,
  onToggle,
}: {
  topic: Topic;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
        />
        <span>{topic.name}</span>
      </label>
    </li>
  );
}

function QuestionPreview({ groups }: { groups: PreviewGroup[] }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">
        Preview questions
      </h2>
      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.topicId}>
            <p className="mb-3 text-xs font-semibold text-indigo-600">
              {group.subjectName} · {group.topicName}
            </p>
            <div className="space-y-4">
              {group.questions.map((q, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 p-4"
                >
                  <div className="mb-2 flex gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                      {q.type === "mcq_single" ? "MCQ" : "Numerical"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-500">
                      {q.difficulty}
                    </span>
                  </div>
                  <p className="mb-3 text-sm text-slate-800">
                    {q.question_text}
                  </p>

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
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
