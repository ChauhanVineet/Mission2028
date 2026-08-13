"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startAttempt } from "@/app/akul/test/[id]/actions";

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
      className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
    >
      {loading ? "Starting…" : "Start test"}
    </button>
  );
}
