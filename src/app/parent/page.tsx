import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";

type TestRow = {
  id: string;
  title: string;
  deadline: string;
  duration_minutes: number;
  question_count: number;
  status: string;
};

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default async function ParentDashboard() {
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

  const { data: tests } = await supabase
    .from("tests")
    .select("id, title, deadline, duration_minutes, question_count, status")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .returns<TestRow[]>();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              Mission2028 — Parent
            </h1>
            <p className="text-sm text-slate-500">
              Schedule tests and track Akul&apos;s JEE prep.
            </p>
          </div>
          <LogoutButton />
        </header>

        <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-medium text-slate-900">
            Schedule a test
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Pick topics from the JEE syllabus for Akul&apos;s next test.
          </p>
          <Link
            href="/parent/schedule"
            className="inline-block rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Choose topics →
          </Link>
        </div>

        {tests && tests.length > 0 && (
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-slate-700">
              Scheduled tests
            </h2>
            <div className="space-y-3">
              {tests.map((test) => {
                const row = (
                  <div className="flex items-center justify-between rounded-xl border border-slate-100 p-4 transition hover:border-slate-200 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {test.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {test.question_count} questions · ~{test.duration_minutes}{" "}
                        min · due {formatDeadline(test.deadline)}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium capitalize text-slate-600">
                      {test.status}
                    </span>
                  </div>
                );

                return test.status === "completed" ? (
                  <Link key={test.id} href={`/review/${test.id}`} className="block">
                    {row}
                  </Link>
                ) : (
                  <div key={test.id}>{row}</div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
