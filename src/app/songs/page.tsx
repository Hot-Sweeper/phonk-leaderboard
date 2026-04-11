"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Music,
  Search,
  ExternalLink,
  Loader2,
  Clock,
  ChevronUp,
  Play,
  Pause,
  Trophy,
  CalendarDays,
} from "lucide-react";

type Contributor = {
  id: string;
  name: string;
  imageUrl: string | null;
};

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
  versions: string[];
  featuredArtists: string[];
  contributorIds: string[];
  contributors: Contributor[];
  artist: {
    id: string;
    name: string;
    imageUrl: string | null;
  };
};

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function popularityColor(p: number) {
  // Deezer rank is 0-1,000,000; Spotify is 0-100
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
  // Deezer rank 0-1,000,000 → percentage 0-100
  return p > 100 ? Math.min(100, p / 10000) : p;
}

function formatPopularity(p: number) {
  // Deezer rank: show as "980K" or "12K", Spotify: show raw 0-100
  if (p > 100) {
    if (p >= 1_000_000) return `${(p / 1_000_000).toFixed(1)}M`;
    if (p >= 1_000) return `${Math.round(p / 1_000)}K`;
    return String(p);
  }
  return String(p);
}

function getVersionLabel(versions: string[]) {
  if (versions.includes("Original")) return "Original";
  return versions[0] ?? "Original";
}

function isValidPreviewUrl(previewUrl: string | null | undefined) {
  return typeof previewUrl === "string" && /^https?:\/\//i.test(previewUrl.trim());
}

function contributorTextClass() {
  return "text-[var(--muted-foreground)] hover:text-white underline decoration-[var(--accent)]/45 underline-offset-2 transition-colors";
}

function PodiumTrackCard({
  track,
  rank,
  isPlaying,
  previewUnavailable,
  onTogglePreview,
}: {
  track: Track;
  rank: number;
  isPlaying: boolean;
  previewUnavailable: boolean;
  onTogglePreview: (trackId: string, previewUrl: string) => void;
}) {
  const accent = rank === 1 ? "text-yellow-400 border-yellow-500/30" : rank === 2 ? "text-zinc-300 border-zinc-500/30" : "text-amber-600 border-amber-700/30";

  return (
    <div className={`rounded-[28px] overflow-hidden border bg-[var(--secondary)]/70 relative ${rank === 1 ? "md:-translate-y-6" : ""} ${accent}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
      <div className="p-5 relative">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-[0.2em]">#{rank}</span>
          </div>
          {isValidPreviewUrl(track.previewUrl) ? (
            <button
              onClick={() => onTogglePreview(track.id, track.previewUrl!)}
              disabled={previewUnavailable}
              className={`w-10 h-10 rounded-full text-white flex items-center justify-center transition-colors ${previewUnavailable ? "bg-white/10 text-white/35 cursor-not-allowed" : "bg-black/35 hover:bg-green-600"}`}
              title={previewUnavailable ? "Preview unavailable" : isPlaying ? "Pause preview" : "Play preview"}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
          ) : null}
        </div>
        <div className="flex flex-col items-center text-center">
          {track.albumImageUrl ? (
            <Image src={track.albumImageUrl} alt={track.name} width={rank === 1 ? 180 : 140} height={rank === 1 ? 180 : 140} className="rounded-2xl object-cover shadow-2xl mb-4" />
          ) : (
            <div className="rounded-2xl bg-[var(--muted)] flex items-center justify-center mb-4" style={{ width: rank === 1 ? 180 : 140, height: rank === 1 ? 180 : 140 }}>
              <Music className="w-8 h-8 text-[var(--muted-foreground)]" />
            </div>
          )}
          <div className="font-black text-lg text-white leading-tight line-clamp-2">{track.name}</div>
          <Link
            href={`/artist/${track.artist.id}`}
            className="text-sm text-[var(--muted-foreground)] mt-1 truncate max-w-full hover:text-white transition-colors"
          >
            {track.artist.name}
          </Link>
          <div className="flex items-center justify-center gap-2 mt-3 text-[11px] font-bold">
            {track.releaseDate ? (
              <span className="text-[var(--muted-foreground)]">{track.releaseDate}</span>
            ) : null}
            <span className="text-white/70">{getVersionLabel(track.versions)}</span>
          </div>
          <div className="mt-4 text-xl font-black text-green-400">{formatPopularity(track.popularity)}</div>
        </div>
      </div>
    </div>
  );
}

export default function SongsPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [failedPreviewTrackIds, setFailedPreviewTrackIds] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopCurrentAudio = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.src = "";
    audioRef.current.load();
    audioRef.current = null;
    setPlayingTrackId(null);
  }, []);

  const markPreviewFailed = useCallback((trackId: string) => {
    setFailedPreviewTrackIds((current) => (current.includes(trackId) ? current : [...current, trackId]));
  }, []);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  const fetchTracks = useCallback(async (skip: number, searchQuery: string, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ skip: String(skip), take: "50" });
      if (searchQuery) params.set("search", searchQuery);
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

  // Initial load + search changes
  useEffect(() => {
    fetchTracks(0, debouncedSearch, false);
  }, [debouncedSearch, fetchTracks]);

  // Scroll to top button
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      stopCurrentAudio();
    };
  }, [stopCurrentAudio]);

  async function togglePreview(trackId: string, previewUrl: string) {
    if (failedPreviewTrackIds.includes(trackId)) return;

    if (playingTrackId === trackId) {
      stopCurrentAudio();
      return;
    }

    if (!isValidPreviewUrl(previewUrl)) {
      markPreviewFailed(trackId);
      return;
    }

    stopCurrentAudio();

    const audio = new Audio();
    audio.volume = 0.5;
    audio.preload = "none";
    audio.src = previewUrl.trim();

    audio.onended = () => {
      if (audioRef.current === audio) {
        stopCurrentAudio();
      }
    };
    audio.onerror = () => {
      if (audioRef.current === audio) {
        stopCurrentAudio();
      }
      markPreviewFailed(trackId);
    };

    audioRef.current = audio;

    try {
      await audio.play();
      setPlayingTrackId(trackId);
    } catch {
      if (audioRef.current === audio) {
        stopCurrentAudio();
      }
      markPreviewFailed(trackId);
    }
  }

  function loadMore() {
    fetchTracks(tracks.length, debouncedSearch, true);
  }

  const podiumTracks = tracks.slice(0, 3);
  const tableTracks = podiumTracks.length === 3 ? tracks.slice(3) : tracks;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans relative">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 mb-1">
              <Music className="w-8 h-8 text-green-400" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-green-400">
                Song Rankings
              </span>
            </h1>
            <p className="text-[var(--muted-foreground)] text-sm">
              {totalCount > 0 ? `${totalCount} tracks ranked by popularity` : "Loading tracks..."}
            </p>
          </div>

          {/* Search */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              placeholder="Search songs, artists, albums..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-green-500/50 placeholder:text-zinc-500"
            />
          </div>
        </div>

        {!loading && podiumTracks.length === 3 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 items-end">
            <PodiumTrackCard track={podiumTracks[1]} rank={2} isPlaying={playingTrackId === podiumTracks[1].id} previewUnavailable={failedPreviewTrackIds.includes(podiumTracks[1].id)} onTogglePreview={togglePreview} />
            <PodiumTrackCard track={podiumTracks[0]} rank={1} isPlaying={playingTrackId === podiumTracks[0].id} previewUnavailable={failedPreviewTrackIds.includes(podiumTracks[0].id)} onTogglePreview={togglePreview} />
            <PodiumTrackCard track={podiumTracks[2]} rank={3} isPlaying={playingTrackId === podiumTracks[2].id} previewUnavailable={failedPreviewTrackIds.includes(podiumTracks[2].id)} onTogglePreview={togglePreview} />
          </div>
        )}

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2rem_3rem_minmax(0,1fr)_8rem_8rem_4rem_4.5rem_3rem] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] border-b border-[var(--muted)]">
          <span />
          <span>#</span>
          <span>Title</span>
          <span>Version</span>
          <span className="text-right">Released</span>
          <span className="text-right">
            <Clock className="w-3 h-3 inline" />
          </span>
          <span className="text-right">Popularity</span>
          <span />
        </div>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--muted-foreground)]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && tracks.length === 0 && (
          <div className="text-center py-20">
            <Music className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-3 opacity-40" />
            <p className="text-[var(--muted-foreground)] text-sm">
              {debouncedSearch ? "No songs found matching your search." : "No songs tracked yet. Songs are loaded when you visit artist pages."}
            </p>
          </div>
        )}

        {/* Track list */}
        {!loading && (
          <div className="flex flex-col">
            {tableTracks.map((track, i) => {
              const rank = i + (podiumTracks.length === 3 ? 4 : 1);
              const rankColor = "text-[var(--muted-foreground)]";
              const isPlaying = playingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className="group grid grid-cols-[2rem_3rem_1fr_4rem] md:grid-cols-[2rem_3rem_minmax(0,1fr)_8rem_8rem_4rem_4.5rem_3rem] gap-3 px-4 md:px-5 py-3 items-center border-b border-[var(--muted)]/40 hover:bg-[var(--secondary)]/60 transition-colors"
                >
                  {/* Preview button */}
                  <div className="flex justify-center">
                    {isValidPreviewUrl(track.previewUrl) ? (
                      <button
                        onClick={() => togglePreview(track.id, track.previewUrl!)}
                        disabled={failedPreviewTrackIds.includes(track.id)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                          failedPreviewTrackIds.includes(track.id)
                            ? "bg-[var(--muted)] text-[var(--muted-foreground)]/40 cursor-not-allowed"
                            : isPlaying
                              ? "bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-green-600 hover:text-white"
                        }`}
                        title={failedPreviewTrackIds.includes(track.id) ? "Preview unavailable" : isPlaying ? "Pause preview" : "Play 30s preview"}
                      >
                        {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                      </button>
                    ) : (
                      <div className="w-7 h-7" />
                    )}
                  </div>

                  {/* Rank */}
                  <span className={`text-center font-black text-base tabular-nums ${rankColor}`}>
                    {rank}
                  </span>

                  {/* Title + Artist + Cover art */}
                  <div className="flex items-center gap-3 min-w-0">
                    {track.albumImageUrl ? (
                      <Image
                        src={track.albumImageUrl}
                        alt={track.albumName ?? ""}
                        width={44}
                        height={44}
                        className="rounded-lg shrink-0 shadow-md"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0">
                        <Music className="w-4 h-4 text-[var(--muted-foreground)]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm truncate">
                          {track.name}
                        </span>
                        {track.explicit && (
                          <span className="shrink-0 text-[9px] font-bold bg-zinc-700 text-zinc-300 px-1 py-px rounded">
                            E
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] truncate">
                        <Link
                          href={`/artist/${track.artist.id}`}
                          className="hover:text-white transition-colors"
                        >
                          {track.artist.name}
                        </Link>
                        {/* Contributors: forum artists get links, others show as text */}
                        {(track.contributors.length > 0 || track.featuredArtists.length > 0) && (
                          <span className="opacity-60">
                            {" "}feat.{" "}
                            {track.contributors.length > 0
                              ? track.contributors.map((c, ci) => (
                                  <span key={c.id}>
                                    {ci > 0 && ", "}
                                    <Link
                                      href={`/artist/${c.id}`}
                                      className={contributorTextClass()}
                                    >
                                      {c.name}
                                    </Link>
                                  </span>
                                ))
                              : null}
                            {/* Non-forum featured artists */}
                            {track.featuredArtists
                              .filter(name => !track.contributors.some(c => c.name === name))
                              .map((name, fi) => (
                                <span key={name}>
                                  {(fi > 0 || track.contributors.length > 0) && ", "}
                                  <a
                                    href={`https://open.spotify.com/search/${encodeURIComponent(name)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={contributorTextClass()}
                                  >
                                    {name}
                                  </a>
                                </span>
                              ))}
                          </span>
                        )}
                      </div>
                      <div className="md:hidden text-[11px] text-[var(--muted-foreground)] opacity-60 truncate mt-1">
                        {getVersionLabel(track.versions)}
                        <span className="mx-1.5">•</span>
                        {track.releaseDate ?? "Unknown date"}
                      </div>
                    </div>
                  </div>

                  <span className="hidden md:block text-xs text-[var(--muted-foreground)] truncate font-medium">
                    {getVersionLabel(track.versions)}
                  </span>

                  <span className="hidden md:flex items-center justify-end gap-1 text-xs text-[var(--muted-foreground)] tabular-nums">
                    <CalendarDays className="w-3 h-3 opacity-50" />
                    {track.releaseDate ?? "--"}
                  </span>

                  {/* Duration */}
                  <span className="hidden md:block text-xs text-[var(--muted-foreground)] text-right tabular-nums">
                    {formatDuration(track.durationMs)}
                  </span>

                  {/* Popularity */}
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-xs font-bold tabular-nums ${popularityColor(track.popularity)}`}>
                      {formatPopularity(track.popularity)}
                    </span>
                    <div className="w-12 h-1 rounded-full bg-[var(--muted)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${popularityBar(track.popularity)}`}
                        style={{ width: `${normalizePopularity(track.popularity)}%` }}
                      />
                    </div>
                  </div>

                  {/* Link to Deezer/Spotify */}
                  <div className="hidden md:flex justify-end">
                    {(track.deezerUrl || track.spotifyUrl) && (
                      <a
                        href={track.deezerUrl ?? track.spotifyUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--muted-foreground)] hover:text-green-400 transition-colors"
                        title={track.deezerUrl ? "Open in Deezer" : "Open in Spotify"}
                      >
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
        {!loading && tracks.length < totalCount && (
          <div className="flex justify-center py-8">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-6 py-2.5 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-sm font-bold hover:bg-[var(--muted)] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {loadingMore ? "Loading..." : `Load More (${tracks.length}/${totalCount})`}
            </button>
          </div>
        )}
      </div>

      {/* Scroll to top */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full bg-green-600 hover:bg-green-500 text-white flex items-center justify-center shadow-lg transition-all"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </main>
  );
}
