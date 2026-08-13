"use server";

import { createClient } from "@/lib/supabase/server";
import { generateQuestions, type GeneratedQuestion } from "@/lib/questions/generate";

const PREVIEW_TOPIC_LIMIT = 3;
const PREVIEW_QUESTIONS_PER_TOPIC = 2;

export type PreviewGroup = {
  topicId: string;
  topicName: string;
  subjectName: string;
  questions: GeneratedQuestion[];
};

export async function generatePreviewQuestions(
  topicIds: string[],
): Promise<{ groups: PreviewGroup[]; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { groups: [], error: "Not signed in." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "parent") {
    return { groups: [], error: "Only parents can generate questions." };
  }

  const targetTopicIds = topicIds.slice(0, PREVIEW_TOPIC_LIMIT);
  if (targetTopicIds.length === 0) {
    return { groups: [], error: "Select at least one topic first." };
  }

  const { data: topics, error: topicsError } = await supabase
    .from("topics")
    .select("id, name, class_level, subject_id, subjects(name)")
    .in("id", targetTopicIds)
    .returns<
      {
        id: string;
        name: string;
        class_level: 11 | 12;
        subject_id: string;
        subjects: { name: string } | null;
      }[]
    >();

  if (topicsError || !topics) {
    return { groups: [], error: "Could not load selected topics." };
  }

  const groups: PreviewGroup[] = [];

  for (const topic of topics) {
    const subjectName = topic.subjects?.name ?? "Unknown";

    let questions: GeneratedQuestion[];
    try {
      questions = await generateQuestions({
        subjectName,
        topicName: topic.name,
        classLevel: topic.class_level,
        difficulty: "medium",
        count: PREVIEW_QUESTIONS_PER_TOPIC,
      });
    } catch {
      return {
        groups,
        error: `Question generation failed for "${topic.name}". Check your ANTHROPIC_API_KEY and try again.`,
      };
    }

    const { error: insertError } = await supabase.from("questions").insert(
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

    if (insertError) {
      return {
        groups,
        error: `Generated questions for "${topic.name}" but failed to save them.`,
      };
    }

    groups.push({
      topicId: topic.id,
      topicName: topic.name,
      subjectName,
      questions,
    });
  }

  return { groups };
}
