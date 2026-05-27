"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useDetailPanel } from "@/lib/detail-panel";
import { isValidPreviewUrl, toPreviewProxyUrl } from "@/lib/preview";
import { Skeleton } from "@/components/Skeleton";
import {
  Zap,
  TrendingUp,
  Music,
  Search,
  Loader2,
  Play,
  Pause,
  ExternalLink,
  ChevronDown,
} from "lucide-react";

type HypeMode = "hype-pop" | "hype-trend";
type TrendPeriod = "week" | "month";

type HypeTrack = {
  id: string;
  name: string;
  albumName: string | null;
  albumImageUrl: string | null;
  releaseDate: string | null;
  spotifyUrl: string | null;
  previewUrl: string | null;
  popularity: number;
  explicit: boolean;
  rank: number;
  metricValue: number;
  trendPercent: number;
  hasTrendData: boolean;
  artist: { id: string; name: string; imageUrl: string | null };
  contributors: { id: string; name: string; imageUrl: string | null }[];
  featuredArtists: string[];
};

const MODES: Array<{ key: HypeMode; label: string; description: string }> = [
  {
    key: "hype-pop",
    label: "Popularity",
    description: "Pure Spotify chart rank — age-neutral",
  },
  {
    key: "hype-trend",
    label: "Hype",
    description: "Newer tracks dominate, fast-movers get a velocity bonus",
  },
];

const PERIODS: Array<{ key: TrendPeriod; label: string }> = [
  { key: "week", label: "7D" },
  { key: "month", label: "30D" },
];

function getAgeBadge(releaseDate: string | null): { label: string; cls: string } | null {
  if (!releaseDate) return null;
  const days = (Date.now() - Date.parse(releaseDate)) / 86_400_000;
  if (days <= 14) return { label: "Fresh", cls: "bg-green-950/50 text-green-300 border-green-700/40" };
  if (days <= 30) return { label: "New", cls: "bg-emerald-950/40 text-emerald-400 border-emerald-800/40" };
  if (days <= 90) return { label: "Recent", cls: "bg-blue-950/40 text-blue-400 border-blue-800/40" };
  if (days <= 365) return { label: "Classic", cls: "bg-amber-950/40 text-amber-400 border-amber-800/40" };
  return { label: "Old", cls: "bg-zinc-900/30 text-zinc-500 border-zinc-700/30" };
}

function scoreColor(v: number) {
  if (v >= 70) return "text-green-400";
  if (v >= 45) return "text-yellow-400";
  if (v >= 20) return "text-orange-400";
  return "text-zinc-500";
}

function scoreBarColor(v: number) {
  if (v >= 70) return "bg-green-500";
  if (v >= 45) return "bg-yellow-500";
  if (v >= 20) return "bg-orange-500";
  return "bg-zinc-700";
}

function rankMedal(rank: number) {
  if (rank === 1) return "text-yellow-400";
  if (rank === 2) return "text-zinc-300";
  if (rank === 3) return "text-amber-600";
  return "text-zinc-600";
}

function normalizeArtistName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function getTrackArtists(track: HypeTrack) {
  const seen = new Set<string>();
  const artists: Array<{ key: string; name: string; href: string; external: boolean }> = [];
  const push = (a: { key: string; name: string; href: string; external: boolean }) => {
    const n = normalizeArtistName(a.name);
    if (seen.has(n)) return;
    seen.add(n);
    artists.push(a);
  };
  push({ key: track.artist.id, name: track.artist.name, href: `/artist/${track.artist.id}`, external: false });
  for (const c of track.contributors) {
    push({ key: c.id, name: c.name, href: `/artist/${c.id}`, external: false });
  }
  for (const fa of track.featuredArtists) {
    push({ key: `ext:${fa}`, name: fa, href: `https://open.spotify.com/search/${encodeURIComponent(fa)}`, external: true });
  }
  return artists;
}

function HypeSkeleton() {
  return (
    <div className="border border-[var(--muted)] rounded-2xl overflow-hidden bg-[var(--secondary)]/35">
      <div className="divide-y divide-[var(--muted)]/40">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <Skeleton className="h-5 w-5 shrink-0" />
            <Skeleton className="h-11 w-11 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2 min-w-0">
              <Skeleton className="h-4 w-48 max-w-full" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full hidden sm:block" />
            <Skeleton className="h-6 w-10 hidden md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HypePage() {
  const { openArtist, openSong } = useDetailPanel();
  const [mode, setMode] = useState<HypeMode>("hype-pop");
  const [period, setPeriod] = useState<TrendPeriod>("week");
  const [tracks, setTracks] = useState<HypeTrack[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current.load();
      audioRef.current = null;
    }
    setPlayingId(null);
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const fetchTracks = useCallback(async (
    hypeMode: HypeMode,
    trendPeriod: TrendPeriod,
    searchQ: string,
    skip: number,
    append: boolean,
  ) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const p = new URLSearchParams({ mode: hypeMode, skip: String(skip), take: "50" });
      if (hypeMode === "hype-trend") p.set("period", trendPeriod);
      if (searchQ) p.set("search", searchQ);
      const res = await fetch(`/api/songs?${p}`);
      if (res.ok) {
        const data = await res.json();
        setTracks(prev => append ? [...prev, ...data.tracks] : data.tracks);
        setTotalCount(data.totalCount);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchTracks(mode, period, debouncedSearch, 0, false);
  }, [mode, period, debouncedSearch, fetchTracks]);

  useEffect(() => () => stopAudio(), [stopAudio]);

  async function togglePreview(trackId: string, previewUrl: string) {
    if (playingId === trackId) { stopAudio(); return; }
    if (!isValidPreviewUrl(previewUrl)) { stopAudio(); return; }
    stopAudio();
    const audio = new Audio();
    audio.volume = 0.5;
    audio.preload = "none";
    audio.src = toPreviewProxyUrl(previewUrl);
    audio.onended = () => { if (audioRef.current === audio) stopAudio(); };
    audio.onerror = () => { if (audioRef.current === audio) stopAudio(); };
    audioRef.current = audio;
    try { await audio.play(); setPlayingId(trackId); } catch { if (audioRef.current === audio) stopAudio(); }
  }

  const currentMeta = MODES.find(m => m.key === mode)!;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 sm:px-6 md:p-12 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-5 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 mb-1">
              <Zap className="w-8 h-8 text-orange-400" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-orange-400">
                Hype Leaderboard
              </span>
            </h1>
            <p className="text-[var(--muted-foreground)] text-sm max-w-md">
              {loading
                ? "Loading tracks…"
                : totalCount > 0
                  ? `${totalCount} tracks — ${currentMeta.description}`
                  : debouncedSearch
                    ? "No tracks matched your search."
                    : "No tracks available yet."}
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2 shrink-0">
            {/* Mode tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-[var(--secondary)] border border-[var(--muted)]">
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                    mode === m.key
                      ? "bg-orange-500/20 text-orange-300 border border-orange-500/40"
                      : "text-[var(--muted-foreground)] hover:text-white"
                  }`}
                >
                  {m.key === "hype-pop" ? <TrendingUp className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                  {m.label}
                </button>
              ))}
            </div>

            {/* Period toggle (Hype mode only) */}
            {mode === "hype-trend" && (
              <div className="flex gap-1 p-1 rounded-xl bg-[var(--secondary)] border border-[var(--muted)]">
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    onClick={() => setPeriod(p.key)}
                    className={`flex-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      period === p.key
                        ? "bg-[var(--muted)] text-white"
                        : "text-[var(--muted-foreground)] hover:text-white"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
              <input
                type="text"
                placeholder="Search tracks, artists…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-orange-500/50 placeholder:text-zinc-500"
              />
            </div>
          </div>
        </div>

        {/* Mode info banner */}
        {!loading && mode === "hype-trend" && tracks.length > 0 && !tracks.some(t => t.hasTrendData) && (
          <div className="mb-5 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/50 px-4 py-3 text-sm text-[var(--muted-foreground)]">
            Velocity data needs at least two snapshots across the {period === "week" ? "7-day" : "30-day"} window. Scores will improve as snapshot history accumulates.
          </div>
        )}

        {/* Loading */}
        {loading && <HypeSkeleton />}

        {/* Empty */}
        {!loading && tracks.length === 0 && (
          <div className="text-center py-20">
            <Zap className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-3 opacity-30" />
            <p className="text-[var(--muted-foreground)] text-sm">
              {debouncedSearch ? "No tracks matched your search." : "No tracks tracked yet."}
            </p>
          </div>
        )}

        {/* Track list */}
        {!loading && tracks.length > 0 && (
          <div className="border border-[var(--muted)] rounded-2xl overflow-hidden bg-[var(--secondary)]/20">
            {/* Column header */}
            <div className="hidden md:grid grid-cols-[2rem_2.5rem_minmax(0,1fr)_7rem_6rem] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] border-b border-[var(--muted)]">
              <span />
              <span className="text-center">#</span>
              <span>Track</span>
              <span className="text-right">Age</span>
              <span className="text-right">{mode === "hype-pop" ? "Chart" : "Hype"}</span>
            </div>

            <div className="divide-y divide-[var(--muted)]/40">
              {tracks.map((track) => {
                const ageBadge = getAgeBadge(track.releaseDate);
                const isPlaying = playingId === track.id;
                const artists = getTrackArtists(track);
                const isVelocity = mode === "hype-trend" && track.hasTrendData && track.trendPercent >= 20;
                const score = track.metricValue;

                return (
                  <div
                    key={track.id}
                    className="group grid grid-cols-[2rem_2.5rem_1fr_4.5rem] md:grid-cols-[2rem_2.5rem_minmax(0,1fr)_7rem_6rem] gap-3 px-4 md:px-5 py-2.5 items-center hover:bg-[var(--secondary)]/60 transition-colors"
                  >
                    {/* Play button */}
                    <div className="flex justify-center">
                      {isValidPreviewUrl(track.previewUrl) ? (
                        <button
                          onClick={() => togglePreview(track.id, track.previewUrl!)}
                          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                            isPlaying
                              ? "bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.4)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-orange-600 hover:text-white"
                          }`}
                        >
                          {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                        </button>
                      ) : (
                        <div className="w-7 h-7" />
                      )}
                    </div>

                    {/* Rank */}
                    <span className={`text-center font-black text-sm tabular-nums ${rankMedal(track.rank)}`}>
                      {track.rank}
                    </span>

                    {/* Art + Title + Artist */}
                    <div className="flex items-center gap-3 min-w-0">
                      {track.albumImageUrl ? (
                        <Image
                          src={track.albumImageUrl}
                          alt={track.name}
                          width={44}
                          height={44}
                          className="rounded-lg object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0">
                          <Music className="w-4 h-4 text-[var(--muted-foreground)]" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => openSong(track.id, track)}
                          className="text-sm font-bold text-white hover:text-orange-300 transition-colors truncate block max-w-full text-left"
                        >
                          {track.name}
                          {track.explicit && <span className="ml-1.5 text-[10px] text-[var(--muted-foreground)] border border-[var(--muted)] px-1 rounded align-middle">E</span>}
                          {isVelocity && (
                            <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-orange-400 align-middle">
                              <Zap className="w-2.5 h-2.5" />
                              {track.trendPercent > 0 ? `+${Math.round(track.trendPercent)}%` : ""}
                            </span>
                          )}
                        </button>
                        <div className="flex items-center gap-1 flex-wrap mt-0.5">
                          {artists.map((artist, idx) => (
                            <span key={artist.key} className="text-xs">
                              {idx > 0 && <span className="text-zinc-600">, </span>}
                              {artist.external ? (
                                <a
                                  href={artist.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                >
                                  {artist.name}
                                </a>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openArtist(artist.key)}
                                  className="text-[var(--accent)] hover:text-white transition-colors"
                                >
                                  {artist.name}
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Age badge (desktop) */}
                    <div className="hidden md:flex justify-end items-center gap-1.5">
                      {ageBadge && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${ageBadge.cls}`}>
                          {ageBadge.label}
                        </span>
                      )}
                      {track.spotifyUrl && (
                        <a href={track.spotifyUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--muted-foreground)] hover:text-white transition-colors">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {/* Score (desktop) + mobile compact */}
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-sm font-black tabular-nums ${scoreColor(score)}`}>
                        {score}
                      </span>
                      <div className="w-full md:w-14 h-1 rounded-full bg-[var(--muted)] overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${scoreBarColor(score)}`}
                          style={{ width: `${Math.max(4, score)}%` }}
                        />
                      </div>
                      {/* Age badge mobile */}
                      <div className="md:hidden">
                        {ageBadge && (
                          <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${ageBadge.cls}`}>
                            {ageBadge.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Load more */}
            {tracks.length < totalCount && (
              <div className="flex justify-center py-4 border-t border-[var(--muted)]/40">
                <button
                  onClick={() => {
                    const p = new URLSearchParams({ mode, skip: String(tracks.length), take: "50" });
                    if (mode === "hype-trend") p.set("period", period);
                    if (debouncedSearch) p.set("search", debouncedSearch);
                    setLoadingMore(true);
                    fetch(`/api/songs?${p}`)
                      .then(r => r.json())
                      .then(data => {
                        setTracks(prev => [...prev, ...data.tracks]);
                      })
                      .finally(() => setLoadingMore(false));
                  }}
                  disabled={loadingMore}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-sm font-bold text-[var(--muted-foreground)] hover:text-white transition-all disabled:opacity-50"
                >
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronDown className="w-4 h-4" />}
                  {loadingMore ? "Loading…" : `Load more (${totalCount - tracks.length} remaining)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
