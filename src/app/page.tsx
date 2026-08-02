import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "akul") {
    redirect("/akul");
  }

  if (profile?.role === "parent") {
    redirect("/parent");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center">
      <div>
        <h1 className="mb-2 text-xl font-semibold text-slate-900">
          No profile found
        </h1>
        <p className="text-sm text-slate-500">
          You&apos;re signed in, but no profile row exists for this account
          yet. Run the seed script to create it.
        </p>
      </div>
    </div>
  );
}
