"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Skeleton } from "@/components/Skeleton";
import { isValidPreviewUrl, toPreviewProxyUrl } from "@/lib/preview";
import {
  Music,
  ExternalLink,
  Loader2,
  Clock,
  ChevronUp,
  Play,
  Pause,
  Trophy,
  CalendarDays,
} from "lucide-react";

type Contributor = { id: string; name: string; imageUrl: string | null };
type DisplayArtist = { key: string; name: string; href: string; external: boolean };
type LeaderboardMode = "popularity" | "day" | "week" | "month";

type Track = {
  id: string;
  spotifyId: string | null;
  deezerId: string | null;
  name: string;
  albumName: string | null;
  albumImageUrl: string | null;
  durationMs: number;
  popularity: number;
  explicit: boolean;
  releaseDate: string | null;
  spotifyUrl: string | null;
  deezerUrl: string | null;
  previewUrl: string | null;
  bpm: number | null;
  gain: number | null;
  rank: number;
  versions: string[];
  primaryVersion: string;
  metricValue: number;
  trendDelta: number;
  trendPercent: number;
  hasTrendData: boolean;
  leaderboardMode: LeaderboardMode;
  artists?: DisplayArtist[];
  featuredArtists: string[];
  contributorIds: string[];
  contributors: Contributor[];
  artist: { id: string; name: string; imageUrl: string | null };
};

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function popularityColor(p: number) {
  const normalized = p > 100 ? p / 10000 : p;
  if (normalized >= 70) return "text-green-400";
  if (normalized >= 50) return "text-yellow-400";
  if (normalized >= 30) return "text-orange-400";
  return "text-[var(--muted-foreground)]";
}

function popularityBar(p: number) {
  const normalized = p > 100 ? p / 10000 : p;
  if (normalized >= 70) return "bg-green-500";
  if (normalized >= 50) return "bg-yellow-500";
  if (normalized >= 30) return "bg-orange-500";
  return "bg-zinc-600";
}

function normalizePopularity(p: number) {
  return p > 100 ? Math.min(100, p / 10000) : p;
}

function formatPopularity(p: number) {
  if (p > 100) {
    if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M`;
    if (p >= 1_000) return `${Math.round(p / 1_000)}K`;
    return String(p);
  }
  return String(p);
}

function formatTrendDelta(delta: number) {
  if (delta === 0) return "0";
  const sign = delta > 0 ? "+" : "-";
  return `${sign}${formatPopularity(Math.abs(delta))}`;
}

function getMetricHeaderLabel(mode: LeaderboardMode) {
  switch (mode) {
    case "day": return "24H Hype";
    case "week": return "7D Hype";
    case "month": return "30D Hype";
    default: return "Popularity";
  }
}

function getMetricText(track: Track, mode: LeaderboardMode) {
  if (mode === "popularity") return formatPopularity(track.popularity);
  if (!track.hasTrendData) return "--";
  return formatTrendDelta(track.metricValue);
}

function getMetricSubtext(track: Track, mode: LeaderboardMode) {
  if (mode === "popularity") return null;
  if (!track.hasTrendData) return "Waiting for history";
  const sign = track.trendPercent > 0 ? "+" : "";
  return `${sign}${track.trendPercent.toFixed(2)}% vs ${formatPopularity(track.popularity)}`;
}

function getMetricTextClass(track: Track, mode: LeaderboardMode) {
  if (mode === "popularity") return popularityColor(track.popularity);
  if (!track.hasTrendData) return "text-[var(--muted-foreground)]";
  if (track.metricValue > 0) return "text-green-400";
  if (track.metricValue < 0) return "text-rose-400";
  return "text-[var(--muted-foreground)]";
}

function getMetricBarClass(track: Track, mode: LeaderboardMode) {
  if (mode === "popularity") return popularityBar(track.popularity);
  if (!track.hasTrendData || track.metricValue === 0) return "bg-zinc-600";
  return track.metricValue > 0 ? "bg-green-500" : "bg-rose-500";
}

function getVersionLabel(primaryVersion: string | null | undefined, showOriginal = true) {
  const label = primaryVersion?.trim() || "Original";
  if (!showOriginal && label.toLowerCase() === "original") return null;
  return label;
}

function normalizeArtistName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
}

function getTrackArtists(track: Track) {
  if (track.artists && track.artists.length > 0) return track.artists;
  const seen = new Set<string>();
  const artists: DisplayArtist[] = [];
  const push = (a: DisplayArtist) => { const n = normalizeArtistName(a.name); if (seen.has(n)) return; seen.add(n); artists.push(a); };
  push({ key: track.artist.id, name: track.artist.name, href: `/artist/${track.artist.id}`, external: false });
  for (const c of track.contributors) push({ key: c.id, name: c.name, href: `/artist/${c.id}`, external: false });
  for (const f of track.featuredArtists) push({ key: `search:${f}`, name: f, href: `https://open.spotify.com/search/${encodeURIComponent(f)}`, external: true });
  return artists;
}

function artistTextClass(external = false) {
  return external ? "text-white/40 hover:text-white/70 transition-colors" : "text-[var(--accent)] hover:text-white transition-colors";
}

function SongsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`rounded-[28px] border border-[var(--muted)] bg-[var(--secondary)]/60 p-5 ${i === 1 ? "md:-translate-y-6" : ""}`}>
            <div className="flex flex-col items-center gap-3">
              <Skeleton className={`rounded-2xl ${i === 1 ? "h-44 w-44" : "h-36 w-36"}`} />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
        ))}
      </div>
      <div className="border border-[var(--muted)] rounded-2xl overflow-hidden bg-[var(--secondary)]/35">
        <div className="divide-y divide-[var(--muted)]/40">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[2rem_3rem_1fr_4rem] gap-3 px-4 py-3 items-center">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-6 w-6" />
              <div className="flex items-center gap-3 min-w-0">
                <Skeleton className="h-11 w-11 rounded-lg" />
                <div className="space-y-2 flex-1"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="h-3 w-32 max-w-full" /></div>
              </div>
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PodiumTrackCard({ track, rank, isPlaying, onTogglePreview, showOriginalVersion, mode }: {
  track: Track; rank: number; isPlaying: boolean; onTogglePreview: (id: string, url: string, deezerId?: string | null) => void; showOriginalVersion: boolean; mode: LeaderboardMode;
}) {
  const accent = rank === 1 ? "text-yellow-400 border-yellow-500/30" : rank === 2 ? "text-zinc-300 border-zinc-500/30" : "text-amber-600 border-amber-700/30";
  const artists = getTrackArtists(track);
  const versionLabel = getVersionLabel(track.primaryVersion, showOriginalVersion);
  return (
    <div className={`rounded-[28px] overflow-hidden border bg-[var(--secondary)]/70 relative ${rank === 1 ? "md:-translate-y-6" : ""} ${accent}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
      <div className="p-5 relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2"><Trophy className="w-4 h-4" /><span className="text-xs font-black uppercase tracking-[0.2em]">#{rank}</span></div>
          {isValidPreviewUrl(track.previewUrl) && (
            <button onClick={() => onTogglePreview(track.id, track.previewUrl!, track.deezerId)} className="w-10 h-10 rounded-full text-white flex items-center justify-center transition-colors bg-black/35 hover:bg-green-600" title={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          )}
        </div>
        <div className="flex flex-col items-center text-center">
          {track.albumImageUrl ? (
            <Image src={track.albumImageUrl} alt={track.name} width={rank === 1 ? 180 : 140} height={rank === 1 ? 180 : 140} className="rounded-2xl object-cover shadow-2xl mb-4" />
          ) : (
            <div className="rounded-2xl bg-[var(--muted)] flex items-center justify-center mb-4" style={{ width: rank === 1 ? 180 : 140, height: rank === 1 ? 180 : 140 }}><Music className="w-8 h-8 text-[var(--muted-foreground)]" /></div>
          )}
          <div className="font-black text-lg text-white leading-tight line-clamp-2">{track.name}</div>
          <div className="text-sm mt-1 max-w-full leading-snug text-center">
            {artists.map((artist, i) => (
              <span key={artist.key}>
                {i > 0 && <span className="text-[var(--muted-foreground)]">, </span>}
                {artist.external ? <a href={artist.href} target="_blank" rel="noopener noreferrer" className={artistTextClass(true)}>{artist.name}</a> : <Link href={artist.href} className={artistTextClass()}>{artist.name}</Link>}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mt-3 text-[11px] font-bold">
            {track.releaseDate && <span className="text-[var(--muted-foreground)]">{track.releaseDate}</span>}
            {versionLabel && <span className="text-white/70">{versionLabel}</span>}
          </div>
          <div className={`mt-4 text-xl font-black ${getMetricTextClass(track, mode)}`}>{getMetricText(track, mode)}</div>
          {mode !== "popularity" && <div className="mt-1 text-[11px] font-medium text-[var(--muted-foreground)]">{getMetricSubtext(track, mode)}</div>}
        </div>
      </div>
    </div>
  );
}

interface SongListViewProps {
  mode: LeaderboardMode;
  search: string;
}

export default function SongListView({ mode, search }: SongListViewProps) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [collapseVersions, setCollapseVersions] = useState(true);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMode = useRef(mode);
  const prevSearch = useRef(search);

  const stopCurrentAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current.load();
    audioRef.current = null;
    setPlayingTrackId(null);
  }, []);

  // Sync search prop with debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const fetchTracks = useCallback(async (skip: number, searchQuery: string, append: boolean, groupedVersions: boolean, trackMode: LeaderboardMode) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ skip: String(skip), take: "50" });
      if (searchQuery) params.set("search", searchQuery);
      params.set("collapseVersions", groupedVersions ? "true" : "false");
      params.set("mode", trackMode);
      const res = await fetch(`/api/songs?${params}`);
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

  // Reload when mode/search/collapse changes
  useEffect(() => {
    fetchTracks(0, debouncedSearch, false, collapseVersions, mode);
  }, [collapseVersions, debouncedSearch, fetchTracks, mode]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    return () => stopCurrentAudio();
  }, [stopCurrentAudio]);

  async function togglePreview(trackId: string, previewUrl: string, deezerId?: string | null) {
    if (playingTrackId === trackId) { stopCurrentAudio(); return; }
    if (!isValidPreviewUrl(previewUrl)) { stopCurrentAudio(); return; }
    stopCurrentAudio();
    const audio = new Audio();
    audio.volume = 0.5;
    audio.preload = "none";
    audio.src = toPreviewProxyUrl(previewUrl, deezerId);
    audio.onended = () => { if (audioRef.current === audio) stopCurrentAudio(); };
    audio.onerror = () => { if (audioRef.current === audio) stopCurrentAudio(); };
    audioRef.current = audio;
    try { await audio.play(); setPlayingTrackId(trackId); } catch { if (audioRef.current === audio) stopCurrentAudio(); }
  }

  function loadMore() {
    fetchTracks(tracks.length, debouncedSearch, true, collapseVersions, mode);
  }

  const showPodium = !debouncedSearch && tracks.length >= 3;
  const podiumTracks = showPodium ? tracks.slice(0, 3) : [];
  const tableTracks = showPodium ? tracks.slice(3) : tracks;
  const hasTrendData = tracks.some((t) => t.hasTrendData);
  const maxTrendMetric = tracks.reduce((max, t) => Math.max(max, Math.abs(t.metricValue)), 0);

  if (loading) return <SongsSkeleton />;

  return (
    <>
      {/* Group versions toggle */}
      <div className="mb-6">
        <button
          type="button"
          onClick={() => setCollapseVersions((c) => !c)}
          className="w-full flex items-center justify-between rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/80 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--secondary)]"
          aria-pressed={collapseVersions}
        >
          <div className="text-left">
            <div className="font-bold text-white">Group versions</div>
            <div className="text-[11px] text-[var(--muted-foreground)]">
              {collapseVersions
                ? mode === "popularity" ? "Highest-scoring version counts as the song" : "Highest-hype version counts as the song"
                : "Show every version as its own row"}
            </div>
          </div>
          <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${collapseVersions ? "bg-green-500" : "bg-[var(--muted)]"}`}>
            <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${collapseVersions ? "translate-x-5" : "translate-x-1"}`} />
          </span>
        </button>
      </div>

      {/* Podium */}
      {podiumTracks.length === 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 items-end">
          <PodiumTrackCard track={podiumTracks[1]} rank={2} isPlaying={playingTrackId === podiumTracks[1].id} onTogglePreview={togglePreview} showOriginalVersion={collapseVersions} mode={mode} />
          <PodiumTrackCard track={podiumTracks[0]} rank={1} isPlaying={playingTrackId === podiumTracks[0].id} onTogglePreview={togglePreview} showOriginalVersion={collapseVersions} mode={mode} />
          <PodiumTrackCard track={podiumTracks[2]} rank={3} isPlaying={playingTrackId === podiumTracks[2].id} onTogglePreview={togglePreview} showOriginalVersion={collapseVersions} mode={mode} />
        </div>
      )}

      {/* Trend notice */}
      {mode !== "popularity" && !hasTrendData && tracks.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/50 px-4 py-3 text-sm text-[var(--muted-foreground)]">
          Hype rankings need at least two song snapshots across the selected period. The data will start filling in after song updates keep running.
        </div>
      )}

      {/* Table header */}
      <div className="hidden md:grid grid-cols-[2rem_3rem_minmax(0,1fr)_8rem_8rem_4rem_4.5rem_3rem] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] border-b border-[var(--muted)]">
        <span /><span>#</span><span>Title</span><span>Version</span>
        <span className="text-right">Released</span>
        <span className="text-right"><Clock className="w-3 h-3 inline" /></span>
        <span className="text-right">{getMetricHeaderLabel(mode)}</span>
        <span />
      </div>

      {/* Empty */}
      {tracks.length === 0 && (
        <div className="text-center py-20">
          <Music className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--muted-foreground)] text-sm">
            {debouncedSearch ? "No songs found matching your search." : "No songs tracked yet."}
          </p>
        </div>
      )}

      {/* Track rows */}
      {tracks.length > 0 && (
        <div className="flex flex-col">
          {tableTracks.map((track, i) => {
            const rank = track.rank || i + (podiumTracks.length === 3 ? 4 : 1);
            const isPlaying = playingTrackId === track.id;
            const artists = getTrackArtists(track);
            const versionLabel = getVersionLabel(track.primaryVersion, collapseVersions);
            const metricBarWidth = mode === "popularity"
              ? normalizePopularity(track.popularity)
              : maxTrendMetric > 0 && track.hasTrendData ? Math.max(8, (Math.abs(track.metricValue) / maxTrendMetric) * 100) : 0;

            return (
              <div key={track.id} className="group grid grid-cols-[2rem_3rem_1fr_4rem] md:grid-cols-[2rem_3rem_minmax(0,1fr)_8rem_8rem_4rem_4.5rem_3rem] gap-3 px-4 md:px-5 py-3 items-center border-b border-[var(--muted)]/40 hover:bg-[var(--secondary)]/60 transition-colors">
                {/* Play */}
                <div className="flex justify-center">
                  {isValidPreviewUrl(track.previewUrl) ? (
                    <button onClick={() => togglePreview(track.id, track.previewUrl!, track.deezerId)} className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isPlaying ? "bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.4)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-green-600 hover:text-white"}`} title={isPlaying ? "Pause" : "Play 30s preview"}>
                      {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                    </button>
                  ) : <div className="w-7 h-7" />}
                </div>

                {/* Rank */}
                <span className="text-center font-black text-base tabular-nums text-[var(--muted-foreground)]">{rank}</span>

                {/* Title + Artist */}
                <div className="flex items-center gap-3 min-w-0">
                  {track.albumImageUrl ? (
                    <Image src={track.albumImageUrl} alt={track.albumName ?? ""} width={44} height={44} className="rounded-lg shrink-0 shadow-md" />
                  ) : (
                    <div className="w-11 h-11 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0"><Music className="w-4 h-4 text-[var(--muted-foreground)]" /></div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm truncate">{track.name}</span>
                      {track.explicit && <span className="shrink-0 text-[9px] font-bold bg-zinc-700 text-zinc-300 px-1 py-px rounded">E</span>}
                    </div>
                    <div className="text-xs leading-relaxed whitespace-normal break-words">
                      {artists.map((artist, idx) => (
                        <span key={artist.key}>
                          {idx > 0 && <span className="text-[var(--muted-foreground)]">, </span>}
                          {artist.external ? <a href={artist.href} target="_blank" rel="noopener noreferrer" className={artistTextClass(true)}>{artist.name}</a> : <Link href={artist.href} className={artistTextClass()}>{artist.name}</Link>}
                        </span>
                      ))}
                    </div>
                    <div className="md:hidden text-[11px] text-[var(--muted-foreground)] opacity-60 truncate mt-1">
                      {versionLabel && <>{versionLabel}<span className="mx-1.5">&bull;</span></>}
                      {track.releaseDate ?? "Unknown date"}
                    </div>
                  </div>
                </div>

                <span className="hidden md:block text-xs text-[var(--muted-foreground)] truncate font-medium">{versionLabel ?? "-"}</span>
                <span className="hidden md:flex items-center justify-end gap-1 text-xs text-[var(--muted-foreground)] tabular-nums">
                  <CalendarDays className="w-3 h-3 opacity-50" />{track.releaseDate ?? "--"}
                </span>
                <span className="hidden md:block text-xs text-[var(--muted-foreground)] text-right tabular-nums">{formatDuration(track.durationMs)}</span>

                {/* Metric */}
                <div className="flex flex-col items-end gap-0.5">
                  <span className={`text-xs font-bold tabular-nums ${getMetricTextClass(track, mode)}`}>{getMetricText(track, mode)}</span>
                  {mode !== "popularity" && <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">{getMetricSubtext(track, mode)}</span>}
                  <div className="w-12 h-1 rounded-full bg-[var(--muted)] overflow-hidden">
                    <div className={`h-full rounded-full ${getMetricBarClass(track, mode)}`} style={{ width: `${metricBarWidth}%` }} />
                  </div>
                </div>

                {/* External link */}
                <div className="hidden md:flex justify-end">
                  {(track.deezerUrl || track.spotifyUrl) && (
                    <a href={track.deezerUrl ?? track.spotifyUrl!} target="_blank" rel="noopener noreferrer" className="text-[var(--muted-foreground)] hover:text-green-400 transition-colors" title={track.deezerUrl ? "Open in Deezer" : "Open in Spotify"}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {tracks.length < totalCount && (
        <div className="flex justify-center py-8">
          <button onClick={loadMore} disabled={loadingMore} className="px-6 py-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-sm font-bold hover:bg-[var(--muted)] transition-all flex items-center gap-2 disabled:opacity-50">
            {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
            {loadingMore ? "Loading..." : `Load More (${tracks.length}/${totalCount})`}
          </button>
        </div>
      )}

      {/* Scroll to top */}
      {showScrollTop && (
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center shadow-lg transition-all">
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
