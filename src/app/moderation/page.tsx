"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { Skeleton } from "@/components/Skeleton";
import {
  Shield,
  Check,
  X,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  User,
  Link2,
  Trash2,
  Upload,
  Loader2,
  AlertCircle,
  MessageSquare,
} from "lucide-react";

/* ── Types ── */
type ArtistRequest = {
  id: string;
  type: string;
  name: string;
  links: string;
  artistId: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  user: { name: string | null; image: string | null; email: string | null };
};

type LinkSuggestion = {
  id: string;
  platform: string;
  url: string;
  note: string | null;
  createdAt: string;
  artist: { name: string };
  user: { name: string | null; image: string | null };
};

type ProgressEvent = {
  type: "progress" | "created" | "skip" | "error" | "done";
  done?: number;
  total?: number;
  created?: number;
  skipped?: number;
  failed?: number;
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

const STATUS_STYLES = {
  PENDING: "bg-yellow-900/50 text-yellow-300",
  APPROVED: "bg-green-900/50 text-green-300",
  REJECTED: "bg-red-900/50 text-red-300",
};

const STATUS_ICONS = {
  PENDING: Clock,
  APPROVED: CheckCircle,
  REJECTED: XCircle,
};

const PLATFORM_COLORS: Record<string, string> = {
  YOUTUBE: "text-red-400",
  SPOTIFY: "text-green-400",
  TIKTOK: "text-cyan-400",
  INSTAGRAM: "text-fuchsia-400",
};

type Tab = "requests" | "review" | "import";

function ModerationSkeleton() {
  return (
    <div className="space-y-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2 flex-1 min-w-0">
              <Skeleton className="h-5 w-48 max-w-full" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
      ))}
    </div>
  );
}

export default function ModerationPage() {
  const { data: session, status } = useSession();
  const isPrivileged = session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const [tab, setTab] = useState<Tab>("requests");
  const [requests, setRequests] = useState<ArtistRequest[]>([]);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  // Import state
  const [urlInput, setUrlInput] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; created: number; skipped: number; failed: number } | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [finished, setFinished] = useState(false);

  const load = useCallback(async () => {
    const [reqRes, sugRes] = await Promise.all([
      fetch("/api/requests"),
      isPrivileged ? fetch("/api/suggestions") : Promise.resolve(null),
    ]);
    if (reqRes.ok) setRequests(await reqRes.json());
    if (sugRes?.ok) setSuggestions(await sugRes.json());
    setLoading(false);
  }, [isPrivileged]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  async function handleReview(id: string, type: "request" | "suggestion", action: "approve" | "reject") {
    const body: Record<string, string> = type === "request"
      ? { requestId: id, action, reviewNote: reviewNotes[id] || "" }
      : { suggestionId: id, action };
    const res = await fetch("/api/requests/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) load();
  }

  async function startImport() {
    const urls = urlInput.split(/[\n,]+/).map((u) => u.trim()).filter((u) => u && u.includes("spotify.com"));
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
      if (!res.ok || !res.body) { setImporting(false); return; }

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
              setProgress({ done: event.done ?? 0, total: event.total ?? urls.length, created: event.created ?? 0, skipped: event.skipped ?? 0, failed: event.failed ?? 0 });
            } else if (event.type === "created") {
              setLog((prev) => [...prev, { type: "created", url: event.url ?? "", name: event.name }]);
            } else if (event.type === "skip") {
              setLog((prev) => [...prev, { type: "skip", url: event.url ?? "", name: event.name, reason: event.reason }]);
            } else if (event.type === "error") {
              setLog((prev) => [...prev, { type: "error", url: event.url ?? "", error: event.error }]);
            } else if (event.type === "done") {
              setProgress({ done: event.total ?? urls.length, total: event.total ?? urls.length, created: event.created ?? 0, skipped: event.skipped ?? 0, failed: event.failed ?? 0 });
              setFinished(true);
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch { /* network error */ }
    setImporting(false);
    setFinished(true);
  }

  if (status === "loading" || loading) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="max-w-3xl mx-auto relative z-10">
          <Skeleton className="h-10 w-56 max-w-full mb-4" />
          <Skeleton className="h-10 w-80 max-w-full mb-8" />
          <ModerationSkeleton />
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <Shield className="w-16 h-16 text-[var(--accent)]" />
        <h1 className="text-2xl font-black">Sign in required</h1>
        <button onClick={() => signIn("google")} className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold">Sign In</button>
      </main>
    );
  }

  const pendingReqs = requests.filter((r) => r.status === "PENDING");
  const reviewedReqs = requests.filter((r) => r.status !== "PENDING");

  const tabs: Array<{ key: Tab; label: string; icon: typeof Shield; count?: number; modOnly?: boolean }> = [
    { key: "requests", label: "Requests", icon: MessageSquare, count: pendingReqs.length },
    ...(isPrivileged ? [
      { key: "review" as Tab, label: "Review", icon: Shield, count: suggestions.length },
      { key: "import" as Tab, label: "Import", icon: Upload },
    ] : []),
  ];

  const urlCount = urlInput.split(/[\n,]+/).filter((u) => u.trim() && u.trim().includes("spotify.com")).length;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3">
            <Shield className="w-8 h-8 text-[var(--accent)]" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
              {isPrivileged ? "Moderation" : "My Requests"}
            </span>
          </h1>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[var(--secondary)] rounded-xl p-1 border border-[var(--muted)] mb-8 w-fit">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${tab === t.key ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
              {t.count !== undefined && t.count > 0 && (
                <span className="bg-white/10 px-1.5 py-0.5 rounded-full text-[10px] font-black">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Requests Tab ── */}
        {tab === "requests" && (
          <>
            {pendingReqs.length > 0 && (
              <div className="mb-10">
                <h2 className="text-lg font-black mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-400" /> Pending ({pendingReqs.length})
                </h2>
                <div className="flex flex-col gap-3">
                  {pendingReqs.map((req) => (
                    <div key={req.id} className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-3">
                          {req.user.image ? <img src={req.user.image} alt="" className="w-7 h-7 rounded-full" /> : <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center"><User className="w-3 h-3" /></div>}
                          <div>
                            <div className="font-bold text-sm">{req.user.name ?? req.user.email}</div>
                            <div className="text-[var(--muted-foreground)] text-xs">{new Date(req.createdAt).toLocaleDateString()}</div>
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${req.type === "REMOVAL" ? "bg-red-900/50 text-red-300" : "bg-yellow-900/50 text-yellow-300"}`}>
                          {req.type === "REMOVAL" ? "Removal" : "Pending"}
                        </span>
                      </div>
                      <div className="font-bold mb-1 flex items-center gap-2">
                        {req.type === "REMOVAL" && <Trash2 className="w-4 h-4 text-red-400" />}
                        {req.name}
                      </div>
                      {req.type !== "REMOVAL" && <div className="text-[var(--muted-foreground)] text-sm whitespace-pre-line mb-2">{req.links}</div>}
                      {req.reason && <p className="text-[var(--muted-foreground)] text-sm italic mb-2">&ldquo;{req.reason}&rdquo;</p>}
                      {isPrivileged && (
                        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--muted)]">
                          <input placeholder="Review note (optional)" value={reviewNotes[req.id] ?? ""} onChange={(e) => setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))} className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                          <div className="flex gap-2">
                            <button onClick={() => handleReview(req.id, "request", "approve")} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold"><Check className="w-3.5 h-3.5" /> Approve</button>
                            <button onClick={() => handleReview(req.id, "request", "reject")} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold"><X className="w-3.5 h-3.5" /> Reject</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {reviewedReqs.length > 0 && (
              <div>
                <h2 className="text-lg font-black mb-3 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-zinc-400" /> Reviewed ({reviewedReqs.length})</h2>
                <div className="flex flex-col gap-3">
                  {reviewedReqs.map((req) => {
                    const StatusIcon = STATUS_ICONS[req.status];
                    return (
                      <div key={req.id} className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 opacity-60">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            {req.user.image ? <img src={req.user.image} alt="" className="w-7 h-7 rounded-full" /> : <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center"><User className="w-3 h-3" /></div>}
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{req.name}</div>
                              <div className="text-[var(--muted-foreground)] text-xs">by {req.user.name ?? req.user.email}</div>
                            </div>
                          </div>
                          <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[req.status]}`}><StatusIcon className="w-3 h-3" />{req.status}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {pendingReqs.length === 0 && reviewedReqs.length === 0 && (
              <div className="text-center text-[var(--muted-foreground)] py-20">{isPrivileged ? "No requests to review." : "You haven't submitted any requests yet."}</div>
            )}
          </>
        )}

        {/* ── Review Tab (link suggestions) ── */}
        {tab === "review" && isPrivileged && (
          <>
            {suggestions.length > 0 ? (
              <div>
                <h2 className="text-lg font-black mb-3 flex items-center gap-2"><Link2 className="w-5 h-5 text-cyan-400" /> Link Suggestions ({suggestions.length})</h2>
                <div className="flex flex-col gap-3">
                  {suggestions.map((s) => (
                    <div key={s.id} className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-3">
                          {s.user.image ? <img src={s.user.image} alt="" className="w-7 h-7 rounded-full" /> : <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center"><User className="w-3 h-3" /></div>}
                          <span className="text-sm font-bold">{s.user.name}</span>
                        </div>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${PLATFORM_COLORS[s.platform] ?? ""} bg-white/5`}>{s.platform}</span>
                      </div>
                      <div className="text-sm mb-1">For <strong className="text-[var(--accent)]">{s.artist.name}</strong></div>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] text-sm flex items-center gap-1 hover:underline mb-1">{s.url} <ExternalLink className="w-3 h-3" /></a>
                      {s.note && <p className="text-[var(--muted-foreground)] text-xs italic">{s.note}</p>}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleReview(s.id, "suggestion", "approve")} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold"><Check className="w-3.5 h-3.5" /> Approve</button>
                        <button onClick={() => handleReview(s.id, "suggestion", "reject")} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold"><X className="w-3.5 h-3.5" /> Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center text-[var(--muted-foreground)] py-20">No pending link suggestions.</div>
            )}
          </>
        )}

        {/* ── Import Tab ── */}
        {tab === "import" && isPrivileged && (
          <>
            <p className="text-[var(--muted-foreground)] mb-6 text-sm">Paste Spotify artist URLs to import. Names and images are fetched from Spotify automatically. Duplicates are skipped.</p>

            {!importing && !finished && (
              <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6">
                <label className="text-xs font-bold uppercase text-[var(--muted-foreground)] block mb-2">Spotify Artist URLs (one per line)</label>
                <textarea value={urlInput} onChange={(e) => setUrlInput(e.target.value)} rows={8} placeholder={"https://open.spotify.com/artist/abc123\nhttps://open.spotify.com/artist/def456"} className="w-full bg-[var(--muted)] rounded-lg px-4 py-3 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600 mb-3 font-mono" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--muted-foreground)]">{urlCount} URL{urlCount !== 1 ? "s" : ""} detected</span>
                  <button onClick={startImport} disabled={urlCount === 0} className="px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-40 flex items-center gap-2"><Upload className="w-4 h-4" /> Start Import</button>
                </div>
              </div>
            )}

            {progress && (
              <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold text-sm">{finished ? "Import Complete" : "Importing..."}</h2>
                  <span className="text-sm tabular-nums text-[var(--muted-foreground)]">{progress.done} / {progress.total}</span>
                </div>
                <div className="w-full h-3 bg-[var(--muted)] rounded-full overflow-hidden mb-4">
                  <div className="h-full bg-gradient-to-r from-[var(--accent)] to-green-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex gap-4 text-sm">
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-400" /><span className="text-green-400 font-bold">{progress.created}</span><span className="text-[var(--muted-foreground)]">created</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400" /><span className="text-yellow-400 font-bold">{progress.skipped}</span><span className="text-[var(--muted-foreground)]">skipped</span></div>
                  <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400" /><span className="text-red-400 font-bold">{progress.failed}</span><span className="text-[var(--muted-foreground)]">failed</span></div>
                </div>
                {importing && <div className="mt-3 flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><Loader2 className="w-3.5 h-3.5 animate-spin" />Processing on server</div>}
              </div>
            )}

            {log.length > 0 && (
              <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6">
                <h2 className="font-bold text-sm mb-3">Import Log</h2>
                <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
                  {log.map((entry, i) => (
                    <div key={i} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${entry.type === "created" ? "bg-green-950/30 text-green-300" : entry.type === "skip" ? "bg-yellow-950/30 text-yellow-300" : "bg-red-950/30 text-red-300"}`}>
                      {entry.type === "created" ? <Check className="w-3.5 h-3.5 shrink-0" /> : entry.type === "skip" ? <AlertCircle className="w-3.5 h-3.5 shrink-0" /> : <X className="w-3.5 h-3.5 shrink-0" />}
                      <span className="font-bold">{entry.name ?? entry.url}</span>
                      {entry.type === "skip" && <span className="text-[var(--muted-foreground)]">-- {entry.reason}</span>}
                      {entry.type === "error" && <span className="text-[var(--muted-foreground)]">-- {entry.error}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {finished && (
              <div className="flex gap-3">
                <button onClick={() => { setProgress(null); setLog([]); setFinished(false); setUrlInput(""); }} className="px-5 py-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-white font-bold hover:border-[var(--accent)] transition-all">Import More</button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
