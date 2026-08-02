import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/LogoutButton";

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

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-medium text-slate-900">
            No tests scheduled yet
          </h2>
          <p className="text-sm text-slate-500">
            When your parents schedule a test, it will show up here.
          </p>
        </div>
      </div>
    </div>
  );
}
