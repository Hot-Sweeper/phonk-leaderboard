"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Star,
  ExternalLink,
  Plus,
  X,
  Send,
  User,
  RefreshCw,
  Pencil,
  Save,
  Trash2,  TrendingUp,} from "lucide-react";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function extractHandleFromUrl(platform: string, url: string): string | null {
  try {
    const parsedUrl = new URL(url);

    if (platform === "TIKTOK") {
      const match = parsedUrl.pathname.match(/\/@([^/?#]+)/);
      return match?.[1] ?? null;
    }

    if (platform === "INSTAGRAM") {
      const path = parsedUrl.pathname.replace(/\/+$/, "");
      const match = path.match(/^\/([^/?#]+)/);
      const handle = match?.[1]?.replace(/^@/, "") ?? null;
      if (!handle) return null;

      const reservedPaths = new Set([
        "p",
        "reel",
        "reels",
        "tv",
        "stories",
        "explore",
        "accounts",
        "direct",
      ]);

      return reservedPaths.has(handle.toLowerCase()) ? null : handle;
    }

    return null;
  } catch {
    return null;
  }
}

const STAT_LABELS: Record<string, string> = {
  YOUTUBE: "subscribers",
  SPOTIFY: "monthly listeners",
  TIKTOK: "followers",
  INSTAGRAM: "followers",
};

const PLATFORM_META: Record<
  string,
  { label: string; color: string; bg: string; border: string }
> = {
  YOUTUBE: {
    label: "YouTube",
    color: "text-red-400",
    bg: "bg-red-950/60",
    border: "border-red-800/40",
  },
  SPOTIFY: {
    label: "Spotify",
    color: "text-green-400",
    bg: "bg-green-950/60",
    border: "border-green-800/40",
  },
  TIKTOK: {
    label: "TikTok",
    color: "text-cyan-400",
    bg: "bg-cyan-950/60",
    border: "border-cyan-800/40",
  },
  INSTAGRAM: {
    label: "Instagram",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-950/60",
    border: "border-fuchsia-800/40",
  },
};

type ArtistLink = {
  id: string;
  platform: string;
  url: string;
  handle: string | null;
  followerCount: number;
  monthlyListeners: number;
};

type Suggestion = {
  id: string;
  platform: string;
  url: string;
  note: string | null;
  createdAt: string;
};

type Artist = {
  id: string;
  name: string;
  imageUrl: string | null;
  bio: string | null;
  watchlistCount: number;
  links: ArtistLink[];
  suggestions: Suggestion[];
};

type EditableLink = {
  platform: string;
  url: string;
  handle: string;
};

/* ─── Growth Chart Component ─── */
type Snapshot = {
  monthlyListeners: number;
  followerCount: number;
  createdAt: string;
};

const CHART_PERIODS = [
  { key: "day", label: "24H" },
  { key: "week", label: "7D" },
  { key: "month", label: "30D" },
  { key: "year", label: "1Y" },
];

function GrowthChart({ artistId }: { artistId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [period, setPeriod] = useState("week");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/artists/${artistId}/snapshots?period=${period}`)
      .then((r) => r.json())
      .then((data) => setSnapshots(data ?? []))
      .catch(() => setSnapshots([]))
      .finally(() => setLoading(false));
  }, [artistId, period]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || snapshots.length < 2) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 20, right: 16, bottom: 30, left: 50 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    const values = snapshots.map((s) => s.monthlyListeners);
    const times = snapshots.map((s) => new Date(s.createdAt).getTime());
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);

    const toX = (t: number) => pad.left + ((t - minTime) / (maxTime - minTime || 1)) * chartW;
    const toY = (v: number) => pad.top + chartH - ((v - minVal) / (maxVal - minVal || 1)) * chartH;

    ctx.clearRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const val = minVal + ((maxVal - minVal) / 4) * (4 - i);
      const y = pad.top + (chartH / 4) * i;
      let label: string;
      if (val >= 1_000_000) label = `${(val / 1_000_000).toFixed(1)}M`;
      else if (val >= 1_000) label = `${(val / 1_000).toFixed(0)}K`;
      else label = String(Math.round(val));
      ctx.fillText(label, pad.left - 6, y);
    }

    // X-axis labels
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xLabelCount = Math.min(6, snapshots.length);
    for (let i = 0; i < xLabelCount; i++) {
      const idx = Math.round((i / (xLabelCount - 1)) * (snapshots.length - 1));
      const d = new Date(snapshots[idx].createdAt);
      const label = period === "day"
        ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString([], { month: "short", day: "numeric" });
      ctx.fillText(label, toX(times[idx]), h - pad.bottom + 8);
    }

    // Line
    const isGrowing = values[values.length - 1] >= values[0];
    const lineColor = isGrowing ? "#22c55e" : "#ef4444";
    const fillColor = isGrowing ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";

    // Area fill
    ctx.beginPath();
    ctx.moveTo(toX(times[0]), toY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(toX(times[i]), toY(values[i]));
    }
    ctx.lineTo(toX(times[times.length - 1]), pad.top + chartH);
    ctx.lineTo(toX(times[0]), pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    // Line stroke
    ctx.beginPath();
    ctx.moveTo(toX(times[0]), toY(values[0]));
    for (let i = 1; i < values.length; i++) {
      ctx.lineTo(toX(times[i]), toY(values[i]));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Dots at start and end
    for (const idx of [0, values.length - 1]) {
      ctx.beginPath();
      ctx.arc(toX(times[idx]), toY(values[idx]), 3, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    }
  }, [snapshots, period]);

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const changePercent = first && last && first.monthlyListeners > 0
    ? ((last.monthlyListeners - first.monthlyListeners) / first.monthlyListeners * 100)
    : null;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-black uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> Growth
        </h2>
        <div className="flex gap-1 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
          {CHART_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                period === p.key
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted-foreground)] hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-4">
        {loading ? (
          <div className="h-48 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
            Loading...
          </div>
        ) : snapshots.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
            Not enough data yet. Stats are recorded on each refresh.
          </div>
        ) : (
          <>
            {changePercent !== null && (
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-lg font-black tabular-nums ${changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  monthly listeners change
                </span>
              </div>
            )}
            <canvas ref={canvasRef} className="w-full h-48" />
          </>
        )}
      </div>
    </div>
  );
}

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWatched, setIsWatched] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [showSuggest, setShowSuggest] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [suggestPlatform, setSuggestPlatform] = useState("YOUTUBE");
  const [suggestUrl, setSuggestUrl] = useState("");
  const [suggestNote, setSuggestNote] = useState("");
  const [suggestSent, setSuggestSent] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLinks, setEditLinks] = useState<EditableLink[]>([]);

  const loadArtist = useCallback(async () => {
    const res = await fetch(`/api/artists/${id}`);
    if (res.ok) setArtist(await res.json());
    setLoading(false);
  }, [id]);

  const checkWatchlist = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (res.ok) {
      const ids: string[] = await res.json();
      setIsWatched(ids.includes(id));
    }
  }, [id]);

  useEffect(() => {
    loadArtist();
    checkWatchlist();
  }, [loadArtist, checkWatchlist]);

  async function refreshStats() {
    setRefreshing(true);
    const res = await fetch(`/api/artists/${id}/refresh`, { method: "POST" });
    if (res.ok) setArtist(await res.json());
    setRefreshing(false);
  }

  async function toggleWatchlist() {
    if (!session) return signIn("google");
    if (toggling) return;
    setToggling(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: isWatched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId: id }),
      });
      if (res.ok && artist) {
        setIsWatched(!isWatched);
        setArtist({
          ...artist,
          watchlistCount: artist.watchlistCount + (isWatched ? -1 : 1),
        });
      }
    } finally {
      setToggling(false);
    }
  }

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return signIn("google");
    const isPrivileged =
      session.user?.role === "ADMIN" || session.user?.role === "MODERATOR";
    const res = await fetch(`/api/artists/${id}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        platform: suggestPlatform,
        url: suggestUrl,
        note: suggestNote,
      }),
    });
    if (res.ok) {
      if (isPrivileged) {
        // Admin/mod: link applied directly, reload artist data
        setArtist(await res.json());
        setShowSuggest(false);
        setSuggestUrl("");
        setSuggestNote("");
      } else {
        setSuggestSent(true);
        setTimeout(() => {
          setShowSuggest(false);
          setSuggestSent(false);
          setSuggestUrl("");
          setSuggestNote("");
        }, 2000);
      }
    }
  }

  async function requestRemoval() {
    if (!artist) return;
    const confirmed = window.confirm(
      session?.user?.role === "ADMIN"
        ? `Delete "${artist.name}" permanently? This cannot be undone.`
        : `Request removal of "${artist.name}"? An admin will review this.`
    );
    if (!confirmed) return;

    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "REMOVAL",
        artistId: artist.id,
        reason: "Requested from artist page",
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.directDelete) {
        window.location.href = "/";
      } else {
        alert("Removal request submitted. An admin will review it.");
      }
    } else {
      const data = await res.json();
      alert(data.error ?? "Failed to submit removal request.");
    }
  }

  function openEditModal() {
    if (!artist) return;
    setEditName(artist.name);
    setEditBio(artist.bio ?? "");
    setEditLinks(
      artist.links.map((link) => ({
        platform: link.platform,
        url: link.url,
        handle: link.handle ?? "",
      }))
    );
    setShowEdit(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSavingEdit(true);

    try {
      const validLinks = editLinks.filter((link) => link.url.trim());
      const res = await fetch(`/api/artists/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName,
          bio: editBio,
          links: validLinks,
        }),
      });

      if (res.ok) {
        setArtist(await res.json());
        setShowEdit(false);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <User className="w-16 h-16 text-[var(--muted-foreground)]" />
        <p className="text-xl font-bold">Artist not found</p>
        <Link
          href="/leaderboard"
          className="text-[var(--accent)] hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Phonk Ranks
        </Link>
      </div>
    );
  }

  // Which platforms are missing?
  const existingPlatforms = new Set(artist.links.map((l) => l.platform));
  const missingPlatforms = Object.keys(PLATFORM_META).filter(
    (p) => !existingPlatforms.has(p)
  );

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Back link */}
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-white text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Phonk Ranks
        </Link>

        {/* Artist Header */}
        <div className="relative overflow-hidden rounded-3xl border border-[var(--muted)] bg-gradient-to-br from-[var(--secondary)] to-[#0f0f12] p-8 mb-8">
          {/* Accent glow behind */}
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />

          <div className="flex items-start gap-6 relative">
            {/* Avatar */}
            {artist.imageUrl ? (
              <Image
                src={artist.imageUrl}
                alt={artist.name}
                width={128}
                height={128}
                className="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover border-2 border-[var(--muted)] shadow-2xl shrink-0"
              />
            ) : (
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-2xl bg-[var(--muted)] flex items-center justify-center shrink-0 border-2 border-[var(--muted)]">
                <User className="w-12 h-12 text-[var(--muted-foreground)]" />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h1 className="text-3xl md:text-4xl font-black tracking-tight mb-1">
                {artist.name}
              </h1>
              {artist.bio && (
                <p className="text-[var(--muted-foreground)] text-sm mb-4 max-w-md">
                  {artist.bio}
                </p>
              )}

              <div className="flex items-center gap-4 flex-wrap">
                <button
                  onClick={toggleWatchlist}
                  disabled={toggling}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all disabled:opacity-60 ${
                    isWatched
                      ? "bg-[var(--accent)] text-white shadow-[0_0_20px_var(--accent-glow)]"
                      : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-zinc-700 hover:text-white"
                  }`}
                >
                  {toggling ? (
                    <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Star
                      className={`w-5 h-5 ${isWatched ? "fill-current" : ""}`}
                    />
                  )}
                  {isWatched ? "Watching" : "Add to Watchlist"}
                </button>
                <span className="text-[var(--muted-foreground)] text-sm tabular-nums">
                  <strong className="text-white">
                    {artist.watchlistCount}
                  </strong>{" "}
                  watchlists
                </span>
                {(session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR") && (
                  <button
                    onClick={openEditModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit Artist
                  </button>
                )}
                {(session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR") && (
                  <button
                    onClick={refreshStats}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh Stats
                  </button>
                )}
                {(session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR") && (
                  <button
                    onClick={requestRemoval}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/50 text-red-300 hover:bg-red-900/80 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {session?.user?.role === "ADMIN" ? "Delete Artist" : "Request Removal"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Platform Links */}
        <h2 className="text-lg font-black mb-4 uppercase tracking-wider text-[var(--muted-foreground)]">
          Platforms
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {artist.links.map((link) => {
            const meta = PLATFORM_META[link.platform];
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative overflow-hidden rounded-2xl border ${meta.border} ${meta.bg} p-5 transition-all hover:scale-[1.02] hover:shadow-lg`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div
                      className={`text-xs font-bold uppercase tracking-wider ${meta.color} mb-1`}
                    >
                      {meta.label}
                    </div>
                    <div className="font-bold text-lg">
                      {link.handle || extractHandleFromUrl(link.platform, link.url)
                        ? `@${link.handle ?? extractHandleFromUrl(link.platform, link.url)}`
                        : artist.name}
                    </div>
                    {link.platform === "SPOTIFY" && link.monthlyListeners > 0 && (
                      <div className="text-white text-sm mt-1 tabular-nums font-semibold">
                        {formatCount(link.monthlyListeners)} monthly listeners
                      </div>
                    )}
                    {link.followerCount > 0 && (
                      <div className="text-[var(--muted-foreground)] text-sm mt-1 tabular-nums">
                        {formatCount(link.followerCount)} {link.platform === "SPOTIFY" ? "followers" : (STAT_LABELS[link.platform] ?? "followers")}
                      </div>
                    )}
                  </div>
                  <ExternalLink className="w-5 h-5 text-[var(--muted-foreground)] group-hover:text-white transition-colors" />
                </div>
              </a>
            );
          })}

          {/* Missing platforms + suggest */}
          {missingPlatforms.map((platform) => {
            const meta = PLATFORM_META[platform];
            return (
              <button
                key={platform}
                onClick={() => {
                  setSuggestPlatform(platform);
                  session ? setShowSuggest(true) : signIn("google");
                }}
                className="rounded-2xl border border-dashed border-[var(--muted)] p-5 transition-all hover:border-[var(--accent)] group text-left"
              >
                <div
                  className={`text-xs font-bold uppercase tracking-wider ${meta.color} mb-1 opacity-50 group-hover:opacity-100`}
                >
                  {meta.label}
                </div>
                <div className="text-[var(--muted-foreground)] text-sm flex items-center gap-1.5 group-hover:text-white">
                  <Plus className="w-4 h-4" /> Suggest link
                </div>
              </button>
            );
          })}
        </div>

        {/* Growth Chart */}
        <GrowthChart artistId={artist.id} />

        {/* Pending suggestions (visible to all) */}
        {artist.suggestions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-black mb-3 uppercase tracking-wider text-[var(--muted-foreground)]">
              Pending Suggestions
            </h2>
            <div className="flex flex-col gap-2">
              {artist.suggestions.map((s) => {
                const meta = PLATFORM_META[s.platform];
                return (
                  <div
                    key={s.id}
                    className="bg-[var(--secondary)] border border-[var(--muted)] rounded-xl p-4 flex items-center justify-between"
                  >
                    <div>
                      <span
                        className={`text-[10px] font-bold uppercase ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                      <div className="text-sm truncate max-w-md">{s.url}</div>
                      {s.note && (
                        <div className="text-[var(--muted-foreground)] text-xs italic mt-0.5">
                          {s.note}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300">
                      Pending
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Suggest Link Modal */}
      {showSuggest && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
            <button
              onClick={() => setShowSuggest(false)}
              className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-2">
              {session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR"
                ? "Add / Update Link"
                : "Suggest a Link"}
            </h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">
              {session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR"
                ? `Update ${artist.name}'s profile directly.`
                : `Help complete ${artist.name}'s profile. A moderator will review your suggestion.`}
            </p>
            {suggestSent ? (
              <div className="text-green-400 font-bold text-center py-8">
                Suggestion submitted!
              </div>
            ) : (
              <form
                onSubmit={submitSuggestion}
                className="flex flex-col gap-3"
              >
                <select
                  value={suggestPlatform}
                  onChange={(e) => setSuggestPlatform(e.target.value)}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  {Object.entries(PLATFORM_META).map(([val, meta]) => (
                    <option key={val} value={val}>
                      {meta.label}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="url"
                  placeholder="https://..."
                  value={suggestUrl}
                  onChange={(e) => setSuggestUrl(e.target.value)}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <input
                  placeholder="Note (optional)"
                  value={suggestNote}
                  onChange={(e) => setSuggestNote(e.target.value)}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  className="mt-1 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR"
                    ? "Apply Link"
                    : "Submit Suggestion"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {showEdit && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowEdit(false)}
              className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-4">Edit Artist</h2>
            <form onSubmit={saveEdit} className="flex flex-col gap-3">
              <input
                required
                placeholder="Artist name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
              />
              <textarea
                placeholder="Bio (optional)"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={3}
                className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
              />

              <div className="text-xs font-bold uppercase text-[var(--muted-foreground)] mt-2">
                Platform Links
              </div>
              {editLinks.map((link, index) => (
                <div key={`${link.platform}-${index}`} className="flex gap-2">
                  <select
                    value={link.platform}
                    onChange={(e) =>
                      setEditLinks((prev) =>
                        prev.map((currentLink, currentIndex) =>
                          currentIndex === index
                            ? { ...currentLink, platform: e.target.value }
                            : currentLink
                        )
                      )
                    }
                    className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none w-32"
                  >
                    {Object.entries(PLATFORM_META).map(([platform, meta]) => (
                      <option key={platform} value={platform}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="URL"
                    value={link.url}
                    onChange={(e) =>
                      setEditLinks((prev) =>
                        prev.map((currentLink, currentIndex) =>
                          currentIndex === index
                            ? { ...currentLink, url: e.target.value }
                            : currentLink
                        )
                      )
                    }
                    className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none flex-1 focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                  />
                  {editLinks.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setEditLinks((prev) => prev.filter((_, currentIndex) => currentIndex !== index))
                      }
                      className="text-[var(--muted-foreground)] hover:text-red-400 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  setEditLinks((prev) => [
                    ...prev,
                    { platform: "YOUTUBE", url: "", handle: "" },
                  ])
                }
                className="text-[var(--accent)] text-sm font-bold flex items-center gap-1 hover:underline w-max"
              >
                <Plus className="w-4 h-4" /> Add another link
              </button>

              <button
                type="submit"
                disabled={savingEdit}
                className="mt-2 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingEdit ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
