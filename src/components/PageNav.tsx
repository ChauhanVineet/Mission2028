"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";

export function PageNav({ homeHref }: { homeHref: string }) {
  const router = useRouter();

  return (
    <div className="mb-4 flex items-center gap-2">
      <button
        onClick={() => router.back()}
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
