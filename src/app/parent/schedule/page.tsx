import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";
import { TestScheduler } from "@/components/TestScheduler";

// Question generation can take up to ~40s per topic; give the Server Action
// route enough headroom to avoid a platform timeout on larger tests.
export const maxDuration = 60;

type TopicRow = {
  id: string;
  name: string;
  class_level: 11 | 12;
  subject_id: string;
  display_order: number;
};

type SubjectRow = {
  id: string;
  name: string;
  display_order: number;
};

export default async function ScheduleTestPage() {
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

  if (profile?.role !== "parent") redirect("/");

  const [{ data: subjectRows }, { data: topicRows }] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, display_order")
      .order("display_order")
      .returns<SubjectRow[]>(),
    supabase
      .from("topics")
      .select("id, name, class_level, subject_id, display_order")
      .order("display_order")
      .returns<TopicRow[]>(),
  ]);

  const subjects = (subjectRows ?? []).map((subject) => ({
    id: subject.id,
    name: subject.name,
    topics: (topicRows ?? [])
      .filter((t) => t.subject_id === subject.id)
      .map((t) => ({ id: t.id, name: t.name, class_level: t.class_level })),
  }));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Schedule a Test
            </h1>
            <p className="text-sm text-slate-500">
              Select the topics Akul should be tested on.
            </p>
          </div>
          <LogoutButton />
        </header>

        <TestScheduler subjects={subjects} />
      </div>
    </div>
  );
}
