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
  Trash2,
  TrendingUp,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Play,
  Pause,
  Music,
  Disc3,
  Hash,
  Users,
  Eye,
} from "lucide-react";

/* ─── SVG Platform Icons ─── */
function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}
function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 1 0 0-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 1 1-2.882 0 1.441 1.441 0 0 1 2.882 0z" />
    </svg>
  );
}

const PLATFORM_ICONS: Record<string, React.FC<{ className?: string }>> = {
  SPOTIFY: SpotifyIcon,
  YOUTUBE: YouTubeIcon,
  TIKTOK: TikTokIcon,
  INSTAGRAM: InstagramIcon,
};

/* ─── Helpers ─── */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
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
      const reserved = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);
      return reserved.has(handle.toLowerCase()) ? null : handle;
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

const PLATFORM_META: Record<string, { label: string; color: string; textColor: string; bg: string; border: string }> = {
  SPOTIFY: { label: "Spotify", color: "#1DB954", textColor: "text-green-400", bg: "bg-green-950/60", border: "border-green-800/40" },
  YOUTUBE: { label: "YouTube", color: "#FF0000", textColor: "text-red-400", bg: "bg-red-950/60", border: "border-red-800/40" },
  TIKTOK: { label: "TikTok", color: "#00f2ea", textColor: "text-cyan-400", bg: "bg-cyan-950/60", border: "border-cyan-800/40" },
  INSTAGRAM: { label: "Instagram", color: "#E4405F", textColor: "text-fuchsia-400", bg: "bg-fuchsia-950/60", border: "border-fuchsia-800/40" },
};

/* ─── Types ─── */
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
  bannerUrl: string | null;
  bio: string | null;
  genres: string[];
  spotifyPopularity: number;
  watchlistCount: number;
  links: ArtistLink[];
  suggestions: Suggestion[];
};

type Track = {
  id: string;
  spotifyId: string;
  name: string;
  albumName: string | null;
  albumImageUrl: string | null;
  previewUrl: string | null;
  durationMs: number;
  popularity: number;
  explicit: boolean;
  releaseDate: string | null;
  spotifyUrl: string | null;
  featuredArtists: string[];
};

type EditableLink = {
  platform: string;
  url: string;
  handle: string;
};

type RankData = {
  currentRank: number | null;
  previousRank: number | null;
  rankChange: number;
  podiumStreak: { current: number; best: number };
};

/* ─── Track Preview Player ─── */
function TrackPreview({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  return (
    <>
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} preload="none" />
      <button
        onClick={(e) => { e.stopPropagation(); toggle(); }}
        className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all shrink-0"
      >
        {playing ? <Pause className="w-3.5 h-3.5 text-white" /> : <Play className="w-3.5 h-3.5 text-white ml-0.5" />}
      </button>
    </>
  );
}

/* ─── Growth Chart ─── */
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

    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

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

    const isGrowing = values[values.length - 1] >= values[0];
    const lineColor = isGrowing ? "#22c55e" : "#ef4444";
    const fillColor = isGrowing ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)";

    ctx.beginPath();
    ctx.moveTo(toX(times[0]), toY(values[0]));
    for (let i = 1; i < values.length; i++) ctx.lineTo(toX(times[i]), toY(values[i]));
    ctx.lineTo(toX(times[times.length - 1]), pad.top + chartH);
    ctx.lineTo(toX(times[0]), pad.top + chartH);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(toX(times[0]), toY(values[0]));
    for (let i = 1; i < values.length; i++) ctx.lineTo(toX(times[i]), toY(values[i]));
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

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
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-black uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> Growth
        </h2>
        <div className="flex gap-1 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
          {CHART_PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2 py-0.5 rounded-md text-xs font-bold transition-all ${
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
      <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/40 p-4">
        {loading ? (
          <div className="h-44 flex items-center justify-center text-[var(--muted-foreground)] text-sm">Loading...</div>
        ) : snapshots.length < 2 ? (
          <div className="h-44 flex items-center justify-center text-[var(--muted-foreground)] text-sm">
            Not enough data yet. Stats are recorded on each refresh.
          </div>
        ) : (
          <>
            {changePercent !== null && (
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-lg font-black tabular-nums ${changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(2)}%
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">monthly listeners change</span>
              </div>
            )}
            <canvas ref={canvasRef} className="w-full h-44" />
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
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
  const [ytSearchQuery, setYtSearchQuery] = useState("");
  const [ytSearchResults, setYtSearchResults] = useState<Array<{ name: string; imageUrl: string | null; subscriberCount: number; handle: string | null; platformId: string | null }>>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLinks, setEditLinks] = useState<EditableLink[]>([]);
  const [rankData, setRankData] = useState<RankData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [spotifyPopularity, setSpotifyPopularity] = useState(0);

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
    // Load rank data
    fetch(`/api/artists/${id}/rank`)
      .then((r) => r.json())
      .then((d) => setRankData(d))
      .catch(() => {});
    // Load tracks
    fetch(`/api/artists/${id}/tracks`)
      .then((r) => r.json())
      .then((d) => {
        setTracks(d.tracks ?? []);
        setGenres(d.genres ?? []);
        setSpotifyPopularity(d.spotifyPopularity ?? 0);
      })
      .catch(() => {});
  }, [loadArtist, checkWatchlist, id]);

  // Debounced YouTube channel search for admin modal
  useEffect(() => {
    if (suggestPlatform !== "YOUTUBE" || !ytSearchQuery.trim()) {
      setYtSearchResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setYtSearching(true);
      try {
        const res = await fetch("/api/artists/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "search", q: ytSearchQuery.trim() }),
        });
        if (res.ok) setYtSearchResults(await res.json());
      } finally {
        setYtSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [ytSearchQuery, suggestPlatform]);

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
        setArtist({ ...artist, watchlistCount: artist.watchlistCount + (isWatched ? -1 : 1) });
      }
    } finally {
      setToggling(false);
    }
  }

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return signIn("google");
    const isPrivileged = session.user?.role === "ADMIN" || session.user?.role === "MODERATOR";
    const res = await fetch(`/api/artists/${id}/suggest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: suggestPlatform, url: suggestUrl, note: suggestNote }),
    });
    if (res.ok) {
      if (isPrivileged) {
        setArtist(await res.json());
        setShowSuggest(false);
        setSuggestUrl("");
        setSuggestNote("");
      } else {
        setSuggestSent(true);
        setTimeout(() => { setShowSuggest(false); setSuggestSent(false); setSuggestUrl(""); setSuggestNote(""); }, 2000);
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
      body: JSON.stringify({ type: "REMOVAL", artistId: artist.id, reason: "Requested from artist page" }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.directDelete) window.location.href = "/";
      else alert("Removal request submitted. An admin will review it.");
    } else {
      const data = await res.json();
      alert(data.error ?? "Failed to submit removal request.");
    }
  }

  function openEditModal() {
    if (!artist) return;
    setEditName(artist.name);
    setEditBio(artist.bio ?? "");
    setEditLinks(artist.links.map((link) => ({ platform: link.platform, url: link.url, handle: link.handle ?? "" })));
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
        body: JSON.stringify({ name: editName, bio: editBio, links: validLinks }),
      });
      if (res.ok) { setArtist(await res.json()); setShowEdit(false); }
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <User className="w-16 h-16 text-[var(--muted-foreground)]" />
        <p className="text-xl font-bold">Artist not found</p>
        <Link href="/leaderboard" className="text-[var(--accent)] hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to Phonk Ranks
        </Link>
      </div>
    );
  }

  const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
  const existingPlatforms = new Set(artist.links.map((l) => l.platform));
  const missingPlatforms = Object.keys(PLATFORM_META).filter((p) => !existingPlatforms.has(p));
  const isPrivileged = session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans">
      {/* ─── Hero Banner ─── */}
      <div className="relative">
        {/* Banner background: Spotify header image or gradient from artist image */}
        <div className="h-48 md:h-64 relative overflow-hidden">
          {artist.imageUrl ? (
            <>
              <Image
                src={artist.imageUrl}
                alt=""
                fill
                className="object-cover blur-2xl scale-110 opacity-40"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-[var(--background)]" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)]/20 to-[var(--background)]" />
          )}
        </div>

        {/* Artist info overlay */}
        <div className="max-w-5xl mx-auto px-4 md:px-8 relative -mt-24 md:-mt-28 pb-6">
          {/* Back link */}
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-xs mb-4 transition-colors relative z-10"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Phonk Ranks
          </Link>

          <div className="flex items-end gap-5 md:gap-7">
            {/* Avatar */}
            {artist.imageUrl ? (
              <Image
                src={artist.imageUrl}
                alt={artist.name}
                width={160}
                height={160}
                className="w-28 h-28 md:w-40 md:h-40 rounded-2xl object-cover border-4 border-[var(--background)] shadow-2xl shrink-0"
                priority
              />
            ) : (
              <div className="w-28 h-28 md:w-40 md:h-40 rounded-2xl bg-[var(--secondary)] flex items-center justify-center shrink-0 border-4 border-[var(--background)] shadow-2xl">
                <User className="w-12 h-12 text-[var(--muted-foreground)]" />
              </div>
            )}

            <div className="flex-1 min-w-0 pb-1">
              <div className="flex items-center gap-3 mb-1">
                {rankData?.currentRank !== null && rankData?.currentRank !== undefined && (
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-black tabular-nums">
                    #{rankData.currentRank}
                    {rankData.rankChange !== 0 && (
                      <span className={`ml-1 ${rankData.rankChange > 0 ? "text-green-400" : "text-red-400"}`}>
                        {rankData.rankChange > 0 ? (
                          <ArrowUpRight className="w-3 h-3 inline" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 inline" />
                        )}
                        {Math.abs(rankData.rankChange)}
                      </span>
                    )}
                  </span>
                )}
                {rankData?.podiumStreak?.current !== undefined && rankData.podiumStreak.current > 0 && (
                  <span className="px-2.5 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-700/40 text-yellow-400 text-xs font-black flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> {rankData.podiumStreak.current}d streak
                  </span>
                )}
              </div>

              <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-none mb-2">
                {artist.name}
              </h1>

              {/* Genres */}
              {genres.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {genres.map((g) => (
                    <span key={g} className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase tracking-wider text-white/50">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Platform icons row */}
              <div className="flex items-center gap-2 mt-1">
                {Object.keys(PLATFORM_META).map((platform) => {
                  const Icon = PLATFORM_ICONS[platform];
                  const meta = PLATFORM_META[platform];
                  if (!Icon) return null;
                  const link = artist.links.find((l) => l.platform === platform);
                  if (link) {
                    return (
                      <a
                        key={platform}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                        style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                        title={meta.label}
                      >
                        <Icon className="w-4 h-4" />
                      </a>
                    );
                  }
                  if (!isPrivileged) return null;
                  return (
                    <button
                      key={platform}
                      onClick={() => { setSuggestPlatform(platform); setSuggestUrl(""); setYtSearchQuery(""); setYtSearchResults([]); setShowSuggest(true); }}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 opacity-25 hover:opacity-60"
                      style={{ backgroundColor: `${meta.color}10` }}
                      title={`Add ${meta.label}`}
                    >
                      <Icon className={`w-4 h-4 ${meta.textColor}`} />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Content ─── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 pb-16">
        {/* Action buttons */}
        <div className="flex items-center gap-3 flex-wrap mb-8">
          <button
            onClick={toggleWatchlist}
            disabled={toggling}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all disabled:opacity-60 ${
              isWatched
                ? "bg-[var(--accent)] text-white shadow-[0_0_20px_var(--accent-glow)]"
                : "bg-[var(--secondary)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white hover:border-[var(--accent)]"
            }`}
          >
            {toggling ? (
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
              <Star className={`w-4 h-4 ${isWatched ? "fill-current" : ""}`} />
            )}
            {isWatched ? "Watching" : "Add to Watchlist"}
          </button>
          <span className="text-[var(--muted-foreground)] text-sm tabular-nums">
            <strong className="text-white">{artist.watchlistCount}</strong> watchlists
          </span>
          {isPrivileged && (
            <>
              <button onClick={openEditModal} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--secondary)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all">
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button onClick={refreshStats} disabled={refreshing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--secondary)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh
              </button>
              <button onClick={requestRemoval} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/30 border border-red-800/30 text-red-400 hover:bg-red-900/50 transition-all">
                <Trash2 className="w-3.5 h-3.5" /> {session?.user?.role === "ADMIN" ? "Delete" : "Remove"}
              </button>
            </>
          )}
        </div>

        {/* Bio */}
        {artist.bio && (
          <div className="mb-8 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/40 p-5">
            <p className="text-sm text-[var(--muted-foreground)] leading-relaxed whitespace-pre-wrap">{artist.bio}</p>
          </div>
        )}

        {/* ─── Metric Cards ─── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {/* Spotify Monthly Listeners */}
          {spotifyLink && spotifyLink.monthlyListeners > 0 && (
            <div className="rounded-xl border border-green-800/30 bg-green-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <SpotifyIcon className="w-4 h-4 text-green-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-green-400/70">Monthly Listeners</span>
              </div>
              <div className="text-2xl font-black tabular-nums text-white">{formatCount(spotifyLink.monthlyListeners)}</div>
            </div>
          )}
          {/* Spotify Followers */}
          {spotifyLink && spotifyLink.followerCount > 0 && (
            <div className="rounded-xl border border-green-800/30 bg-green-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-green-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-green-400/70">Followers</span>
              </div>
              <div className="text-2xl font-black tabular-nums text-white">{formatCount(spotifyLink.followerCount)}</div>
            </div>
          )}
          {/* Spotify Popularity */}
          {spotifyPopularity > 0 && (
            <div className="rounded-xl border border-purple-800/30 bg-purple-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400/70">Popularity</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-black tabular-nums text-white">{spotifyPopularity}</div>
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-purple-400" style={{ width: `${spotifyPopularity}%` }} />
                </div>
              </div>
            </div>
          )}
          {/* Watchlist */}
          <div className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/40 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-[var(--accent)]" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]/70">Watchlists</span>
            </div>
            <div className="text-2xl font-black tabular-nums text-white">{artist.watchlistCount}</div>
          </div>
          {/* Other platform stats */}
          {artist.links.filter((l) => l.platform !== "SPOTIFY" && l.followerCount > 0).map((link) => {
            const Icon = PLATFORM_ICONS[link.platform];
            const meta = PLATFORM_META[link.platform];
            return (
              <div key={link.id} className={`rounded-xl border ${meta.border} ${meta.bg} p-4`}>
                <div className="flex items-center gap-2 mb-2">
                  {Icon && <Icon className={`w-4 h-4 ${meta.textColor}`} />}
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.textColor} opacity-70`}>
                    {STAT_LABELS[link.platform] ?? "Followers"}
                  </span>
                </div>
                <div className="text-2xl font-black tabular-nums text-white">{formatCount(link.followerCount)}</div>
              </div>
            );
          })}
          {/* Podium streak */}
          {rankData?.podiumStreak?.best !== undefined && rankData.podiumStreak.best > 0 && (
            <div className="rounded-xl border border-yellow-800/30 bg-yellow-950/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-400/70">Best Streak</span>
              </div>
              <div className="text-2xl font-black tabular-nums text-yellow-400">{rankData.podiumStreak.best}d</div>
            </div>
          )}
        </div>

        {/* ─── Platform Links ─── */}
        <h2 className="text-base font-black mb-3 uppercase tracking-wider text-[var(--muted-foreground)]">Platforms</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          {artist.links.map((link) => {
            const meta = PLATFORM_META[link.platform];
            const Icon = PLATFORM_ICONS[link.platform];
            return (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative overflow-hidden rounded-xl border ${meta.border} ${meta.bg} p-4 transition-all hover:scale-[1.02] hover:shadow-lg`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {Icon && (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${meta.color}20`, color: meta.color }}>
                        <Icon className="w-5 h-5" />
                      </div>
                    )}
                    <div>
                      <div className={`text-xs font-bold uppercase tracking-wider ${meta.textColor} mb-0.5`}>
                        {meta.label}
                      </div>
                      <div className="font-bold text-sm">
                        {link.handle || extractHandleFromUrl(link.platform, link.url)
                          ? `@${link.handle ?? extractHandleFromUrl(link.platform, link.url)}`
                          : artist.name}
                      </div>
                      {link.platform === "SPOTIFY" && link.monthlyListeners > 0 && (
                        <div className="text-white/70 text-xs mt-0.5 tabular-nums">{formatCount(link.monthlyListeners)} monthly listeners</div>
                      )}
                      {link.followerCount > 0 && (
                        <div className="text-[var(--muted-foreground)] text-xs tabular-nums">
                          {formatCount(link.followerCount)} {link.platform === "SPOTIFY" ? "followers" : (STAT_LABELS[link.platform] ?? "followers")}
                        </div>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-white transition-colors" />
                </div>
              </a>
            );
          })}
          {/* Missing platforms */}
          {missingPlatforms.map((platform) => {
            const meta = PLATFORM_META[platform];
            const Icon = PLATFORM_ICONS[platform];
            return (
              <button
                key={platform}
                onClick={() => { setSuggestPlatform(platform); setSuggestUrl(""); setYtSearchQuery(""); setYtSearchResults([]); session ? setShowSuggest(true) : signIn("google"); }}
                className="rounded-xl border border-dashed border-[var(--muted)] p-4 transition-all hover:border-[var(--accent)] group text-left"
              >
                <div className="flex items-center gap-3">
                  {Icon && (
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-white/5 opacity-40 group-hover:opacity-100 transition-opacity">
                      <Icon className={`w-5 h-5 ${meta.textColor}`} />
                    </div>
                  )}
                  <div>
                    <div className={`text-xs font-bold uppercase tracking-wider ${meta.textColor} opacity-50 group-hover:opacity-100 mb-0.5`}>
                      {meta.label}
                    </div>
                    <div className="text-[var(--muted-foreground)] text-xs flex items-center gap-1 group-hover:text-white">
                      <Plus className="w-3 h-3" /> Suggest link
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ─── Top Tracks ─── */}
        {tracks.length > 0 && (
          <div className="mb-8">
            <h2 className="text-base font-black mb-3 uppercase tracking-wider text-[var(--muted-foreground)] flex items-center gap-2">
              <Music className="w-4 h-4" /> Popular Songs
            </h2>
            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/40 overflow-hidden">
              {tracks.map((track, i) => (
                <a
                  key={track.id}
                  href={track.spotifyUrl ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 md:gap-4 px-4 py-3 hover:bg-white/[0.03] transition-colors group border-b border-[var(--muted)] last:border-0"
                >
                  {/* Track number */}
                  <span className="w-6 text-right text-xs font-bold text-[var(--muted-foreground)] tabular-nums shrink-0">
                    {i + 1}
                  </span>

                  {/* Album art */}
                  {track.albumImageUrl ? (
                    <Image
                      src={track.albumImageUrl}
                      alt={track.albumName ?? ""}
                      width={44}
                      height={44}
                      className="w-11 h-11 rounded-md object-cover shrink-0 shadow"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-md bg-[var(--muted)] flex items-center justify-center shrink-0">
                      <Disc3 className="w-5 h-5 text-[var(--muted-foreground)]" />
                    </div>
                  )}

                  {/* Preview button */}
                  <div className="shrink-0">
                    {track.previewUrl ? (
                      <TrackPreview url={track.previewUrl} />
                    ) : (
                      <div className="w-8 h-8" />
                    )}
                  </div>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm truncate">{track.name}</span>
                      {track.explicit && (
                        <span className="px-1 py-px rounded text-[9px] font-bold bg-white/10 text-white/50 shrink-0">E</span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)] truncate">
                      {track.albumName}
                      {track.featuredArtists.length > 0 && (
                        <span className="text-white/40"> feat. {track.featuredArtists.join(", ")}</span>
                      )}
                    </div>
                  </div>

                  {/* Release date */}
                  <div className="hidden md:block text-xs text-[var(--muted-foreground)] tabular-nums shrink-0 w-24 text-right">
                    {track.releaseDate ?? ""}
                  </div>

                  {/* Duration */}
                  <div className="text-xs text-[var(--muted-foreground)] tabular-nums shrink-0 w-10 text-right">
                    {formatDuration(track.durationMs)}
                  </div>

                  {/* Popularity bar */}
                  <div className="hidden sm:flex items-center gap-2 shrink-0 w-24">
                    <div className="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-green-400/60" style={{ width: `${track.popularity}%` }} />
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums w-6 text-right">{track.popularity}</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ─── Growth Chart ─── */}
        <div className="mb-8">
          <GrowthChart artistId={artist.id} />
        </div>

        {/* ─── Pending Suggestions ─── */}
        {artist.suggestions.length > 0 && (
          <div className="mb-8">
            <h2 className="text-base font-black mb-3 uppercase tracking-wider text-[var(--muted-foreground)]">Pending Suggestions</h2>
            <div className="flex flex-col gap-2">
              {artist.suggestions.map((s) => {
                const meta = PLATFORM_META[s.platform];
                return (
                  <div key={s.id} className="bg-[var(--secondary)]/60 border border-[var(--muted)] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className={`text-[10px] font-bold uppercase ${meta.textColor}`}>{meta.label}</span>
                      <div className="text-sm truncate max-w-md">{s.url}</div>
                      {s.note && <div className="text-[var(--muted-foreground)] text-xs italic mt-0.5">{s.note}</div>}
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300">Pending</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Suggest Link Modal ─── */}
      {showSuggest && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
            <button onClick={() => setShowSuggest(false)} className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-2">
              {isPrivileged ? "Add / Update Link" : "Suggest a Link"}
            </h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">
              {isPrivileged ? `Update ${artist.name}'s profile directly.` : `Help complete ${artist.name}'s profile. A moderator will review your suggestion.`}
            </p>
            {suggestSent ? (
              <div className="text-green-400 font-bold text-center py-8">Suggestion submitted!</div>
            ) : (
              <form onSubmit={submitSuggestion} className="flex flex-col gap-3">
                <select value={suggestPlatform} onChange={(e) => { setSuggestPlatform(e.target.value); setSuggestUrl(""); setYtSearchQuery(""); setYtSearchResults([]); }} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]">
                  {Object.entries(PLATFORM_META).map(([val, meta]) => <option key={val} value={val}>{meta.label}</option>)}
                </select>
                {isPrivileged && suggestPlatform === "YOUTUBE" ? (
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <input
                        placeholder="Search YouTube channel..."
                        value={ytSearchQuery}
                        onChange={(e) => setYtSearchQuery(e.target.value)}
                        className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500 w-full"
                      />
                      {ytSearching && (
                        <RefreshCw className="w-4 h-4 animate-spin absolute right-3 top-2.5 text-[var(--muted-foreground)]" />
                      )}
                    </div>
                    {ytSearchResults.length > 0 && (
                      <div className="max-h-52 overflow-y-auto flex flex-col gap-1 rounded-lg border border-[var(--muted)] bg-[var(--background)] p-1">
                        {ytSearchResults.map((ch) => (
                          <button
                            key={ch.platformId}
                            type="button"
                            onClick={() => {
                              setSuggestUrl(`https://www.youtube.com/${ch.handle ? `@${ch.handle}` : `channel/${ch.platformId}`}`);
                              setYtSearchQuery(ch.name);
                              setYtSearchResults([]);
                            }}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors text-left"
                          >
                            {ch.imageUrl && (
                              <img src={ch.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-bold truncate">{ch.name}</div>
                              <div className="text-xs text-[var(--muted-foreground)]">{formatCount(ch.subscriberCount)} subscribers</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    <input type="url" placeholder="https://youtube.com/..." value={suggestUrl} onChange={(e) => setSuggestUrl(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                  </div>
                ) : (
                  <input required type="url" placeholder="https://..." value={suggestUrl} onChange={(e) => setSuggestUrl(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                )}
                <input placeholder="Note (optional)" value={suggestNote} onChange={(e) => setSuggestNote(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                <button type="submit" disabled={!suggestUrl.trim()} className="mt-1 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                  <Send className="w-4 h-4" /> {isPrivileged ? "Apply Link" : "Submit Suggestion"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ─── Edit Modal ─── */}
      {showEdit && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowEdit(false)} className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-4">Edit Artist</h2>
            <form onSubmit={saveEdit} className="flex flex-col gap-3">
              <input required placeholder="Artist name" value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
              <textarea placeholder="Bio (optional)" value={editBio} onChange={(e) => setEditBio(e.target.value)} rows={3} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
              <div className="text-xs font-bold uppercase text-[var(--muted-foreground)] mt-2">Platform Links</div>
              {editLinks.map((link, index) => (
                <div key={`${link.platform}-${index}`} className="flex gap-2">
                  <select value={link.platform} onChange={(e) => setEditLinks((prev) => prev.map((cl, ci) => ci === index ? { ...cl, platform: e.target.value } : cl))} className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none w-32">
                    {Object.entries(PLATFORM_META).map(([p, m]) => <option key={p} value={p}>{m.label}</option>)}
                  </select>
                  <input required placeholder="URL" value={link.url} onChange={(e) => setEditLinks((prev) => prev.map((cl, ci) => ci === index ? { ...cl, url: e.target.value } : cl))} className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none flex-1 focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                  {editLinks.length > 1 && (
                    <button type="button" onClick={() => setEditLinks((prev) => prev.filter((_, ci) => ci !== index))} className="text-[var(--muted-foreground)] hover:text-red-400 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setEditLinks((prev) => [...prev, { platform: "YOUTUBE", url: "", handle: "" }])} className="text-[var(--accent)] text-sm font-bold flex items-center gap-1 hover:underline w-max">
                <Plus className="w-4 h-4" /> Add another link
              </button>
              <button type="submit" disabled={savingEdit} className="mt-2 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {savingEdit ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
