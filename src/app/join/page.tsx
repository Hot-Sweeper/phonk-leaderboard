"use client";
import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Shield, Key, Check, X, LogIn } from "lucide-react";

function JoinContent() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Auto-submit if user has session and code came from URL
  const codeFromUrl = searchParams.get("code");
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    if (session && codeFromUrl && !autoSubmitted && !result) {
      setAutoSubmitted(true);
      submitCode(codeFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, codeFromUrl, autoSubmitted]);

  async function submitCode(submitCodeValue?: string) {
    const codeToUse = submitCodeValue ?? code;
    if (!codeToUse.trim()) return;
    setSubmitting(true);
    setResult(null);

    const res = await fetch("/api/mod-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: codeToUse.trim() }),
    });

    const data = await res.json();
    if (res.ok) {
      setResult({
        ok: true,
        message:
          "Moderator request submitted! An admin will review it shortly.",
      });
    } else {
      setResult({ ok: false, message: data.error ?? "Something went wrong." });
    }
    setSubmitting(false);
  }

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4">
        <Shield className="w-16 h-16 text-[var(--accent)]" />
        <h1 className="text-2xl font-black">Moderator Invite</h1>
        <p className="text-[var(--muted-foreground)] max-w-sm">
          Sign in to claim your moderator invite and request access.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: window.location.href })}
          className="flex items-center gap-2 px-6 py-3 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white text-sm font-bold transition-all shadow-[0_0_15px_var(--accent-glow)]"
        >
          <LogIn className="w-4 h-4" /> Sign In with Google
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-md mx-auto relative z-10 pt-20">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full bg-[var(--accent)]/20 flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-[var(--accent)]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight mb-2">
            Moderator Invite
          </h1>
          <p className="text-[var(--muted-foreground)] text-sm">
            Enter your invite code to request moderator access.
          </p>
        </div>

        {result ? (
          <div
            className={`rounded-2xl p-6 text-center ${
              result.ok
                ? "bg-green-900/30 border border-green-800"
                : "bg-red-900/30 border border-red-800"
            }`}
          >
            <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-white/5">
              {result.ok ? (
                <Check className="w-6 h-6 text-green-400" />
              ) : (
                <X className="w-6 h-6 text-red-400" />
              )}
            </div>
            <p
              className={`font-bold ${result.ok ? "text-green-300" : "text-red-300"}`}
            >
              {result.message}
            </p>
            {!result.ok && (
              <button
                onClick={() => setResult(null)}
                className="mt-4 px-4 py-2 rounded-lg bg-[var(--muted)] text-sm font-bold hover:text-white transition-colors"
              >
                Try Again
              </button>
            )}
          </div>
        ) : (
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter invite code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="flex-1 bg-[var(--muted)] rounded-lg px-4 py-3 text-sm font-mono outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
              />
              <button
                onClick={() => submitCode()}
                disabled={submitting || !code.trim()}
                className="px-5 py-3 rounded-lg bg-[var(--accent)] hover:bg-[#a21caf] text-white text-sm font-bold transition-all disabled:opacity-50"
              >
                {submitting ? "..." : "Submit"}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
          Loading...
        </div>
      }
    >
      <JoinContent />
    </Suspense>
  );
}
