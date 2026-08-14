"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ROLE_EMAILS, type Role } from "@/lib/roles";

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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-center text-2xl font-semibold text-slate-900">
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
                className="rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 disabled:opacity-60"
              >
                Parent
              </button>
              <button
                onClick={() => sendCode("akul")}
                disabled={loading}
                className="rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 disabled:opacity-60"
              >
                Akul
              </button>
            </div>
            {loading && (
              <p className="text-center text-xs text-slate-400">Sending code…</p>
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
                  6-digit code
                </label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.3em] focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
              >
                {loading ? "Resetting…" : "Reset password"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="w-full text-center text-xs font-medium text-indigo-600 hover:text-indigo-700"
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
