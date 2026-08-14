"use server";

import { createClient } from "@/lib/supabase/server";
import { generateQuestions, type GeneratedQuestion } from "@/lib/questions/generate";
import {
  allocateAcrossTopics,
  allocateDifficulty,
  allocateQuestionTypes,
  type DifficultyMix,
} from "@/lib/questions/distribute";

const MIN_QUESTIONS = 4;
const MAX_QUESTIONS = 20;
const MINUTES_PER_QUESTION = 3;

export type ScheduledQuestion = GeneratedQuestion & {
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

export async function scheduleTest(input: {
  topicIds: string[];
  questionCount: number;
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
  const questionCount = Math.min(
    MAX_QUESTIONS,
    Math.max(MIN_QUESTIONS, Math.round(input.questionCount)),
  );

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

  const perTopicCounts = allocateAcrossTopics(questionCount, topics.length);
  const activeTopics = topics
    .map((topic, i) => ({ topic, count: perTopicCounts[i] }))
    .filter(({ count }) => count > 0);

  let generatedBatches: {
    topic: TopicRow;
    questions: GeneratedQuestion[];
  }[];

  try {
    generatedBatches = await Promise.all(
      activeTopics.map(async ({ topic, count }) => ({
        topic,
        questions: await generateQuestions({
          subjectName: topic.subjects?.name ?? "Unknown",
          topicName: topic.name,
          classLevel: topic.class_level,
          difficultyCounts: allocateDifficulty(count, difficultyMix),
          typeCounts: allocateQuestionTypes(count),
        }),
      })),
    );
  } catch {
    return {
      success: false,
      error:
        "Question generation failed. Check your ANTHROPIC_API_KEY and try again.",
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

  const durationMinutes = questionCount * MINUTES_PER_QUESTION;

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
