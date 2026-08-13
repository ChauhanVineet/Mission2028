import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function TakeTestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: test } = await supabase
    .from("tests")
    .select("id, title, deadline, duration_minutes, question_count")
    .eq("id", id)
    .single();

  if (!test) notFound();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/akul"
          className="mb-6 inline-block text-sm text-indigo-600 hover:text-indigo-700"
        >
          ← Back
        </Link>

        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-semibold text-slate-900">
            {test.title}
          </h1>
          <p className="mb-6 text-sm text-slate-500">
            {test.question_count} questions · ~{test.duration_minutes} min
          </p>
          <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-700">
            The full test-taking experience is coming in the next phase.
            Your test is saved and ready — check back soon!
          </div>
        </div>
      </div>
    </div>
  );
}
