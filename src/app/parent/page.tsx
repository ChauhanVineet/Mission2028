import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";

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

        <div className="rounded-2xl bg-white p-6 shadow-sm">
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
      </div>
    </div>
  );
}
