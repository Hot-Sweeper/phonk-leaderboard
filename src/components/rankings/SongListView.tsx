"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import { useDetailPanel } from "@/lib/detail-panel";
import { Skeleton } from "@/components/Skeleton";
import { fetchJsonWithSessionCache } from "@/lib/client-cache";
import { isValidPreviewUrl, toPreviewProxyUrl } from "@/lib/preview";
import { claimAudio } from "@/lib/global-audio";
import RankingBadgeChip from "@/components/rankings/RankingBadgeChip";
import { getSongRankingBadges } from "@/lib/ranking-badges";
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
  createdAt: string;
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

function formatTrendPercent(percent: number) {
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

const NEW_RELEASE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

function isRecentRelease(releaseDate: string | null | undefined) {
  if (!releaseDate) return false;
  const parsed = Date.parse(releaseDate);
  if (Number.isNaN(parsed)) return false;
  const age = Date.now() - parsed;
  return age >= 0 && age <= NEW_RELEASE_WINDOW_MS;
}

function isFreshTrendEntry(track: Track, mode: LeaderboardMode) {
  return mode !== "popularity"
    && track.metricValue > 0
    && track.metricValue === track.popularity
    && track.trendPercent === 0;
}

function hasNewBadge(track: Track) {
  return isRecentRelease(track.releaseDate);
}

function getTrendSubtext(track: Track, mode: LeaderboardMode) {
  if (isFreshTrendEntry(track, mode)) return "Freshly tracked";
  if (!track.hasTrendData) return hasNewBadge(track) ? "NEW" : "Waiting for history";
  const sign = track.trendPercent > 0 ? "+" : "";
  return `${sign}${track.trendPercent.toFixed(2)}% vs ${formatPopularity(track.popularity)}`;
}

function hasVisibleTrendMetric(track: Track, mode: LeaderboardMode) {
  return track.hasTrendData || isFreshTrendEntry(track, mode);
}

function getMetricHeaderLabel(mode: LeaderboardMode, valueMode: "absolute" | "relative") {
  switch (mode) {
    case "day": return valueMode === "relative" ? "24H %" : "24H Hype";
    case "week": return valueMode === "relative" ? "7D %" : "7D Hype";
    case "month": return valueMode === "relative" ? "30D %" : "30D Hype";
    default: return "Popularity";
  }
}

function getMetricText(track: Track, mode: LeaderboardMode, valueMode: "absolute" | "relative") {
  if (mode === "popularity") return formatPopularity(track.popularity);
  if (isFreshTrendEntry(track, mode)) return valueMode === "relative" ? "--" : formatTrendDelta(track.metricValue);
  if (!track.hasTrendData) return "--";
  return valueMode === "relative" ? formatTrendPercent(track.trendPercent) : formatTrendDelta(track.metricValue);
}

function getMetricSubtext(track: Track, mode: LeaderboardMode, valueMode: "absolute" | "relative") {
  if (mode === "popularity") return null;
  if (valueMode === "relative") {
    if (isFreshTrendEntry(track, mode)) return formatTrendDelta(track.metricValue);
    if (!track.hasTrendData) return hasNewBadge(track) ? "NEW" : "Waiting for history";
    return `${track.metricValue > 0 ? "+" : track.metricValue < 0 ? "-" : ""}${formatPopularity(Math.abs(track.metricValue))}`;
  }
  return getTrendSubtext(track, mode);
}

function getMetricTextClass(track: Track, mode: LeaderboardMode, valueMode: "absolute" | "relative") {
  if (mode === "popularity") return popularityColor(track.popularity);
  if (isFreshTrendEntry(track, mode)) return "text-amber-300";
  if (!track.hasTrendData) return "text-[var(--muted-foreground)]";
  const displayValue = valueMode === "relative" ? track.trendPercent : track.metricValue;
  if (displayValue > 0) return "text-green-400";
  if (displayValue < 0) return "text-rose-400";
  return "text-[var(--muted-foreground)]";
}

function getMetricBarClass(track: Track, mode: LeaderboardMode, valueMode: "absolute" | "relative") {
  if (mode === "popularity") return popularityBar(track.popularity);
  if (isFreshTrendEntry(track, mode)) return "bg-amber-400";
  const displayValue = valueMode === "relative" ? track.trendPercent : track.metricValue;
  if (!track.hasTrendData || displayValue === 0) return "bg-zinc-600";
  return displayValue > 0 ? "bg-green-500" : "bg-rose-500";
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

function PodiumTrackCard({ track, rank, isPlaying, onTogglePreview, showOriginalVersion, mode, valueMode, onOpenSong, onOpenArtist }: {
  track: Track; rank: number; isPlaying: boolean; onTogglePreview: (id: string, url: string, deezerId?: string | null) => void; showOriginalVersion: boolean; mode: LeaderboardMode; valueMode: "absolute" | "relative"; onOpenSong: (track: Track) => void; onOpenArtist: (id: string) => void;
}) {
  const isFirst = rank === 1;
  const artists = getTrackArtists(track);
  const versionLabel = getVersionLabel(track.primaryVersion, showOriginalVersion);
  const badges = getSongRankingBadges({
    createdAt: track.createdAt,
    releaseDate: track.releaseDate,
    popularity: track.popularity,
    metricValue: track.metricValue,
    trendPercent: track.trendPercent,
    hasTrendData: track.hasTrendData || isFreshTrendEntry(track, mode),
    showCollectingData: mode === "popularity",
  });

  const theme = {
    1: { 
      height: "h-[220px] md:h-[260px]",
      fadeStop: "90%",
      baseGradient: "from-yellow-500/30 via-yellow-700/12 to-yellow-900/5",
      topGradient: "from-yellow-400/35 to-yellow-600/12",
      rimColor: "border-yellow-400/70",
      insetGlow: "shadow-[0_0_50px_rgba(234,179,8,0.35)_inset]",
      artRing: "ring-yellow-400/80",
      artGlow: "shadow-[0_0_60px_rgba(234,179,8,0.4)] group-hover:shadow-[0_0_80px_rgba(234,179,8,0.6)]",
      accentHex: "234, 179, 8",
      numberColor: "text-yellow-500/[0.18]",
      artSize: "w-36 h-36 md:w-52 md:h-52",
      titleSize: "text-base md:text-xl",
      scoreSize: "text-2xl md:text-4xl",
      numberSize: "text-[100px] md:text-[160px]"
    },
    2: { 
      height: "h-[160px] md:h-[190px]",
      fadeStop: "80%",
      baseGradient: "from-zinc-300/25 via-zinc-500/8 to-zinc-700/3",
      topGradient: "from-zinc-200/30 to-zinc-400/10",
      rimColor: "border-zinc-300/70",
      insetGlow: "shadow-[0_0_50px_rgba(212,212,216,0.25)_inset]",
      artRing: "ring-zinc-300/80",
      artGlow: "shadow-[0_0_50px_rgba(212,212,216,0.3)] group-hover:shadow-[0_0_70px_rgba(212,212,216,0.5)]",
      accentHex: "212, 212, 216",
      numberColor: "text-zinc-400/[0.15]",
      artSize: "w-28 h-28 md:w-40 md:h-40",
      titleSize: "text-sm md:text-lg",
      scoreSize: "text-xl md:text-3xl",
      numberSize: "text-[80px] md:text-[130px]"
    },
    3: { 
      height: "h-[140px] md:h-[160px]",
      fadeStop: "75%",
      baseGradient: "from-amber-600/25 via-amber-800/8 to-amber-900/3",
      topGradient: "from-amber-500/30 to-amber-700/10",
      rimColor: "border-amber-500/70",
      insetGlow: "shadow-[0_0_50px_rgba(217,119,6,0.3)_inset]",
      artRing: "ring-amber-500/80",
      artGlow: "shadow-[0_0_50px_rgba(217,119,6,0.3)] group-hover:shadow-[0_0_70px_rgba(217,119,6,0.5)]",
      accentHex: "217, 119, 6",
      numberColor: "text-amber-600/[0.15]",
      artSize: "w-28 h-28 md:w-40 md:h-40",
      titleSize: "text-sm md:text-lg",
      scoreSize: "text-xl md:text-3xl",
      numberSize: "text-[80px] md:text-[130px]"
    }
  }[rank as 1 | 2 | 3];

  return (
    <div className={`w-full flex-1 flex flex-col items-center justify-end h-full relative group ${isFirst ? "z-20" : "z-10"}`}>
      <style>{`
        .audio-bounce.is-playing {
          transform: translateY(calc(var(--amplitude, 0) * -20px)) scale(calc(1 + (var(--amplitude, 0) * 0.05)));
          transition: transform 0.05s linear;
        }
        .audio-glow.is-playing {
          box-shadow: 0 0 calc(40px + (var(--amplitude, 0) * 80px)) calc(var(--amplitude, 0) * 15px) rgba(${theme?.accentHex}, 0.6);
        }
      `}</style>
      
      {/* Background Aura */}
      <div className={`absolute top-1/4 left-1/2 -translate-x-1/2 w-[150%] h-[120%] max-h-[300px] rounded-full blur-[100px] opacity-10 md:opacity-[0.15] pointer-events-none transition-opacity duration-700 group-hover:opacity-20`} style={{ backgroundColor: `rgb(${theme.accentHex})` }} />

      {/* Floating Artwork + Title (Bounces with Audio) */}
      <div className={`relative z-30 flex flex-col items-center transition-transform duration-500 audio-bounce ${isPlaying ? 'is-playing' : 'group-hover:-translate-y-3'}`}>
         <button type="button" onClick={() => onOpenSong(track)} className="flex flex-col items-center cursor-pointer">
           {/* Artwork */}
           <div className={`relative ${theme.artSize} rounded-2xl overflow-hidden ring-[3px] ring-offset-2 ring-offset-[var(--background)] ${theme.artRing} ${theme.artGlow} transition-all duration-300 audio-glow z-20 mb-3`}>
             {track.albumImageUrl ? (
               <Image src={track.albumImageUrl} alt={track.name} fill className="object-cover" sizes="(max-width: 768px) 128px, 192px" />
             ) : (
               <div className="w-full h-full bg-zinc-900/80 flex items-center justify-center backdrop-blur-sm"><Music className="w-12 h-12 text-zinc-500" /></div>
             )}
           </div>
           {/* Title above the podium */}
           <h3 className={`font-black text-white leading-tight line-clamp-2 text-center drop-shadow-md mb-1 ${theme.titleSize}`}>{track.name}</h3>
         </button>
         <p className="text-[10px] md:text-xs text-white/60 font-medium line-clamp-1 text-center mb-1">
           {artists.map((a, i) => (
             <span key={a.key}>
               {i > 0 && ", "}
               {a.external ? (
                 <a href={a.href} target="_blank" rel="noopener noreferrer" className="hover:text-white/80 transition-colors">{a.name}</a>
               ) : (
                 <button type="button" onClick={() => onOpenArtist(a.key)} className="hover:text-white/90 transition-colors cursor-pointer">{a.name}</button>
               )}
             </span>
           ))}
         </p>
         {badges.length > 0 && (
           <div className="mb-2 flex max-w-[18rem] flex-wrap items-center justify-center gap-1.5">
             {badges.map((badge) => <RankingBadgeChip key={badge.kind} badge={badge} />)}
           </div>
         )}
         {versionLabel && <span className="text-[8px] md:text-[9px] uppercase font-bold px-1.5 py-0.5 bg-white/10 border border-white/20 rounded text-white/80 mb-3">{versionLabel}</span>}
         {!versionLabel && <div className="mb-3" />}
      </div>

      {/* 2.5D Podium Base */}
      <div className="relative w-full flex flex-col items-center z-0">
        
        {/* Top Glass Surface */}
        <div className={`absolute top-0 -translate-y-1/2 w-[94%] md:w-[96%] h-[20px] md:h-[28px] bg-gradient-to-b ${theme.topGradient} rounded-[100%] border-t-[2px] border-b border-x ${theme.rimColor} ${theme.insetGlow} z-20 flex items-center justify-center backdrop-blur-xl shadow-2xl`}>
           <div className="w-[55%] h-[35%] rounded-[100%] bg-white/[0.06] border border-white/10 mix-blend-overlay" />
        </div>

        {/* Extruded Base Column */}
        <div 
          className={`w-[92%] md:w-[96%] ${theme.height} bg-gradient-to-b ${theme.baseGradient} relative overflow-hidden flex flex-col items-center justify-center z-10 border-x border-white/[0.08] group-hover:brightness-125 transition-all duration-500`}
          style={{ 
            backgroundImage: `radial-gradient(circle at center, rgba(255,255,255,0.12) 1px, transparent 1px)`,
            backgroundSize: `10px 10px`,
            WebkitMaskImage: `linear-gradient(to bottom, black 0%, black ${theme.fadeStop}, transparent 100%)`,
            maskImage: `linear-gradient(to bottom, black 0%, black ${theme.fadeStop}, transparent 100%)`
          }}
        >
          {/* Giant Rank Number - positioned in upper portion of column */}
          <div className={`absolute inset-x-0 top-0 bottom-0 flex items-start justify-center pt-2 md:pt-3 select-none pointer-events-none ${theme.numberColor}`}>
            <span className={`font-black italic ${theme.numberSize} leading-none tracking-tighter`}
                  style={{ textShadow: `0 0 40px rgba(${theme.accentHex}, 0.5), 0 0 80px rgba(${theme.accentHex}, 0.2)`, WebkitTextStroke: `1px rgba(${theme.accentHex}, 0.08)` }}>
              {rank}
            </span>
          </div>

          {/* Light streaks */}
          <div className="absolute inset-y-0 left-[15%] w-6 md:w-10 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mix-blend-overlay skew-x-12" />
          <div className="absolute inset-y-0 right-[20%] w-3 md:w-5 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent mix-blend-overlay -skew-x-12" />

          {/* Play + Score stacked in center */}
          <div className="relative z-30 flex flex-col items-center space-y-2">
              {isValidPreviewUrl(track.previewUrl) && (
                  <button 
                    onClick={() => onTogglePreview(track.id, track.previewUrl!, track.deezerId)} 
                    className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl ${isPlaying ? `text-black scale-110 ring-4 ring-white/20` : 'bg-black/50 border border-white/20 text-white hover:bg-white hover:text-black hover:scale-105'}`}
                    style={isPlaying ? { backgroundColor: `rgb(${theme.accentHex})`, boxShadow: `0 0 30px rgba(${theme.accentHex}, 0.6)` } : {}}
                  >
                      {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
                  </button>
              )}
              <span className={`font-black ${theme.scoreSize} tracking-tighter`} style={{ color: `rgb(${theme.accentHex})`, textShadow: `0 0 25px rgba(${theme.accentHex}, 0.4)` }}>
                    {getMetricText(track, mode, valueMode)}
              </span>
                {mode !== "popularity" && (
                  <span className="text-[8px] md:text-[9px] text-white/50 uppercase font-bold tracking-widest">
                      {getMetricSubtext(track, mode, valueMode)}
                  </span>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface SongListViewProps {
  mode: LeaderboardMode;
  search: string;
  collapseVersions: boolean;
  sortOrder?: "desc" | "asc" | "abs";
  valueMode?: "absolute" | "relative";
}

export default function SongListView({ mode, search, collapseVersions, sortOrder = "desc", valueMode = "absolute" }: SongListViewProps) {
  const { openArtist, openSong } = useDetailPanel();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingPodium, setLoadingPodium] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMode = useRef(mode);
  const prevSearch = useRef(search);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const stopCurrentAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.removeAttribute("src");
    audioRef.current.load();
    setPlayingTrackId(null);
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    document.documentElement.style.setProperty('--amplitude', '0');
  }, []);

  // Sync search prop with debounce
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const fetchTracks = useCallback(async (skip: number, searchQuery: string, append: boolean, groupedVersions: boolean, trackMode: LeaderboardMode, trendSortOrder: "desc" | "asc" | "abs", trendValueMode: "absolute" | "relative") => {
    if (append) {
      setLoadingMore(true);
      try {
        const params = new URLSearchParams({ skip: String(skip), take: "50" });
        if (searchQuery) params.set("search", searchQuery);
        params.set("collapseVersions", groupedVersions ? "true" : "false");
        params.set("mode", trackMode);
        params.set("sort", trendSortOrder);
        params.set("valueMode", trendValueMode);
        const qs = params.toString();
        const data = await fetchJsonWithSessionCache<{ tracks: Track[]; totalCount: number }>(
          `rank:songs:more:${qs}`,
          `/api/songs?${qs}`,
          300_000
        ).catch(() => null);
        if (data) {
          setTracks(prev => [...prev, ...data.tracks]);
          setTotalCount(data.totalCount);
        }
      } finally {
        setLoadingMore(false);
      }
      return;
    }

    // Progressive: fetch podium (top 3) first, then the full batch
    setLoadingPodium(true);
    setLoadingList(true);
    try {
      const podiumParams = new URLSearchParams({ skip: "0", take: "3" });
      if (searchQuery) podiumParams.set("search", searchQuery);
      podiumParams.set("collapseVersions", groupedVersions ? "true" : "false");
      podiumParams.set("mode", trackMode);
      podiumParams.set("sort", trendSortOrder);
      podiumParams.set("valueMode", trendValueMode);
      const podiumQs = podiumParams.toString();
      const podiumData = await fetchJsonWithSessionCache<{ tracks: Track[]; totalCount: number }>(
        `rank:songs:podium:${podiumQs}`,
        `/api/songs?${podiumQs}`,
        300_000
      ).catch(() => null);
      if (podiumData) {
        setTracks(podiumData.tracks);
        setTotalCount(podiumData.totalCount);
      }
      setLoadingPodium(false);

      const params = new URLSearchParams({ skip: "0", take: "50" });
      if (searchQuery) params.set("search", searchQuery);
      params.set("collapseVersions", groupedVersions ? "true" : "false");
      params.set("mode", trackMode);
      params.set("sort", trendSortOrder);
      params.set("valueMode", trendValueMode);
      const qs = params.toString();
      const data = await fetchJsonWithSessionCache<{ tracks: Track[]; totalCount: number }>(
        `rank:songs:list:${qs}`,
        `/api/songs?${qs}`,
        300_000
      ).catch(() => null);
      if (data) {
        setTracks(data.tracks);
        setTotalCount(data.totalCount);
      }
    } finally {
      setLoadingPodium(false);
      setLoadingList(false);
    }
  }, []);

  // Reload when mode/search/collapse/sortOrder changes
  useEffect(() => {
    fetchTracks(0, debouncedSearch, false, collapseVersions, mode, sortOrder, valueMode);
  }, [collapseVersions, debouncedSearch, fetchTracks, mode, sortOrder, valueMode]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    return () => {
      stopCurrentAudio();
      if (audioCtxRef.current?.state !== "closed") {
        audioCtxRef.current?.close().catch(() => {});
      }
    };
  }, [stopCurrentAudio]);

  // Auto-load more when sentinel is visible
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loadingMore && !loadingList && tracks.length < totalCount) loadMoreRef.current(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [tracks.length, totalCount, loadingMore, loadingList]);

  async function togglePreview(trackId: string, previewUrl: string, deezerId?: string | null) {
    if (playingTrackId === trackId) { stopCurrentAudio(); return; }
    if (!isValidPreviewUrl(previewUrl)) { stopCurrentAudio(); return; }
    stopCurrentAudio();
    
    // We expect the <audio> element to be rendered in the DOM
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.volume = 0.5;
    audio.src = toPreviewProxyUrl(previewUrl, deezerId);
    
    // Setup Audio Context if not initialized
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContextClass();
      analyserRef.current = audioCtxRef.current.createAnalyser();
      analyserRef.current.fftSize = 64; // Small size = Fast response for bass/kick
      sourceRef.current = audioCtxRef.current.createMediaElementSource(audio);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtxRef.current.destination);
    }
    
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    
    audio.onended = () => stopCurrentAudio();
    audio.onerror = () => stopCurrentAudio();
    audio.onpause = () => { setPlayingTrackId(null); };
    
    try { 
      claimAudio(audio);
      await audio.play(); 
      setPlayingTrackId(trackId); 
      
      const dataArray = new Uint8Array(analyserRef.current!.frequencyBinCount);
      const updateAmplitude = () => {
        if (!analyserRef.current || audio.paused) {
           document.documentElement.style.setProperty('--amplitude', '0');
           return;
        }
        analyserRef.current.getByteFrequencyData(dataArray);
        
        // Grab the lowest frequencies for a nice punchy bass reaction
        let sum = 0;
        for (let i = 0; i < 4; i++) sum += dataArray[i];
        let val = Math.max(0, (sum / 4) - 40) / 180; // Trim floor, normalize
        val = Math.pow(Math.min(1, val), 2); // Exaggerate peaks
        
        document.documentElement.style.setProperty('--amplitude', val.toFixed(3));
        rafIdRef.current = requestAnimationFrame(updateAmplitude);
      };
      
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(updateAmplitude);

    } catch (e) { 
      console.error("Audio play failed:", e);
      stopCurrentAudio(); 
    }
  }

  const loadMoreRef = useRef(() => {});

  function loadMore() {
    fetchTracks(tracks.length, debouncedSearch, true, collapseVersions, mode, sortOrder, valueMode);
  }
  loadMoreRef.current = loadMore;

  const showPodium = !debouncedSearch && tracks.length >= 3;
  const podiumTracks = showPodium ? tracks.slice(0, 3) : [];
  const tableTracks = showPodium ? tracks.slice(3) : tracks;
  const hasTrendData = tracks.some((t) => t.hasTrendData);
  const maxTrendMetric = tracks.reduce((max, t) => Math.max(max, Math.abs(valueMode === "relative" ? t.trendPercent : t.metricValue)), 0);

  if (loadingPodium) return <SongsSkeleton />;

  return (
    <>
      <audio ref={audioRef} crossOrigin="anonymous" preload="none" className="hidden" />

      {/* Podium */}
      {podiumTracks.length === 3 && (
        <div className="flex flex-row items-end justify-center h-[560px] md:h-[660px] gap-2 md:gap-5 mb-16 px-2 md:px-0">
          <PodiumTrackCard track={podiumTracks[1]} rank={2} isPlaying={playingTrackId === podiumTracks[1].id} onTogglePreview={togglePreview} showOriginalVersion={collapseVersions} mode={mode} valueMode={valueMode} onOpenSong={(track) => openSong(track.id, track)} onOpenArtist={openArtist} />
          <PodiumTrackCard track={podiumTracks[0]} rank={1} isPlaying={playingTrackId === podiumTracks[0].id} onTogglePreview={togglePreview} showOriginalVersion={collapseVersions} mode={mode} valueMode={valueMode} onOpenSong={(track) => openSong(track.id, track)} onOpenArtist={openArtist} />
          <PodiumTrackCard track={podiumTracks[2]} rank={3} isPlaying={playingTrackId === podiumTracks[2].id} onTogglePreview={togglePreview} showOriginalVersion={collapseVersions} mode={mode} valueMode={valueMode} onOpenSong={(track) => openSong(track.id, track)} onOpenArtist={openArtist} />
        </div>
      )}

      {/* Trend notice */}
      {mode !== "popularity" && !hasTrendData && tracks.length > 0 && (
        <div className="mb-6 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/50 px-4 py-3 text-sm text-[var(--muted-foreground)]">
          Hype rankings need at least two song snapshots across the selected period. The data will start filling in after song updates keep running.
        </div>
      )}

      {/* Table header */}
      {loadingList ? (
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
      ) : (
      <>
      <div className="hidden md:grid md:grid-cols-[2rem_3rem_minmax(0,1fr)_5rem_3rem] lg:grid-cols-[2rem_3rem_minmax(0,1.25fr)_6rem_6.5rem_3.5rem_5rem_3rem] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] border-b border-[var(--muted)]">
        <span /><span>#</span><span>Title</span>
        <span className="hidden lg:block">Version</span>
        <span className="hidden lg:block text-right">Released</span>
        <span className="hidden lg:block text-right"><Clock className="w-3 h-3 inline" /></span>
        <span className="text-right">{getMetricHeaderLabel(mode, valueMode)}</span>
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
            const badges = getSongRankingBadges({
              createdAt: track.createdAt,
              releaseDate: track.releaseDate,
              popularity: track.popularity,
              metricValue: track.metricValue,
              trendPercent: track.trendPercent,
              hasTrendData: track.hasTrendData || isFreshTrendEntry(track, mode),
              showCollectingData: mode === "popularity",
            });
            const metricBarWidth = mode === "popularity"
              ? normalizePopularity(track.popularity)
              : maxTrendMetric > 0 && hasVisibleTrendMetric(track, mode) ? Math.max(8, (Math.abs(valueMode === "relative" ? track.trendPercent : track.metricValue) / maxTrendMetric) * 100) : 0;

            return (
              <div key={track.id} className="group grid grid-cols-[2rem_3rem_1fr_4rem] md:grid-cols-[2rem_3rem_minmax(0,1fr)_5rem_3rem] lg:grid-cols-[2rem_3rem_minmax(0,1.25fr)_6rem_6.5rem_3.5rem_5rem_3rem] gap-3 px-4 md:px-5 py-3 items-center border-b border-[var(--muted)]/40 hover:bg-[var(--secondary)]/60 transition-colors">
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
                    <div className="flex items-start gap-1.5">
                      <button type="button" onClick={() => openSong(track.id, track)} className="min-w-0 flex-1 font-bold text-sm text-left leading-tight whitespace-normal line-clamp-2 hover:text-[var(--accent)] transition-colors cursor-pointer">{track.name}</button>
                      {track.explicit && <span className="shrink-0 text-[9px] font-bold bg-zinc-700 text-zinc-300 px-1 py-px rounded">E</span>}
                    </div>
                    <div className="mt-0.5 text-xs leading-relaxed line-clamp-2">
                      {artists.map((artist, idx) => (
                        <span key={artist.key}>
                          {idx > 0 && <span className="text-[var(--muted-foreground)]">, </span>}
                          {artist.external ? <a href={artist.href} target="_blank" rel="noopener noreferrer" className={artistTextClass(true)}>{artist.name}</a> : <button onClick={() => openArtist(artist.key)} className={`${artistTextClass()} cursor-pointer`}>{artist.name}</button>}
                        </span>
                      ))}
                    </div>
                    {badges.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {badges.map((badge) => <RankingBadgeChip key={badge.kind} badge={badge} />)}
                      </div>
                    )}
                    <div className="lg:hidden text-[11px] text-[var(--muted-foreground)] opacity-60 truncate mt-1">
                      {versionLabel && <>{versionLabel}<span className="mx-1.5">&bull;</span></>}
                      {track.releaseDate ?? "Unknown date"}
                    </div>
                  </div>
                </div>

                <span className="hidden lg:block text-xs text-[var(--muted-foreground)] truncate font-medium">{versionLabel ?? "-"}</span>
                <span className="hidden lg:flex items-center justify-end gap-1 text-xs text-[var(--muted-foreground)] tabular-nums">
                  <CalendarDays className="w-3 h-3 opacity-50" />{track.releaseDate ?? "--"}
                </span>
                <span className="hidden lg:block text-xs text-[var(--muted-foreground)] text-right tabular-nums">{formatDuration(track.durationMs)}</span>

                {/* Metric */}
                <div className="flex flex-col items-end gap-0.5">
                  <span className={`text-xs font-bold tabular-nums ${getMetricTextClass(track, mode, valueMode)}`}>{getMetricText(track, mode, valueMode)}</span>
                  {mode !== "popularity" && <span className="text-[10px] text-[var(--muted-foreground)] tabular-nums">{getMetricSubtext(track, mode, valueMode)}</span>}
                  <div className="w-12 h-1 rounded-full bg-[var(--muted)] overflow-hidden">
                    <div className={`h-full rounded-full ${getMetricBarClass(track, mode, valueMode)}`} style={{ width: `${metricBarWidth}%` }} />
                  </div>
                </div>

                {/* External link */}
                <div className="hidden md:flex justify-center">
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
      </>
      )}

      {/* Load more sentinel */}
      {tracks.length < totalCount && (
        <div ref={sentinelRef} className="flex justify-center py-8">
          {loadingMore && (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading more...
            </div>
          )}
        </div>
      )}

      {/* Scroll to top */}
      {showScrollTop && (
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} title="Scroll to top" className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center shadow-lg transition-all">
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </>
  );
}
