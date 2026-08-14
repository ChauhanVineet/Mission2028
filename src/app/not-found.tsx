import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-indigo-50 via-purple-50 to-white p-6">
      <div className="w-full max-w-md animate-pop-in rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mb-3 text-4xl">🔍</div>
        <h1 className="mb-2 text-lg font-semibold text-slate-900">
          Page not found
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          That page doesn&apos;t exist, or the test may have been cancelled.
        </p>
        <Link
          href="/"
          className="inline-block rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:scale-105 active:scale-95"
        >
          🏠 Back home
        </Link>
      </div>
    </div>
  );
}
