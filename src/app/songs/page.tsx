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
  Activity,
} from "lucide-react";

type Contributor = {
  id: string;
  name: string;
  imageUrl: string | null;
};

type Track = {
  id: string;
  spotifyId: string | null;
  deezerId: number | null;
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

export default function SongsPage() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  function togglePreview(trackId: string, previewUrl: string) {
    if (playingTrackId === trackId) {
      // Stop playing
      audioRef.current?.pause();
      audioRef.current = null;
      setPlayingTrackId(null);
      return;
    }
    // Stop any current playback
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(previewUrl);
    audio.volume = 0.5;
    audio.play();
    audio.onended = () => {
      setPlayingTrackId(null);
      audioRef.current = null;
    };
    audioRef.current = audio;
    setPlayingTrackId(trackId);
  }

  function loadMore() {
    fetchTracks(tracks.length, debouncedSearch, true);
  }

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

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[2rem_3rem_1fr_1fr_3.5rem_4rem_4.5rem_3rem] gap-3 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)] border-b border-[var(--muted)]">
          <span />
          <span>#</span>
          <span>Title</span>
          <span>Album</span>
          <span className="text-right">BPM</span>
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
            {tracks.map((track, i) => {
              const rank = i + 1;
              const isTop3 = rank <= 3;
              const rankColor = rank === 1 ? "text-yellow-400" : rank === 2 ? "text-zinc-300" : rank === 3 ? "text-amber-600" : "text-[var(--muted-foreground)]";
              const isPlaying = playingTrackId === track.id;

              return (
                <div
                  key={track.id}
                  className={`group grid grid-cols-[2rem_3rem_1fr_4rem] md:grid-cols-[2rem_3rem_1fr_1fr_3.5rem_4rem_4.5rem_3rem] gap-3 px-4 md:px-5 py-3 items-center border-b border-[var(--muted)]/40 hover:bg-[var(--secondary)]/60 transition-colors ${isTop3 ? "bg-[var(--secondary)]/30" : ""}`}
                >
                  {/* Preview button */}
                  <div className="flex justify-center">
                    {track.previewUrl ? (
                      <button
                        onClick={() => togglePreview(track.id, track.previewUrl!)}
                        className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                          isPlaying
                            ? "bg-green-500 text-white shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-green-600 hover:text-white"
                        }`}
                        title={isPlaying ? "Pause preview" : "Play 30s preview"}
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

                  {/* Title + Artist + Album art */}
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
                        <span className={`font-bold text-sm truncate ${isTop3 ? "text-white" : ""}`}>
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
                                      className="text-[var(--accent)] hover:text-white transition-colors"
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
                                    className="hover:text-white transition-colors"
                                  >
                                    {name}
                                  </a>
                                </span>
                              ))}
                          </span>
                        )}
                      </div>
                      {/* Mobile: album + BPM inline */}
                      <div className="md:hidden text-[11px] text-[var(--muted-foreground)] opacity-60 truncate mt-0.5">
                        {track.albumName}
                        {track.bpm && <span className="ml-2">{Math.round(track.bpm)} BPM</span>}
                      </div>
                    </div>
                  </div>

                  {/* Album - desktop only */}
                  <div className="hidden md:block text-xs text-[var(--muted-foreground)] truncate">
                    {track.albumName}
                    {track.releaseDate && (
                      <span className="opacity-50 ml-1">
                        ({track.releaseDate.slice(0, 4)})
                      </span>
                    )}
                  </div>

                  {/* BPM - desktop only */}
                  <span className="hidden md:block text-xs text-[var(--muted-foreground)] text-right tabular-nums">
                    {track.bpm ? (
                      <span className="flex items-center justify-end gap-1">
                        <Activity className="w-3 h-3 opacity-50" />
                        {Math.round(track.bpm)}
                      </span>
                    ) : (
                      <span className="opacity-30">--</span>
                    )}
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
