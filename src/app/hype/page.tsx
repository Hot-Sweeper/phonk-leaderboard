"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useDetailPanel } from "@/lib/detail-panel";
import { isValidPreviewUrl, toPreviewProxyUrl } from "@/lib/preview";
import {
  CalendarDays,
  Flame,
  Gauge,
  Loader2,
  Music,
  Pause,
  Play,
  Search,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";

const PAGE_SIZE = 50;

type HypeMode = "hype-pop" | "hype-trend";
type HypePeriod = "week" | "month";

type Contributor = {
  id: string;
  name: string;
  imageUrl: string | null;
};

type DisplayArtist = {
  key: string;
  name: string;
  href: string;
  external: boolean;
};

type Track = {
  id: string;
  spotifyId: string | null;
  name: string;
  albumName: string | null;
  albumImageUrl: string | null;
  durationMs: number;
  popularity: number;
  spotifyPopularity: number;
  explicit: boolean;
  releaseDate: string | null;
  spotifyUrl: string | null;
  previewUrl: string | null;
  rank: number;
  versions: string[];
  primaryVersion: string;
  metricValue: number;
  trendDelta: number;
  trendPercent: number;
  hasTrendData: boolean;
  isEmergingHype?: boolean;
  artists?: DisplayArtist[];
  featuredArtists: string[];
  contributors: Contributor[];
  artist: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
};

const MODES: Array<{ key: HypeMode; label: string; shortLabel: string; icon: typeof Gauge }> = [
  { key: "hype-pop", label: "Popularity", shortLabel: "Pop", icon: Gauge },
  { key: "hype-trend", label: "Hype", shortLabel: "Hype", icon: Flame },
];

const PERIODS: Array<{ key: HypePeriod; label: string }> = [
  { key: "week", label: "7D" },
  { key: "month", label: "30D" },
];

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getTrackArtists(track: Track) {
  if (track.artists && track.artists.length > 0) {
    return track.artists;
  }

  const seen = new Set<string>();
  const artists: DisplayArtist[] = [];

  const pushArtist = (artist: DisplayArtist) => {
    const normalized = normalizeName(artist.name);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    artists.push(artist);
  };

  pushArtist({
    key: track.artist.id,
    name: track.artist.name,
    href: `/artist/${track.artist.id}`,
    external: false,
  });

  for (const contributor of track.contributors) {
    pushArtist({
      key: contributor.id,
      name: contributor.name,
      href: `/artist/${contributor.id}`,
      external: false,
    });
  }

  for (const featuredArtist of track.featuredArtists) {
    pushArtist({
      key: `search:${featuredArtist}`,
      name: featuredArtist,
      href: `https://open.spotify.com/search/${encodeURIComponent(featuredArtist)}`,
      external: true,
    });
  }

  return artists;
}

function artistTextClass(external = false) {
  return external
    ? "text-white/40 hover:text-white/70 transition-colors"
    : "text-[var(--accent)] hover:text-white transition-colors";
}

function formatScore(value: number) {
  return String(Math.round(value));
}

function getAgeInDays(releaseDate: string | null) {
  if (!releaseDate) return null;
  const parsed = Date.parse(releaseDate);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((Date.now() - parsed) / 86_400_000));
}

function getAgeMeta(releaseDate: string | null) {
  const age = getAgeInDays(releaseDate);

  if (age == null) {
    return {
      label: "Unknown",
      sublabel: "No date",
      className: "border-[var(--muted)] text-[var(--muted-foreground)] bg-[var(--secondary)]",
    };
  }

  if (age <= 14) {
    return {
      label: "Fresh",
      sublabel: `${age}d old`,
      className: "border-green-500/40 text-green-300 bg-green-500/10",
    };
  }

  if (age <= 60) {
    return {
      label: "Rising",
      sublabel: `${age}d old`,
      className: "border-yellow-500/40 text-yellow-300 bg-yellow-500/10",
    };
  }

  if (age <= 180) {
    return {
      label: "Cooling",
      sublabel: `${age}d old`,
      className: "border-orange-500/40 text-orange-300 bg-orange-500/10",
    };
  }

  return {
    label: "Catalog",
    sublabel: `${Math.floor(age / 30)}mo old`,
    className: "border-[var(--muted)] text-[var(--muted-foreground)] bg-[var(--secondary)]",
  };
}

function getScoreMeta(track: Track, mode: HypeMode) {
  if (mode === "hype-pop") {
    const spotifyScore = track.spotifyPopularity > 0 ? track.spotifyPopularity : track.metricValue;
    return {
      label: "Spotify",
      value: formatScore(spotifyScore),
      sublabel: "chart score",
      className: spotifyScore >= 70 ? "text-green-300" : spotifyScore >= 50 ? "text-yellow-300" : "text-[var(--muted-foreground)]",
    };
  }

  return {
    label: "Hype",
    value: formatScore(track.metricValue),
    sublabel: track.hasTrendData ? `${track.trendPercent >= 0 ? "+" : ""}${track.trendPercent.toFixed(1)}%` : "age weighted",
    className: track.metricValue >= 70 ? "text-green-300" : track.metricValue >= 40 ? "text-yellow-300" : "text-[var(--muted-foreground)]",
  };
}

function formatVersion(primaryVersion: string | null | undefined) {
  const label = primaryVersion?.trim() || "Original";
  return label.toLowerCase() === "original" ? null : label;
}

function HypeSkeleton() {
  return (
    <div className="space-y-2 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/35 p-3">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[2rem_3rem_1fr_5rem] md:grid-cols-[2rem_3rem_minmax(0,1fr)_7rem_7rem_6rem] gap-3 px-2 py-3 items-center">
          <div className="h-7 w-7 rounded-full bg-[var(--muted)] animate-pulse" />
          <div className="h-4 w-7 rounded bg-[var(--muted)] animate-pulse" />
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-[var(--muted)] animate-pulse" />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="h-4 w-48 max-w-full rounded bg-[var(--muted)] animate-pulse" />
              <div className="h-3 w-32 max-w-full rounded bg-[var(--muted)] animate-pulse" />
            </div>
          </div>
          <div className="hidden md:block h-6 w-20 rounded-full bg-[var(--muted)] animate-pulse" />
          <div className="hidden md:block h-6 w-20 rounded-full bg-[var(--muted)] animate-pulse" />
          <div className="h-5 w-12 justify-self-end rounded bg-[var(--muted)] animate-pulse" />
        </div>
      ))}
    </div>
  );
}

export default function HypePage() {
  const { openArtist, openSong } = useDetailPanel();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [mode, setMode] = useState<HypeMode>("hype-trend");
  const [period, setPeriod] = useState<HypePeriod>("week");
  const [collapseVersions, setCollapseVersions] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopCurrentAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current.load();
    audioRef.current = null;
    setPlayingTrackId(null);
  }, []);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search]);

  const fetchTracks = useCallback(async (skip: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);

    try {
      const params = new URLSearchParams({
        skip: String(skip),
        take: String(PAGE_SIZE),
        collapseVersions: collapseVersions ? "true" : "false",
        mode,
      });

      if (mode === "hype-trend") params.set("period", period);
      if (debouncedSearch) params.set("search", debouncedSearch);

      const res = await fetch(`/api/songs?${params}`);
      if (!res.ok) return;

      const data = await res.json() as { tracks: Track[]; totalCount: number };
      setTracks((current) => append ? [...current, ...data.tracks] : data.tracks);
      setTotalCount(data.totalCount ?? 0);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [collapseVersions, debouncedSearch, mode, period]);

  useEffect(() => {
    fetchTracks(0, false);
  }, [fetchTracks]);

  useEffect(() => {
    return () => stopCurrentAudio();
  }, [stopCurrentAudio]);

  async function togglePreview(track: Track) {
    if (!isValidPreviewUrl(track.previewUrl)) return;

    if (playingTrackId === track.id) {
      stopCurrentAudio();
      return;
    }

    stopCurrentAudio();

    const audio = new Audio();
    audio.volume = 0.5;
    audio.preload = "none";
    audio.src = toPreviewProxyUrl(track.previewUrl!);
    audio.onended = () => {
      if (audioRef.current === audio) stopCurrentAudio();
    };
    audio.onerror = () => {
      if (audioRef.current === audio) stopCurrentAudio();
    };

    audioRef.current = audio;

    try {
      await audio.play();
      setPlayingTrackId(track.id);
    } catch {
      if (audioRef.current === audio) stopCurrentAudio();
    }
  }

  const hasTrendData = tracks.some((track) => track.hasTrendData);
  const summary = loading
    ? "Loading hype rankings..."
    : totalCount > 0
      ? mode === "hype-pop"
        ? `${totalCount} tracks ranked by pure Spotify chart strength`
        : `${totalCount} tracks ranked by freshness, Spotify strength, and ${period === "week" ? "7-day" : "30-day"} growth`
      : debouncedSearch
        ? "No tracks matched your search."
        : "No hype data available yet.";

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-6 md:px-8 md:py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-7">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 mb-1">
              <Flame className="w-8 h-8 text-[var(--accent)]" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
                Hype Leaderboard
              </span>
            </h1>
            <p className="text-sm md:text-base text-[var(--muted-foreground)] max-w-2xl">
              {summary}
            </p>
          </div>

          <div className="w-full lg:w-[34rem] space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((item) => {
                const Icon = item.icon;
                const active = mode === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setMode(item.key)}
                    className={`rounded-xl border px-3 py-2 text-sm font-black transition-colors flex items-center justify-center gap-2 ${active ? "border-[var(--accent)]/60 bg-[var(--accent)]/15 text-white" : "border-[var(--muted)] bg-[var(--secondary)]/80 text-[var(--muted-foreground)] hover:text-white"}`}
                    aria-pressed={active}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  placeholder="Search songs, artists, albums..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]/60 placeholder:text-zinc-500"
                />
              </div>

              {mode === "hype-trend" ? (
                <div className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--muted)] bg-[var(--secondary)] p-1">
                  {PERIODS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setPeriod(item.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-[0.16em] transition-colors ${period === item.key ? "bg-[var(--muted)] text-white" : "text-[var(--muted-foreground)] hover:text-white"}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setCollapseVersions((current) => !current)}
              className="w-full flex items-center justify-between rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/80 px-3 py-2.5 text-sm transition-colors hover:bg-[var(--secondary)]"
              aria-pressed={collapseVersions}
            >
              <div className="text-left">
                <div className="font-bold text-white">Group versions</div>
                <div className="text-[11px] text-[var(--muted-foreground)]">
                  {collapseVersions ? "Highest-scoring version represents the song" : "Every version appears as its own row"}
                </div>
              </div>
              <span className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${collapseVersions ? "bg-[var(--accent)]" : "bg-[var(--muted)]"}`}>
                <span className={`inline-block h-5 w-5 rounded-full bg-white transition-transform ${collapseVersions ? "translate-x-5" : "translate-x-1"}`} />
              </span>
            </button>
          </div>
        </div>

        {mode === "hype-trend" && !loading && !hasTrendData && tracks.length > 0 ? (
          <div className="mb-5 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/50 px-4 py-3 text-sm text-[var(--muted-foreground)] flex items-start gap-2">
            <Sparkles className="w-4 h-4 mt-0.5 text-[var(--accent)] shrink-0" />
            <span>Freshness and Spotify strength are active now. Velocity bonuses appear once enough song snapshots exist across the selected period.</span>
          </div>
        ) : null}

        <div className="hidden md:grid grid-cols-[2rem_3rem_minmax(0,1fr)_7rem_7rem_6rem] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] border-b border-[var(--muted)]">
          <span />
          <span>#</span>
          <span>Track</span>
          <span className="text-right">Age</span>
          <span className="text-right">Signal</span>
          <span className="text-right">Score</span>
        </div>

        {loading ? <HypeSkeleton /> : null}

        {!loading && tracks.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/35">
            <Music className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-3 opacity-40" />
            <p className="text-sm text-[var(--muted-foreground)]">
              {debouncedSearch ? "No tracks found for that search." : "No tracked songs available yet."}
            </p>
          </div>
        ) : null}

        {!loading ? (
          <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/25 overflow-hidden">
            {tracks.map((track, index) => {
              const rank = track.rank || index + 1;
              const artists = getTrackArtists(track);
              const ageMeta = getAgeMeta(track.releaseDate);
              const scoreMeta = getScoreMeta(track, mode);
              const versionLabel = formatVersion(track.primaryVersion);
              const isPlaying = playingTrackId === track.id;
              const hasVelocity = mode === "hype-trend" && track.hasTrendData && track.trendPercent >= 20;

              return (
                <div
                  key={track.id}
                  className="group grid grid-cols-[2rem_3rem_1fr_5rem] md:grid-cols-[2rem_3rem_minmax(0,1fr)_7rem_7rem_6rem] gap-3 px-4 md:px-5 py-3 items-center border-b border-[var(--muted)]/40 last:border-b-0 hover:bg-[var(--secondary)]/70 transition-colors"
                >
                  <div className="flex justify-center">
                    {isValidPreviewUrl(track.previewUrl) ? (
                      <button
                        type="button"
                        onClick={() => togglePreview(track)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isPlaying ? "bg-[var(--accent)] text-white shadow-[0_0_10px_var(--accent-glow)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-white"}`}
                        title={isPlaying ? "Pause preview" : "Play preview"}
                      >
                        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                      </button>
                    ) : (
                      <div className="w-7 h-7" />
                    )}
                  </div>

                  <span className="text-center font-black text-base tabular-nums text-[var(--muted-foreground)]">
                    {rank}
                  </span>

                  <div className="flex items-center gap-3 min-w-0">
                    {track.albumImageUrl ? (
                      <Image src={track.albumImageUrl} alt={track.albumName ?? track.name} width={48} height={48} className="w-12 h-12 rounded-lg object-cover shrink-0 shadow-md" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4 text-[var(--muted-foreground)]" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => openSong(track.id, track)}
                          className="font-bold text-sm truncate hover:text-[var(--accent)] transition-colors cursor-pointer text-left min-w-0"
                        >
                          {track.name}
                        </button>
                        {track.explicit ? (
                          <span className="shrink-0 text-[9px] font-bold bg-zinc-700 text-zinc-300 px-1 py-px rounded">E</span>
                        ) : null}
                        {hasVelocity ? (
                          <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-1.5 py-0.5 text-[10px] font-black text-green-300">
                            <Zap className="w-3 h-3" />
                            +{track.trendPercent.toFixed(0)}%
                          </span>
                        ) : null}
                      </div>

                      <div className="text-xs leading-relaxed whitespace-normal break-words">
                        {artists.map((artist, artistIndex) => (
                          <span key={artist.key}>
                            {artistIndex > 0 ? <span className="text-[var(--muted-foreground)]">, </span> : null}
                            {artist.external ? (
                              <a href={artist.href} target="_blank" rel="noopener noreferrer" className={artistTextClass(true)}>
                                {artist.name}
                              </a>
                            ) : (
                              <button type="button" onClick={() => openArtist(artist.key)} className={artistTextClass()}>
                                {artist.name}
                              </button>
                            )}
                          </span>
                        ))}
                      </div>

                      <div className="md:hidden flex flex-wrap items-center gap-2 mt-1 text-[11px] text-[var(--muted-foreground)]">
                        {versionLabel ? <span>{versionLabel}</span> : null}
                        {track.releaseDate ? <span>{track.releaseDate}</span> : null}
                        {hasVelocity ? <span className="text-green-300">+{track.trendPercent.toFixed(0)}%</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className={`hidden md:flex flex-col items-end rounded-full border px-2.5 py-1 text-[11px] font-bold ${ageMeta.className}`}>
                    <span>{ageMeta.label}</span>
                    <span className="font-medium opacity-75">{ageMeta.sublabel}</span>
                  </div>

                  <div className="hidden md:flex flex-col items-end text-xs text-[var(--muted-foreground)]">
                    {mode === "hype-trend" ? (
                      <>
                        <span className="inline-flex items-center gap-1 font-bold text-white">
                          <TrendingUp className="w-3 h-3" />
                          {track.hasTrendData ? `${track.trendPercent >= 0 ? "+" : ""}${track.trendPercent.toFixed(1)}%` : "Base"}
                        </span>
                        <span>{track.hasTrendData ? `${period === "week" ? "7D" : "30D"} growth` : "no baseline"}</span>
                      </>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1 font-bold text-white">
                          <CalendarDays className="w-3 h-3" />
                          No age decay
                        </span>
                        <span>Spotify rank</span>
                      </>
                    )}
                  </div>

                  <div className="text-right">
                    <div className={`text-lg font-black tabular-nums ${scoreMeta.className}`}>{scoreMeta.value}</div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted-foreground)]">{scoreMeta.label}</div>
                    <div className="hidden md:block text-[10px] text-[var(--muted-foreground)]">{scoreMeta.sublabel}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {!loading && tracks.length < totalCount ? (
          <div className="flex justify-center mt-6">
            <button
              type="button"
              onClick={() => fetchTracks(tracks.length, true)}
              disabled={loadingMore}
              className="px-5 py-2.5 rounded-xl border border-[var(--muted)] bg-[var(--secondary)] text-sm font-bold text-white hover:border-[var(--accent)] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : <Flame className="w-4 h-4" />}
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
