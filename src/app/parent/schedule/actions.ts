"use server";

import { createClient } from "@/lib/supabase/server";
import { generateQuestions, type GeneratedQuestion } from "@/lib/questions/generate";
import {
  allocateAcrossTopics,
  allocateDifficulty,
  allocateQuestionTypes,
  type DifficultyMix,
} from "@/lib/questions/distribute";
import { friendlyErrorMessage } from "@/lib/errors";
import { mapWithConcurrency, MAX_CONCURRENCY } from "@/lib/llm/client";

// JEE Main's fixed per-subject pattern: 25 questions (20 MCQ + 5 Numerical)
// in a 60-minute block (the real exam's 180 minutes ÷ 3 subjects). Not
// user-configurable — every subject with at least one selected topic gets
// exactly this, regardless of how many topics within it are picked.
const QUESTIONS_PER_SUBJECT = 25;
const MINUTES_PER_SUBJECT = 60;

export type ScheduledQuestion = Omit<GeneratedQuestion, "topicIndex"> & {
  subjectName: string;
  topicName: string;
};

export type ScheduleTestResult =
  | {
      success: true;
      test: {
        id: string;
        title: string;
        deadline: string;
        questionCount: number;
        durationMinutes: number;
        questions: ScheduledQuestion[];
      };
    }
  | { success: false; error: string };

type TopicRow = {
  id: string;
  name: string;
  class_level: 11 | 12;
  subject_id: string;
  subjects: { name: string } | null;
};

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Top-level safety net: anything unexpected that escapes the specific
// error handling below (a bug, a provider outage we didn't anticipate, a
// dropped connection) still resolves to a clean, friendly result instead
// of throwing — an uncaught rejection here would otherwise reach the
// client with no error handling of its own around this call, and fail
// completely silently (spinner stops, nothing else happens).
export async function scheduleTest(
  input: Parameters<typeof scheduleTestInner>[0],
): Promise<ScheduleTestResult> {
  try {
    return await scheduleTestInner(input);
  } catch (err) {
    return {
      success: false,
      error: friendlyErrorMessage(err, "Something went wrong scheduling the test. Try again."),
    };
  }
}

async function scheduleTestInner(input: {
  topicIds: string[];
  difficultyMix: DifficultyMix;
  deadline: string; // "YYYY-MM-DD"
}): Promise<ScheduleTestResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { success: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "parent") {
    return { success: false, error: "Only parents can schedule tests." };
  }

  const { topicIds, difficultyMix, deadline } = input;

  if (topicIds.length === 0) {
    return { success: false, error: "Select at least one topic first." };
  }

  const deadlineDate = new Date(`${deadline}T23:59:59`);
  if (Number.isNaN(deadlineDate.getTime()) || deadlineDate.getTime() < Date.now()) {
    return { success: false, error: "Pick a deadline in the future." };
  }

  const { data: topics, error: topicsError } = await supabase
    .from("topics")
    .select("id, name, class_level, subject_id, subjects(name)")
    .in("id", topicIds)
    .returns<TopicRow[]>();

  if (topicsError || !topics || topics.length === 0) {
    return { success: false, error: "Could not load selected topics." };
  }

  const topicsBySubject = new Map<string, TopicRow[]>();
  for (const topic of topics) {
    const list = topicsBySubject.get(topic.subject_id) ?? [];
    list.push(topic);
    topicsBySubject.set(topic.subject_id, list);
  }

  const perTopicCount = new Map<string, number>();
  for (const subjectTopics of topicsBySubject.values()) {
    const counts = allocateAcrossTopics(QUESTIONS_PER_SUBJECT, subjectTopics.length);
    subjectTopics.forEach((topic, i) => perTopicCount.set(topic.id, counts[i]));
  }

  const activeTopicsBySubject = [...topicsBySubject.values()]
    .map((subjectTopics) =>
      subjectTopics
        .map((topic) => ({ topic, count: perTopicCount.get(topic.id) ?? 0 }))
        .filter(({ count }) => count > 0),
    )
    .filter((activeTopics) => activeTopics.length > 0);

  // One LLM call per subject (not per topic) — a subject can have 20-30
  // topics, and firing that many parallel requests can blow through the
  // provider's rate limits, turning a sub-minute generation into a
  // multi-minute hang from retries/backoff.
  let generatedBatches: {
    topic: TopicRow;
    questions: GeneratedQuestion[];
  }[];

  try {
    // Cap how many subject requests are in flight at once (at most 3, one
    // per subject) so a multi-subject test can't trip a rate limit.
    const perSubjectResults = await mapWithConcurrency(
      activeTopicsBySubject,
      MAX_CONCURRENCY,
      async (activeTopics) => {
        const subjectName = activeTopics[0].topic.subjects?.name ?? "Unknown";
        const subjectTotal = activeTopics.reduce((sum, { count }) => sum + count, 0);
        const questions = await generateQuestions({
          subjectName,
          topics: activeTopics.map(({ topic, count }) => ({
            topicName: topic.name,
            classLevel: topic.class_level,
            difficultyCounts: allocateDifficulty(count, difficultyMix),
          })),
          // Split once for the whole subject (always 25 -> 20/5), not per
          // topic — see the comment on generateQuestions for why.
          typeCounts: allocateQuestionTypes(subjectTotal),
        });
        return { activeTopics, questions };
      },
    );

    // generateQuestions guarantees every topicIndex is a valid index into
    // the topic list it was given, so a plain match is enough here.
    generatedBatches = perSubjectResults.flatMap(({ activeTopics, questions }) =>
      activeTopics.map(({ topic }, topicIndex) => ({
        topic,
        questions: questions.filter((q) => q.topicIndex === topicIndex),
      })),
    );
  } catch (err) {
    return {
      success: false,
      error: friendlyErrorMessage(
        err,
        "Question generation failed. Check your LLM API key and try again.",
      ),
    };
  }

  const rowsToInsert = generatedBatches.flatMap(({ topic, questions }) =>
    questions.map((q) => ({
      topic_id: topic.id,
      question_type: q.type,
      difficulty: q.difficulty,
      question_text: q.question_text,
      options: q.options,
      correct_answer: q.correct_answer,
      solution: q.solution,
    })),
  );

  // Never create an empty test — without this, a generation that returned
  // nothing usable would silently produce a 0-question test on the dashboard.
  if (rowsToInsert.length === 0) {
    return {
      success: false,
      error: "The question generator didn't return any usable questions. Try again.",
    };
  }

  const { data: insertedQuestions, error: insertQuestionsError } = await supabase
    .from("questions")
    .insert(rowsToInsert)
    .select("id, topic_id, question_type, difficulty, question_text, options, correct_answer, solution");

  if (insertQuestionsError || !insertedQuestions) {
    return { success: false, error: "Generated questions but failed to save them." };
  }

  const topicById = new Map(topics.map((t) => [t.id, t]));
  const scheduledQuestions: ScheduledQuestion[] = insertedQuestions.map((row) => {
    const topic = topicById.get(row.topic_id)!;
    return {
      type: row.question_type,
      question_text: row.question_text,
      options: row.options as string[],
      correct_answer: row.correct_answer,
      solution: row.solution,
      difficulty: row.difficulty,
      subjectName: topic.subjects?.name ?? "Unknown",
      topicName: topic.name,
    };
  });

  const subjectNames = [...new Set(topics.map((t) => t.subjects?.name).filter(Boolean))];
  const topicNames = topics.map((t) => t.name);
  const title =
    subjectNames.length === 1
      ? `${subjectNames[0]} — ${topicNames.slice(0, 3).join(", ")}${
          topicNames.length > 3 ? "…" : ""
        }`
      : `${subjectNames.join(" + ")} Test`;

  const durationMinutes = topicsBySubject.size * MINUTES_PER_SUBJECT;

  const { data: test, error: testError } = await supabase
    .from("tests")
    .insert({
      created_by: user.id,
      title,
      deadline: deadlineDate.toISOString(),
      duration_minutes: durationMinutes,
      question_count: insertedQuestions.length,
      difficulty_mix: difficultyMix,
    })
    .select("id, title, deadline, duration_minutes, question_count")
    .single();

  if (testError || !test) {
    return { success: false, error: "Failed to create the test." };
  }

  const orderedQuestionIds = shuffle(insertedQuestions.map((q) => q.id));
  const testQuestionRows = orderedQuestionIds.map((questionId, index) => ({
    test_id: test.id,
    question_id: questionId,
    order_index: index,
  }));

  const { error: linkError } = await supabase
    .from("test_questions")
    .insert(testQuestionRows);

  if (linkError) {
    return { success: false, error: "Test created but failed to attach questions." };
  }

  return {
    success: true,
    test: {
      id: test.id,
      title: test.title,
      deadline: test.deadline,
      questionCount: test.question_count,
      durationMinutes: test.duration_minutes,
      questions: scheduledQuestions,
    },
  };
}
