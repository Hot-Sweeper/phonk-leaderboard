"use client";
import { useState } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  X,
  Loader2,
  Upload,
  AlertCircle,
} from "lucide-react";

type ProgressEvent = {
  type: "progress" | "created" | "skip" | "error" | "done";
  done?: number;
  total?: number;
  created?: number;
  skipped?: number;
  failed?: number;
  index?: number;
  url?: string;
  name?: string;
  reason?: string;
  error?: string;
};

type LogEntry = {
  type: "created" | "skip" | "error";
  url: string;
  name?: string;
  reason?: string;
  error?: string;
};

export default function ImportPage() {
  const { data: session, status } = useSession();
  const [urlInput, setUrlInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
    created: number;
    skipped: number;
    failed: number;
  } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [finished, setFinished] = useState(false);

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  if (status === "loading")
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  if (!session || !isPrivileged) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertCircle className="w-16 h-16 text-[var(--accent)]" />
        <h1 className="text-2xl font-black">Admin / Moderator only</h1>
        {!session && (
          <button
            onClick={() => signIn("google")}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold"
          >
            Sign In
          </button>
        )}
      </main>
    );
  }

  async function startImport() {
    const urls = urlInput
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => u && u.includes("spotify.com"));

    if (urls.length === 0) return;

    setImporting(true);
    setProgress({ done: 0, total: urls.length, created: 0, skipped: 0, failed: 0 });
    setLog([]);
    setFinished(false);

    try {
      const res = await fetch("/api/artists/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });

      if (!res.ok || !res.body) {
        setImporting(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: ProgressEvent = JSON.parse(line);

            if (event.type === "progress") {
              setProgress({
                done: event.done ?? 0,
                total: event.total ?? urls.length,
                created: event.created ?? 0,
                skipped: event.skipped ?? 0,
                failed: event.failed ?? 0,
              });
            } else if (event.type === "created") {
              setLog((prev) => [
                ...prev,
                { type: "created", url: event.url ?? "", name: event.name ?? undefined },
              ]);
            } else if (event.type === "skip") {
              setLog((prev) => [
                ...prev,
                { type: "skip", url: event.url ?? "", name: event.name ?? undefined, reason: event.reason ?? undefined },
              ]);
            } else if (event.type === "error") {
              setLog((prev) => [
                ...prev,
                { type: "error", url: event.url ?? "", error: event.error ?? undefined },
              ]);
            } else if (event.type === "done") {
              setProgress({
                done: event.total ?? urls.length,
                total: event.total ?? urls.length,
                created: event.created ?? 0,
                skipped: event.skipped ?? 0,
                failed: event.failed ?? 0,
              });
              setFinished(true);
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }
    } catch {
      // network error
    }

    setImporting(false);
    setFinished(true);
  }

  const urlCount = urlInput
    .split(/[\n,]+/)
    .filter((u) => u.trim() && u.trim().includes("spotify.com")).length;

  const pct = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-3xl mx-auto relative z-10">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Phonk Ranks
        </Link>

        <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-2 flex items-center gap-3">
          <Upload className="w-8 h-8 text-[var(--accent)]" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
            Bulk Import
          </span>
        </h1>
        <p className="text-[var(--muted-foreground)] mb-8">
          Paste Spotify artist URLs to import. Names and images are fetched from
          Spotify automatically. Duplicates are skipped.
        </p>

        {/* Input area */}
        {!importing && !finished && (
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6">
            <label className="text-xs font-bold uppercase text-[var(--muted-foreground)] block mb-2">
              Spotify Artist URLs (one per line)
            </label>
            <textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              rows={8}
              placeholder={
                "https://open.spotify.com/artist/abc123\nhttps://open.spotify.com/artist/def456\nhttps://open.spotify.com/artist/ghi789"
              }
              className="w-full bg-[var(--muted)] rounded-lg px-4 py-3 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600 mb-3 font-mono"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--muted-foreground)]">
                {urlCount} URL{urlCount !== 1 ? "s" : ""} detected
              </span>
              <button
                onClick={startImport}
                disabled={urlCount === 0}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-40 flex items-center gap-2"
              >
                <Upload className="w-4 h-4" /> Start Import
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        {progress && (
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm">
                {finished ? "Import Complete" : "Importing..."}
              </h2>
              <span className="text-sm tabular-nums text-[var(--muted-foreground)]">
                {progress.done} / {progress.total}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-3 bg-[var(--muted)] rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-[var(--accent)] to-green-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>

            {/* Stats */}
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-green-400 font-bold">{progress.created}</span>
                <span className="text-[var(--muted-foreground)]">created</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-yellow-400 font-bold">{progress.skipped}</span>
                <span className="text-[var(--muted-foreground)]">skipped</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span className="text-red-400 font-bold">{progress.failed}</span>
                <span className="text-[var(--muted-foreground)]">failed</span>
              </div>
            </div>

            {importing && (
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Processing on server — you can close this tab safely
              </div>
            )}
          </div>
        )}

        {/* Log */}
        {log.length > 0 && (
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6">
            <h2 className="font-bold text-sm mb-3">Import Log</h2>
            <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
              {log.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
                    entry.type === "created"
                      ? "bg-green-950/30 text-green-300"
                      : entry.type === "skip"
                      ? "bg-yellow-950/30 text-yellow-300"
                      : "bg-red-950/30 text-red-300"
                  }`}
                >
                  {entry.type === "created" ? (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  ) : entry.type === "skip" ? (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <X className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="font-bold">{entry.name ?? entry.url}</span>
                  {entry.type === "skip" && (
                    <span className="text-[var(--muted-foreground)]">
                      — {entry.reason}
                    </span>
                  )}
                  {entry.type === "error" && (
                    <span className="text-[var(--muted-foreground)]">
                      — {entry.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Done actions */}
        {finished && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setProgress(null);
                setLog([]);
                setFinished(false);
                setUrlInput("");
              }}
              className="px-5 py-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-white font-bold hover:border-[var(--accent)] transition-all"
            >
              Import More
            </button>
            <Link
              href="/leaderboard"
              className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold hover:bg-[#a21caf] transition-all"
            >
              Back to Phonk Ranks
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
