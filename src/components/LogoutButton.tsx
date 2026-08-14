"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/Spinner";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogout() {
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError("Couldn't log out. Try again.");
        return;
      }
      router.push("/login");
      router.refresh();
    } catch {
      setError("Couldn't log out. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={handleLogout}
        disabled={loading}
        className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-sm transition-all duration-150 hover:scale-105 hover:bg-white disabled:opacity-60 disabled:hover:scale-100"
      >
        {loading && <Spinner className="h-3.5 w-3.5" />}
        {loading ? "Logging out…" : "Log out"}
      </button>
      {error && (
        <p className="animate-fade-in-up text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
