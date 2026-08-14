"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export function PageNav({ homeHref }: { homeHref: string }) {
  const router = useRouter();

  // Opened directly (a shared link, a bookmark, a fresh tab) there's no
  // history to go back to and router.back() silently does nothing — fall
  // back to home so the button is never a dead end.
  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(homeHref);
    }
  }

  return (
    <div className="mb-4 flex items-center gap-2">
      <button
        onClick={handleBack}
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-sm transition-all duration-150 hover:scale-105 hover:bg-white"
      >
        ← Back
      </button>
      <Link
        href={homeHref}
        className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white/70 px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-sm transition-all duration-150 hover:scale-105 hover:bg-white"
      >
        🏠 Home
      </Link>
    </div>
  );
}
