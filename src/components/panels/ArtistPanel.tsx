"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Image from "next/image";
import { Skeleton } from "@/components/Skeleton";
import { clearSessionCacheByPrefix, fetchJsonWithSessionCache } from "@/lib/client-cache";
import { toPreviewProxyUrl } from "@/lib/preview";
import { claimAudio } from "@/lib/global-audio";
import {
  Star,
  ExternalLink,
  User,
  Trophy,
  ArrowUpRight,
  ArrowDownRight,
  Play,
  Pause,
  Music,
  X,
  TrendingUp,
  Link2,
  Check,
} from "lucide-react";
import { useDetailPanel } from "@/lib/detail-panel";

/* ── helpers ── */
function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDur(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ── types ── */
type ArtistSnap = { monthlyListeners: number; followerCount: number; youtubeSubscribers: number; tiktokFollowers: number; instagramFollowers: number; createdAt: string };
type ArtistLink = { id: string; platform: string; url: string; handle: string | null; followerCount: number; monthlyListeners: number };
type Artist = { id: string; name: string; imageUrl: string | null; bannerUrl: string | null; bio: string | null; genres: string[]; spotifyPopularity: number; watchlistCount: number; links: ArtistLink[] };
type Track = { id: string; name: string; displayName?: string; albumImageUrl: string | null; previewUrl: string | null; deezerUrl?: string | null; deezerId?: string | null; spotifyUrl: string | null; durationMs: number; popularity: number; explicit: boolean; primaryVersion?: string; featuredArtists: string[]; recentGrowth?: number | null };
type RankData = { currentRank: number | null; previousRank: number | null; rankChange: number; podiumStreak: { current: number; best: number } };
type ChartPeriod = "week" | "month" | "year";
type ChartMetric = "listeners" | "followers" | "youtube" | "tiktok";
type ChartPoint = { value: number; date: string };

/* ── platform SVG icons ── */
function SpotifyIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>;
}
function YouTubeIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>;
}
function TikTokIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>;
}
function InstagramIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <svg className={className} style={style} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 1 0 0-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 1 1-2.882 0 1.441 1.441 0 0 1 2.882 0z"/></svg>;
}

type PlatInfo = { Icon: React.FC<{ className?: string; style?: React.CSSProperties }>; color: string; label: string; metric: string };
const PLAT: Record<string, PlatInfo> = {
  SPOTIFY:   { Icon: SpotifyIcon,   color: "#1DB954", label: "Spotify",   metric: "listeners" },
  YOUTUBE:   { Icon: YouTubeIcon,   color: "#FF0000", label: "YouTube",   metric: "subscribers" },
  TIKTOK:    { Icon: TikTokIcon,    color: "#00f2ea", label: "TikTok",    metric: "followers" },
  INSTAGRAM: { Icon: InstagramIcon, color: "#E4405F", label: "Instagram", metric: "followers" },
};

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function CopyLinkButton({ artistName }: { artistName: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/${slugify(artistName)}`;
    try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={copy}
      title="Copy shareable link"
      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-white/40 hover:text-white hover:border-white/30 hover:bg-white/10 transition-all text-[10px] font-bold shrink-0"
    >
      {copied ? <><Check className="w-3 h-3 text-green-400" /> Copied</> : <><Link2 className="w-3 h-3" /> Share</>}
    </button>
  );
}

/* ── famous card with cover-art play/pause ── */
function FamousCard({ track, onOpen }: { track: Track; onOpen: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  async function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { try { claimAudio(a); await a.play(); setPlaying(true); } catch { setPlaying(false); } }
  }
  const hasPreview = !!track.previewUrl;
  return (
    <div className="group text-left">
      {hasPreview && <audio ref={audioRef} src={toPreviewProxyUrl(track.previewUrl!, track.deezerId)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} preload="none" />}
      <div className="relative aspect-square rounded-lg overflow-hidden cursor-pointer" onClick={hasPreview ? togglePlay : onOpen}>
        {track.albumImageUrl ? (
          <Image src={track.albumImageUrl} alt="" fill className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-white/[0.05] flex items-center justify-center"><Music className="w-6 h-6 text-white/20" /></div>
        )}
        <div className={`absolute inset-0 transition-all ${playing ? "bg-black/40" : "bg-black/0 group-hover:bg-black/40"}`} />
        {hasPreview && (
          <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${playing ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${playing ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]" : "bg-black/60 backdrop-blur-sm text-white/80 border border-white/20"}`}>
              {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
            </div>
          </div>
        )}
      </div>
      <button onClick={onOpen} className="mt-1.5 px-0.5 w-full text-left cursor-pointer">
        <div className="text-[11px] font-bold truncate leading-snug group-hover:text-[var(--accent)] transition-colors">{track.displayName ?? track.name}</div>
        <div className="text-[9px] text-white/25 tabular-nums">{fmtDur(track.durationMs)}</div>
      </button>
    </div>
  );
}

/* ── mini player ── */
function MiniPlayer({ url, deezerId }: { url: string; deezerId?: string | null }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  async function toggle() {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { try { claimAudio(a); await a.play(); setPlaying(true); } catch { setPlaying(false); } }
  }
  return (
    <>
      <audio ref={audioRef} src={toPreviewProxyUrl(url, deezerId)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} preload="none" />
      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); void toggle(); }} className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${playing ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "bg-white/[0.08] text-white/40 hover:bg-white/15 hover:text-white"}`} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5 ml-0.5" />}
      </button>
    </>
  );
}

/* ── spark chart ── */
function SparkChart({ id, metric, points, height = 80 }: { id: string; metric: string; points: ChartPoint[]; height?: number }) {
  if (points.length < 2) return <div className="flex items-center justify-center opacity-40" style={{ height }}><span className="text-[11px] text-[var(--muted-foreground)]">Not enough data yet</span></div>;
  const W = 400, H = height, pad = { t: 6, r: 2, b: 20, l: 2 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const vals = points.map(p => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = hi - lo || 1;
  const nx = (i: number) => pad.l + (i / (points.length - 1)) * cw;
  const ny = (v: number) => pad.t + ch - ((v - lo) / rng) * ch;
  const pts: [number, number][] = points.map((p, i) => [nx(i), ny(p.value)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const cx_ = pts[i-1][0] + (pts[i][0]-pts[i-1][0])*0.5; d += ` C${cx_},${pts[i-1][1]} ${cx_},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`; }
  const lx = pts[pts.length-1][0], ly = pts[pts.length-1][1];
  const area = `${d} L${lx},${H-pad.b} L${pad.l},${H-pad.b}Z`;
  const up = vals[vals.length-1] >= vals[0]; const col = up ? "#4ade80" : "#f87171";
  const gid = `ac-${id.slice(-6)}-${metric}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.25" /><stop offset="100%" stopColor={col} stopOpacity="0.02" /></linearGradient></defs>
      <line x1={pad.l} y1={pad.t+ch*0.5} x2={W-pad.r} y2={pad.t+ch*0.5} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      <path d={area} fill={`url(#${gid})`} /><path d={d} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={col} />
      <text x={pad.l+2} y={H-3} fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="system-ui">{fmtDate(points[0].date)}</text>
      <text x={W-pad.r-2} y={H-3} fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="system-ui" textAnchor="end">{fmtDate(points[points.length-1].date)}</text>
    </svg>
  );
}

/* ═══════════════ MAIN ═══════════════ */
export default function ArtistPanel({ id }: { id: string }) {
  const { data: session } = useSession();
  const { close, openSong } = useDetailPanel();
  const [artist, setArtist] = useState<Artist | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWatched, setIsWatched] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [rankData, setRankData] = useState<RankData | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [spotifyPopularity, setSpotifyPopularity] = useState(0);
  const [snapshots, setSnapshots] = useState<ArtistSnap[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
  const [chartMetric, setChartMetric] = useState<ChartMetric>("listeners");

  useEffect(() => {
    setLoading(true); setArtist(null); setTracks([]); setRankData(null); setSnapshots([]);
    Promise.all([
      fetchJsonWithSessionCache<Artist>(`artist:${id}:profile`, `/api/artists/${id}`, 60_000).catch(() => null),
      fetchJsonWithSessionCache<string[]>("watchlist:ids", "/api/watchlist", 30_000).catch(() => [] as string[]),
      fetchJsonWithSessionCache<RankData>(`artist:${id}:rank`, `/api/artists/${id}/rank`, 60_000).catch(() => null),
      fetchJsonWithSessionCache<{ tracks?: Track[]; genres?: string[]; spotifyPopularity?: number }>(`artist:${id}:tracks:v2`, `/api/artists/${id}/tracks?view=panel-v2`, 15_000, { cache: "no-store" }).catch(() => null),
    ]).then(([a, wl, r, td]) => {
      if (a) setArtist(a);
      if (Array.isArray(wl)) setIsWatched(wl.includes(id));
      if (r) setRankData(r);
      if (td) { setTracks(td.tracks ?? []); setGenres(td.genres ?? []); setSpotifyPopularity(td.spotifyPopularity ?? 0); }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    fetchJsonWithSessionCache<ArtistSnap[]>(`artist:${id}:snaps:${chartPeriod}`, `/api/artists/${id}/snapshots?period=${chartPeriod}`, 120_000).then(d => setSnapshots(d ?? [])).catch(() => {});
  }, [id, chartPeriod]);

  const toggleWatchlist = useCallback(async () => {
    if (!session) { void signIn("google"); return; }
    if (toggling) return;
    setToggling(true);
    try {
      const res = await fetch("/api/watchlist", { method: isWatched ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ artistId: id }) });
      if (res.ok && artist) {
        setIsWatched(!isWatched);
        setArtist({ ...artist, watchlistCount: artist.watchlistCount + (isWatched ? -1 : 1) });
        clearSessionCacheByPrefix("watchlist:"); clearSessionCacheByPrefix(`artist:${id}:`);
        window.dispatchEvent(new Event("watchlist-changed"));
      }
    } finally { setToggling(false); }
  }, [session, toggling, isWatched, id, artist]);

  /* ── loading skeleton ── */
  if (loading) return (
    <div className="flex flex-col h-full bg-[#08080c]">
      <div className="relative h-32 bg-[var(--secondary)]"><Skeleton className="absolute inset-0" /><div className="absolute bottom-0 inset-x-0 h-20 bg-gradient-to-t from-[#08080c] to-transparent" /></div>
      <div className="flex flex-col items-center -mt-14 z-10 px-5">
        <Skeleton className="w-28 h-28 rounded-full" />
        <Skeleton className="h-5 w-36 mt-3" />
        <Skeleton className="h-3 w-24 mt-2" />
      </div>
      <div className="p-5 space-y-3 mt-3"><Skeleton className="h-10 rounded-xl" /><Skeleton className="h-32 rounded-2xl" /></div>
    </div>
  );

  if (!artist) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3"><User className="w-10 h-10 text-[var(--muted-foreground)]" /><p className="text-sm font-bold">Artist not found</p></div>
  );

  /* ── derived data ── */
  const spotifyLink = artist.links.find(l => l.platform === "SPOTIFY");
  const metricKey: Record<ChartMetric, keyof ArtistSnap> = { listeners: "monthlyListeners", followers: "followerCount", youtube: "youtubeSubscribers", tiktok: "tiktokFollowers" };
  const chartPoints: ChartPoint[] = snapshots.map(s => ({ value: s[metricKey[chartMetric]] as number, date: s.createdAt }));
  const currentVal = chartPoints.length > 0 ? chartPoints[chartPoints.length-1].value : 0;
  const changePercent = chartPoints.length >= 2 ? ((chartPoints[chartPoints.length-1].value - chartPoints[0].value) / Math.max(1, chartPoints[0].value)) * 100 : null;
  const metricLabels: Record<ChartMetric, string> = { listeners: "Listeners", followers: "Followers", youtube: "YouTube", tiktok: "TikTok" };
  const hasYT = artist.links.some(l => l.platform === "YOUTUBE"), hasTT = artist.links.some(l => l.platform === "TIKTOK");
  // Spotify % change is based on monthly listeners (not followers) — omit "followers" tab
  const metricOpts: ChartMetric[] = ["listeners", ...(hasYT ? ["youtube" as ChartMetric] : []), ...(hasTT ? ["tiktok" as ChartMetric] : [])];
  const periodOpts: { key: ChartPeriod; label: string }[] = [{ key: "week", label: "7d" }, { key: "month", label: "30d" }, { key: "year", label: "1y" }];

  /* platform pills data */
  const pills: { url: string; Icon: React.FC<{ className?: string; style?: React.CSSProperties }>; color: string; label: string; value: string; metric: string }[] = [];
  for (const link of artist.links) {
    const p = PLAT[link.platform];
    if (!p) continue;
    const val = link.platform === "SPOTIFY" ? link.monthlyListeners : link.followerCount;
    pills.push({ url: link.url, Icon: p.Icon, color: p.color, label: p.label, value: val > 0 ? fmt(val) : "", metric: p.metric });
  }

  const hasBanner = !!artist.bannerUrl;

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-[#08080c]">

      {/* ── HERO ── */}
      <div className="relative shrink-0">
        {/* Banner / blurred backdrop */}
        <div className={`relative overflow-hidden ${hasBanner ? "h-28" : "h-32"}`}>
          {hasBanner ? (
            <Image src={artist.bannerUrl!} alt="" fill className="object-cover" />
          ) : artist.imageUrl ? (
            <Image src={artist.imageUrl} alt="" fill className="object-cover scale-[2] blur-3xl opacity-40" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/25 via-transparent to-transparent" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/25 to-[#08080c]" />
          {/* Close + watchlist in header */}
          <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
            <button onClick={toggleWatchlist} disabled={toggling} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold backdrop-blur-sm transition-all ${isWatched ? "bg-[var(--accent)]/90 text-white shadow-[0_0_16px_var(--accent-glow)]" : "bg-black/50 border border-white/15 text-white/60 hover:text-white hover:border-white/30"}`} aria-label={isWatched ? "Unwatch" : "Watch"}>
              {toggling ? <span className="w-3 h-3 border-[1.5px] border-current border-t-transparent rounded-full animate-spin" /> : <Star className={`w-3 h-3 ${isWatched ? "fill-current" : ""}`} />}
              {isWatched ? "Watching" : "Watch"} <span className="tabular-nums opacity-70">{artist.watchlistCount}</span>
            </button>
            <button onClick={close} className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors" aria-label="Close"><X className="w-3.5 h-3.5" /></button>
          </div>
        </div>

        {/* Centered avatar + name */}
        <div className="relative z-10 flex flex-col items-center -mt-14 px-5">
          <div className="relative">
            {artist.imageUrl ? (
              <Image src={artist.imageUrl} alt={artist.name} width={112} height={112} className="w-28 h-28 rounded-full object-cover ring-4 ring-[#08080c] shadow-[0_12px_50px_rgba(0,0,0,0.7)]" />
            ) : (
              <div className="w-28 h-28 rounded-full bg-[var(--secondary)] ring-4 ring-[#08080c] flex items-center justify-center shadow-2xl"><User className="w-10 h-10 text-[var(--muted-foreground)]" /></div>
            )}
            {rankData?.currentRank != null && (
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-[var(--accent)] text-white text-[10px] font-black shadow-lg shadow-[var(--accent)]/40 tabular-nums whitespace-nowrap">#{rankData.currentRank}</div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <h2 className="text-[22px] font-black tracking-tight text-center leading-tight text-white">{artist.name}</h2>
            <CopyLinkButton artistName={artist.name} />
          </div>

          {/* Rank change + streak */}
          {(rankData?.rankChange !== 0 && rankData?.rankChange != null || rankData?.podiumStreak?.current != null && rankData.podiumStreak.current > 0) && (
            <div className="flex items-center gap-2.5 mt-1">
              {rankData?.rankChange !== 0 && rankData?.rankChange != null && (
                <span className={`text-[11px] font-bold flex items-center gap-0.5 ${rankData.rankChange > 0 ? "text-green-400" : "text-red-400"}`}>
                  {rankData.rankChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{Math.abs(rankData.rankChange)}
                </span>
              )}
              {rankData?.podiumStreak?.current != null && rankData.podiumStreak.current > 0 && (
                <span className="text-[11px] font-black text-amber-400 flex items-center gap-0.5"><Trophy className="w-3 h-3" />{rankData.podiumStreak.current}d</span>
              )}
            </div>
          )}

          {/* Genre tags */}
          {genres.length > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center mt-2">
              {genres.slice(0, 4).map(g => (
                <span key={g} className="px-2.5 py-0.5 rounded-full bg-white/[0.06] text-[9px] font-bold uppercase tracking-wider text-white/35">{g}</span>
              ))}
            </div>
          )}
        </div>

        <div className="h-3" />
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="relative z-10 flex-1 overflow-y-auto px-4 space-y-3 pb-6">

        {/* PLATFORM PILLS */}
        {pills.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {pills.map(p => (
              <a key={p.label} href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.07] hover:bg-white/[0.1] hover:border-white/[0.15] transition-all group">
                <p.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: p.color }} />
                {p.value ? (
                  <span className="text-[11px] font-bold text-white/70 group-hover:text-white transition-colors tabular-nums">{p.value} <span className="text-white/30 font-medium">{p.metric}</span></span>
                ) : (
                  <span className="text-[11px] font-bold text-white/40 group-hover:text-white/60 transition-colors">{p.label}</span>
                )}
              </a>
            ))}
          </div>
        )}

        {/* CHART */}
        <div className="rounded-2xl border border-[var(--muted)]/40 bg-white/[0.02] overflow-hidden">
          <div className="flex items-start justify-between px-4 pt-3 pb-0.5">
            <div>
              <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)] mb-0.5 flex items-center gap-1"><TrendingUp className="w-2.5 h-2.5" />{metricLabels[chartMetric]}</div>
              <div className="text-2xl font-black leading-none tabular-nums">{currentVal > 0 ? fmt(currentVal) : "\u2014"}</div>
              {changePercent !== null && <div className={`text-[10px] font-bold mt-0.5 flex items-center gap-0.5 ${changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>{changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{changePercent >= 0 ? "+" : ""}{changePercent.toFixed(1)}%</div>}
            </div>
            <div className="flex gap-0.5">
              {periodOpts.map(p => <button key={p.key} onClick={() => setChartPeriod(p.key)} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${chartPeriod === p.key ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>{p.label}</button>)}
            </div>
          </div>
          <div className="flex gap-1 px-4 pb-0.5">
            {metricOpts.map(m => <button key={m} onClick={() => setChartMetric(m)} className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider transition-all ${chartMetric === m ? "bg-white/10 text-white" : "text-[var(--muted-foreground)] hover:text-white/60"}`}>{metricLabels[m]}</button>)}
          </div>
          <div className="px-1 pb-1"><SparkChart id={id} metric={chartMetric} points={chartPoints} height={80} /></div>
        </div>

        {/* BIO */}
        {artist.bio && <p className="text-[11px] text-white/30 leading-relaxed line-clamp-3 px-1">{artist.bio}</p>}

        {/* FAMOUS FOR */}
        {tracks.length > 0 && (() => {
          const famousThree = tracks.slice(0, 3);
          return (
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)] mb-2.5">Famous for</h3>
              <div className={`grid gap-2 ${famousThree.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {famousThree.map((track) => (
                  <div key={track.id} className="relative">
                    <FamousCard track={track} onOpen={() => openSong(track.id, track)} />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* MORE SONGS */}
        {tracks.length > 3 && (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)] mb-2">More songs</h3>
            <div className="rounded-xl border border-[var(--muted)]/30 bg-white/[0.02] divide-y divide-white/[0.04] overflow-hidden">
              {tracks.slice(3, 10).map((track, i) => (
                <button key={track.id} onClick={() => openSong(track.id, track)} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/[0.04] transition-colors text-left">
                  {track.previewUrl ? <MiniPlayer url={track.previewUrl} deezerId={track.deezerId} /> : <div className="w-7 h-7" />}
                  <span className="text-[10px] font-bold text-white/25 w-4 text-center tabular-nums shrink-0">{i + 4}</span>
                  {track.albumImageUrl ? (
                    <Image src={track.albumImageUrl} alt="" width={28} height={28} className="w-7 h-7 rounded shrink-0 object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-white/5 flex items-center justify-center shrink-0"><Music className="w-3 h-3 text-white/20" /></div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold truncate leading-snug">{track.displayName ?? track.name}</div>
                    <div className="text-[10px] text-white/20 tabular-nums">{fmtDur(track.durationMs)}</div>
                  </div>
                  {(track.deezerUrl ?? track.spotifyUrl) && (
                    <a href={(track.deezerUrl ?? track.spotifyUrl)!} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-white/15 hover:text-[var(--accent)] transition-colors shrink-0"><ExternalLink className="w-3 h-3" /></a>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
