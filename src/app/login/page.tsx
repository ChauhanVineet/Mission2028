"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ROLE_EMAILS, type Role } from "@/lib/roles";
import { Spinner } from "@/components/Spinner";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState<Role>("parent");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: ROLE_EMAILS[role],
        password,
      });

      if (signInError) {
        // Distinguish "wrong password" from anything else (network down,
        // auth service unreachable) so the user isn't told their password
        // is wrong when it isn't.
        setError(
          /invalid login credentials/i.test(signInError.message)
            ? "Incorrect password. Try again."
            : "Couldn't sign in right now. Check your connection and try again.",
        );
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Couldn't sign in right now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-[length:200%_200%] p-4 animate-gradient-x">
      <div className="pointer-events-none absolute -left-16 top-10 h-72 w-72 rounded-full bg-yellow-300 opacity-30 mix-blend-multiply blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -right-10 top-1/3 h-72 w-72 rounded-full bg-sky-300 opacity-30 mix-blend-multiply blur-3xl animate-blob animation-delay-2000" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-300 opacity-30 mix-blend-multiply blur-3xl animate-blob animation-delay-4000" />

      <div className="relative w-full max-w-sm animate-fade-in-up rounded-3xl bg-white/90 p-8 shadow-2xl ring-1 ring-white/50 backdrop-blur-sm">
        <div className="mb-2 text-center text-4xl">🚀</div>
        <h1 className="mb-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-center text-2xl font-extrabold text-transparent">
          Mission2028
        </h1>
        <p className="mb-6 text-center text-sm text-slate-500">
          Akul&apos;s JEE prep tracker
        </p>

        <div className="mb-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRole("parent")}
            className={`rounded-xl border-2 py-2 text-sm font-semibold transition-all duration-200 ${
              role === "parent"
                ? "scale-105 border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md"
                : "border-slate-200 text-slate-500 hover:scale-105 hover:border-slate-300"
            }`}
          >
            Parent
          </button>
          <button
            type="button"
            onClick={() => setRole("akul")}
            className={`rounded-xl border-2 py-2 text-sm font-semibold transition-all duration-200 ${
              role === "akul"
                ? "scale-105 border-transparent bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-md"
                : "border-slate-200 text-slate-500 hover:scale-105 hover:border-slate-300"
            }`}
          >
            Akul
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
              autoFocus
            />
          </div>

          {error && (
            <p className="animate-fade-in-up text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 py-2.5 text-sm font-semibold text-white shadow-md transition-all duration-200 hover:scale-[1.02] hover:shadow-lg active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
          >
            {loading && <Spinner />}
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <Link
          href="/forgot-password"
          className="mt-4 block text-center text-xs font-medium text-purple-600 transition hover:text-purple-700"
        >
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
