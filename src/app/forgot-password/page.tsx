"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ROLE_EMAILS, type Role } from "@/lib/roles";
import { Spinner } from "@/components/Spinner";

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 3))}@${domain}`;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"role" | "code">("role");
  const [role, setRole] = useState<Role>("parent");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function sendCode(selectedRole: Role) {
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(
      ROLE_EMAILS[selectedRole],
    );

    setLoading(false);

    if (sendError) {
      setError("Couldn't send a reset code. Try again in a bit.");
      return;
    }

    setRole(selectedRole);
    setStep("code");
    setInfo(`Code sent to ${maskEmail(ROLE_EMAILS[selectedRole])}`);
  }

  async function handleResend() {
    setInfo(null);
    await sendCode(role);
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: ROLE_EMAILS[role],
      token: code,
      type: "recovery",
    });

    if (verifyError) {
      setLoading(false);
      setError("That code is invalid or expired. Request a new one.");
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      setError("Couldn't set the new password. Try again.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 bg-[length:200%_200%] p-4 animate-gradient-x">
      <div className="pointer-events-none absolute -left-16 top-10 h-72 w-72 rounded-full bg-yellow-300 opacity-30 mix-blend-multiply blur-3xl animate-blob" />
      <div className="pointer-events-none absolute -right-10 top-1/3 h-72 w-72 rounded-full bg-sky-300 opacity-30 mix-blend-multiply blur-3xl animate-blob animation-delay-2000" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-300 opacity-30 mix-blend-multiply blur-3xl animate-blob animation-delay-4000" />

      <div className="relative w-full max-w-sm animate-fade-in-up rounded-3xl bg-white/90 p-8 shadow-2xl ring-1 ring-white/50 backdrop-blur-sm">
        <div className="mb-2 text-center text-4xl">🔑</div>
        <h1 className="mb-1 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-center text-2xl font-extrabold text-transparent">
          Reset password
        </h1>

        {step === "role" ? (
          <>
            <p className="mb-6 text-center text-sm text-slate-500">
              Whose password are you resetting?
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              <button
                onClick={() => sendCode("parent")}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 py-2 text-sm font-semibold text-slate-600 transition-all duration-200 hover:scale-105 hover:border-purple-300 hover:text-purple-700 disabled:opacity-60"
              >
                Parent
              </button>
              <button
                onClick={() => sendCode("akul")}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl border-2 border-slate-200 py-2 text-sm font-semibold text-slate-600 transition-all duration-200 hover:scale-105 hover:border-purple-300 hover:text-purple-700 disabled:opacity-60"
              >
                Akul
              </button>
            </div>
            {loading && (
              <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-400">
                <Spinner className="h-3.5 w-3.5" />
                Sending code…
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-slate-500">{info}</p>

            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label
                  htmlFor="code"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Verification code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={12}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-center text-lg tracking-widest transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
                />
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm transition focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200"
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
                {loading ? "Resetting…" : "Reset password"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-center text-xs font-medium text-purple-600 hover:text-purple-700"
              >
                Resend code
              </button>
            </form>
          </>
        )}

        <Link
          href="/login"
          className="mt-6 block text-center text-xs text-slate-400 hover:text-slate-500"
        >
          ← Back to login
        </Link>
      </div>
    </div>
  );
}
