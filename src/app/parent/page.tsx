import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";
import { PageNav } from "@/components/PageNav";
import { CancelTestButton } from "@/components/CancelTestButton";
import { LoadErrorBanner } from "@/components/LoadErrorBanner";

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

const STATUS_STYLES: Record<string, string> = {
  scheduled: "bg-indigo-100 text-indigo-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
};

const STATUS_BORDER: Record<string, string> = {
  scheduled: "border-l-indigo-400",
  in_progress: "border-l-amber-400",
  completed: "border-l-emerald-400",
};

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

  const { data: tests, error: testsError } = await supabase
    .from("tests")
    .select("id, title, deadline, duration_minutes, question_count, status")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false })
    .returns<TestRow[]>();

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-indigo-50 via-purple-50 to-white p-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-purple-200 opacity-40 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-40 h-96 w-96 rounded-full bg-pink-200 opacity-40 blur-3xl" />

      <div className="relative mx-auto max-w-3xl">
        <PageNav homeHref="/parent" />

        <header className="mb-8 flex animate-fade-in-up items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-2xl font-extrabold text-transparent">
              Mission2028 — Parent 🎯
            </h1>
            <p className="text-sm text-slate-500">
              Schedule tests and track Akul&apos;s JEE prep.
            </p>
          </div>
          <LogoutButton />
        </header>

        <div
          className="mb-6 animate-fade-in-up rounded-2xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 p-[1.5px] shadow-lg"
          style={{ animationDelay: "80ms" }}
        >
          <div className="rounded-2xl bg-white p-6">
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-slate-900">
              <span className="text-xl">✨</span> Schedule a test
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              Pick topics from the JEE syllabus for Akul&apos;s next test.
            </p>
            <Link
              href="/parent/schedule"
              className="inline-block rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95"
            >
              Choose topics →
            </Link>
          </div>
        </div>

        {testsError && <LoadErrorBanner what="your scheduled tests" />}

        {tests && tests.length > 0 && (
          <div
            className="animate-fade-in-up rounded-2xl bg-white p-6 shadow-sm"
            style={{ animationDelay: "160ms" }}
          >
            <h2 className="mb-4 text-sm font-semibold text-slate-700">
              Scheduled tests
            </h2>
            <div className="space-y-3">
              {tests.map((test, i) => {
                const row = (
                  <div
                    className={`flex items-center justify-between rounded-xl border border-slate-100 border-l-4 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-200 hover:bg-slate-50 hover:shadow-md ${
                      STATUS_BORDER[test.status] ?? "border-l-slate-300"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {test.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {test.question_count} questions · ~{test.duration_minutes}{" "}
                        min · due {formatDeadline(test.deadline)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                          STATUS_STYLES[test.status] ??
                          "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {test.status}
                      </span>
                      {test.status === "scheduled" && (
                        <CancelTestButton testId={test.id} />
                      )}
                    </div>
                  </div>
                );

                return test.status === "completed" ? (
                  <Link
                    key={test.id}
                    href={`/review/${test.id}`}
                    className="block animate-fade-in-up"
                    style={{ animationDelay: `${200 + i * 60}ms` }}
                  >
                    {row}
                  </Link>
                ) : (
                  <div
                    key={test.id}
                    className="animate-fade-in-up"
                    style={{ animationDelay: `${200 + i * 60}ms` }}
                  >
                    {row}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
