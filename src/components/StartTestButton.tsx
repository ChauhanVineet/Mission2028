"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAttempt } from "@/app/akul/test/[id]/actions";
import { Spinner } from "@/components/Spinner";

export function StartTestButton({ testId }: { testId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    const res = await startAttempt(testId);
    setLoading(false);

    if (res.success) {
      router.refresh();
    } else {
      alert(res.error);
    }
  }

  return (
    <button
      onClick={handleStart}
      disabled={loading}
      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
    >
      {loading && <Spinner />}
      {loading ? "Starting…" : "🚀 Start test"}
    </button>
  );
}
