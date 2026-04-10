"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Star,
  ExternalLink,
  Plus,
  X,
  Send,
  User,
  RefreshCw,
} from "lucide-react";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const STAT_LABELS: Record<string, string> = {
  YOUTUBE: "subscribers",
  SPOTIFY: "followers",
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
      setSuggestSent(true);
      setTimeout(() => {
        setShowSuggest(false);
        setSuggestSent(false);
        setSuggestUrl("");
        setSuggestNote("");
      }, 2000);
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
          href="/"
          className="text-[var(--accent)] hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to leaderboard
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
          href="/"
          className="inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-white text-sm mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to leaderboard
        </Link>

        {/* Artist Header */}
        <div className="relative overflow-hidden rounded-3xl border border-[var(--muted)] bg-gradient-to-br from-[var(--secondary)] to-[#0f0f12] p-8 mb-8">
          {/* Accent glow behind */}
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-[var(--accent)] opacity-[0.07] blur-3xl" />

          <div className="flex items-start gap-6 relative">
            {/* Avatar */}
            {artist.imageUrl ? (
              <img
                src={artist.imageUrl}
                alt={artist.name}
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
                    onClick={refreshStats}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh Stats
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
                      {link.handle ? `@${link.handle}` : artist.name}
                    </div>
                    {link.followerCount > 0 && (
                      <div className="text-[var(--muted-foreground)] text-sm mt-1 tabular-nums">
                        {formatCount(link.followerCount)} {STAT_LABELS[link.platform] ?? "followers"}
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
            <h2 className="text-xl font-black mb-2">Suggest a Link</h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">
              Help complete {artist.name}&apos;s profile. A moderator will
              review your suggestion.
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
                  <Send className="w-4 h-4" /> Submit Suggestion
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
