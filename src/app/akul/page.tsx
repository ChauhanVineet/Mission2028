import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";
import { TestHistoryList, type PastTest } from "@/components/TestHistoryList";

type TestRow = {
  id: string;
  title: string;
  deadline: string;
  duration_minutes: number;
  question_count: number;
  status: string;
};

type PastAttemptRow = {
  score: number;
  total_marks: number;
  submitted_at: string;
  tests: { id: string; title: string } | null;
};

function formatDeadline(deadline: string) {
  const d = new Date(deadline);
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const dateLabel = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  if (daysLeft <= 0) return `Due today (${dateLabel})`;
  if (daysLeft === 1) return `Due tomorrow (${dateLabel})`;
  return `Due ${dateLabel} · ${daysLeft} days left`;
}

export default async function AkulDashboard() {
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

  const [{ data: tests }, { data: pastAttempts }] = await Promise.all([
    supabase
      .from("tests")
      .select("id, title, deadline, duration_minutes, question_count, status")
      .in("status", ["scheduled", "in_progress"])
      .order("deadline")
      .returns<TestRow[]>(),
    supabase
      .from("test_attempts")
      .select("score, total_marks, submitted_at, tests(id, title)")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .returns<PastAttemptRow[]>(),
  ]);

  const pastTests: PastTest[] = (pastAttempts ?? [])
    .filter((a) => a.tests)
    .map((a) => ({
      id: a.tests!.id,
      title: a.tests!.title,
      score: a.score,
      totalMarks: a.total_marks,
      submittedAt: a.submitted_at,
    }));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Mission2028
            </h1>
            <p className="text-sm text-slate-500">
              JEE 2028 · Physics · Chemistry · Math
            </p>
          </div>
          <LogoutButton />
        </header>

        <div className="space-y-6">
          {!tests || tests.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-lg font-medium text-slate-900">
                No tests scheduled yet
              </h2>
              <p className="text-sm text-slate-500">
                When your parents schedule a test, it will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {tests.map((test) => (
                <Link
                  key={test.id}
                  href={`/akul/test/${test.id}`}
                  className="block rounded-2xl bg-white p-5 shadow-sm transition hover:shadow-md"
                >
                  <h2 className="mb-1 text-base font-semibold text-slate-900">
                    {test.title}
                  </h2>
                  <p className="mb-2 text-sm text-slate-500">
                    {test.question_count} questions · ~{test.duration_minutes} min
                  </p>
                  <p className="text-sm font-medium text-indigo-600">
                    {formatDeadline(test.deadline)}
                  </p>
                </Link>
              ))}
            </div>
          )}

          <TestHistoryList tests={pastTests} />
        </div>
      </div>
    </div>
  );
}
