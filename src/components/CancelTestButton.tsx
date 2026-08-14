"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelTest } from "@/app/parent/actions";
import { Spinner } from "@/components/Spinner";

export function CancelTestButton({ testId }: { testId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await cancelTest(testId);
    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    setConfirming(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-600 transition-all duration-150 hover:scale-105 hover:bg-rose-50"
      >
        Cancel test
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!loading) setConfirming(false);
          }}
        >
          <div
            className="w-full max-w-sm animate-pop-in rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <h2 className="mb-2 text-lg font-semibold text-slate-900">
              Cancel this test?
            </h2>
            <p className="mb-6 text-sm text-slate-500">
              This removes it from Akul&apos;s dashboard and deletes the
              generated questions. This can&apos;t be undone.
            </p>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirming(false);
                }}
                disabled={loading}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Keep it
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConfirm();
                }}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-105 hover:shadow-md active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
              >
                {loading && <Spinner className="h-4 w-4" />}
                {loading ? "Cancelling…" : "Cancel test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
