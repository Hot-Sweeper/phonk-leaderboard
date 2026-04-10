"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import {
  Trophy,
  TrendingUp,
  Eye,
  ExternalLink,
  Users,
  PlusCircle,
  Flame,
  Search,
  Star,
  X,
  Send,
} from "lucide-react";

type Channel = {
  id: string;
  name: string;
  handle?: string;
  url: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  totalViews: string;
  watchlistCount: number;
};

export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRequest, setShowRequest] = useState(false);
  const [requestUrl, setRequestUrl] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [addChannelUrl, setAddChannelUrl] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const loadChannels = useCallback(async (q = "") => {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const res = await fetch(`/api/channel${params}`);
    if (res.ok) setChannels(await res.json());
    setLoading(false);
  }, []);

  const loadWatchlist = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (res.ok) {
      const ids: string[] = await res.json();
      setWatchlistedIds(new Set(ids));
    }
  }, []);

  useEffect(() => {
    loadChannels();
    loadWatchlist();
  }, [loadChannels, loadWatchlist]);

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      loadChannels(value);
    }, 350);
  }

  async function toggleWatchlist(channelId: string) {
    if (!session) return signIn("google");
    const isWatched = watchlistedIds.has(channelId);
    const res = await fetch("/api/watchlist", {
      method: isWatched ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId }),
    });
    if (res.ok) {
      setWatchlistedIds((prev) => {
        const next = new Set(prev);
        isWatched ? next.delete(channelId) : next.add(channelId);
        return next;
      });
      setChannels((prev) =>
        prev.map((c) =>
          c.id === channelId
            ? {
                ...c,
                watchlistCount: c.watchlistCount + (isWatched ? -1 : 1),
              }
            : c
        )
      );
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return signIn("google");
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: requestUrl, reason: requestReason }),
    });
    if (res.ok) {
      setRequestSent(true);
      setTimeout(() => {
        setShowRequest(false);
        setRequestSent(false);
        setRequestUrl("");
        setRequestReason("");
      }, 2000);
    }
  }

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/channel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: addChannelUrl }),
    });
    if (res.ok) {
      setShowAddChannel(false);
      setAddChannelUrl("");
      loadChannels(search);
    }
  }

  const totalWatchlists = channels.reduce(
    (sum, c) => sum + c.watchlistCount,
    0
  );
  const topChannel = channels[0];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans overflow-hidden relative">
      {/* Decorative Grid */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* Header */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12 border-b border-[var(--muted)] pb-8">
          <div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase flex items-center gap-4 text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-400 to-[#c026d3]">
              <Flame className="w-10 h-10 md:w-14 md:h-14 text-[var(--accent)]" />
              Phonk Ranks
            </h1>
            <p className="text-[var(--muted-foreground)] mt-2 text-lg font-medium max-w-xl">
              The ultimate Funk/Phonk YouTube channel leaderboard. Add artists
              to your watchlist to boost their rank.
            </p>
          </div>
          <div className="flex gap-3">
            {isPrivileged && (
              <button
                onClick={() => setShowAddChannel(true)}
                className="whitespace-nowrap px-5 py-3 rounded-full font-bold bg-[var(--accent)] hover:bg-[#a21caf] transition-all flex items-center gap-2 shadow-[0_0_20px_var(--accent-glow)] text-white"
              >
                <PlusCircle className="w-5 h-5" />
                Add Channel
              </button>
            )}
            <button
              onClick={() =>
                session ? setShowRequest(true) : signIn("google")
              }
              className="whitespace-nowrap px-5 py-3 rounded-full font-bold border border-[var(--muted)] hover:border-[var(--accent)] transition-all flex items-center gap-2 text-[var(--foreground)]"
            >
              <Send className="w-5 h-5" />
              Request to Join
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg">
            <Trophy className="w-8 h-8 text-yellow-400 mb-3" />
            <span className="text-[var(--muted-foreground)] text-sm font-semibold uppercase tracking-wider">
              Most Watched
            </span>
            <strong className="text-2xl font-black mt-1">
              {topChannel?.name ?? "—"}
            </strong>
          </div>
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg">
            <Users className="w-8 h-8 text-blue-400 mb-3" />
            <span className="text-[var(--muted-foreground)] text-sm font-semibold uppercase tracking-wider">
              Total Tracked
            </span>
            <strong className="text-2xl font-black mt-1">
              {channels.length} Channels
            </strong>
          </div>
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-lg">
            <TrendingUp className="w-8 h-8 text-[var(--destructive)] mb-3" />
            <span className="text-[var(--muted-foreground)] text-sm font-semibold uppercase tracking-wider">
              Total Watchlists
            </span>
            <strong className="text-2xl font-black mt-1">
              {totalWatchlists}
            </strong>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search channels..."
            className="w-full bg-[var(--secondary)] border border-[var(--muted)] rounded-xl pl-12 pr-4 py-3 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
          />
        </div>

        {/* Leaderboard */}
        <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-4 border-b border-[var(--muted)] text-[var(--muted-foreground)] font-bold text-xs md:text-sm uppercase tracking-wider items-center px-6">
            <div className="w-8 text-center text-lg">#</div>
            <div>Channel</div>
            <div className="hidden md:flex justify-end min-w-[100px] gap-2 items-center">
              <Star className="w-4 h-4" /> Watchlists
            </div>
            <div className="hidden md:flex justify-end min-w-[100px] gap-2 items-center">
              <Eye className="w-4 h-4" /> Subs
            </div>
          </div>

          {loading ? (
            <div className="text-center text-[var(--muted-foreground)] py-20">
              Loading...
            </div>
          ) : channels.length === 0 ? (
            <div className="text-center text-[var(--muted-foreground)] py-20">
              {search ? "No channels match your search." : "No channels yet."}
            </div>
          ) : (
            <div className="divide-y divide-[var(--muted)]">
              {channels.map((channel, i) => {
                const isWatched = watchlistedIds.has(channel.id);
                return (
                  <div
                    key={channel.id}
                    className="grid grid-cols-[auto_1fr_auto_auto] gap-4 p-4 px-6 items-center hover:bg-[var(--muted)] transition-colors group"
                  >
                    {/* Rank */}
                    <div
                      className={`w-8 text-center font-black text-xl md:text-2xl ${
                        i === 0
                          ? "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]"
                          : i === 1
                            ? "text-zinc-300 drop-shadow-[0_0_10px_rgba(212,212,216,0.3)]"
                            : i === 2
                              ? "text-amber-600"
                              : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {i + 1}
                    </div>

                    {/* Channel Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {channel.thumbnailUrl && (
                        <img
                          src={channel.thumbnailUrl}
                          alt={channel.name}
                          className="w-10 h-10 rounded-full shrink-0 border border-[var(--muted)]"
                        />
                      )}
                      <div className="min-w-0">
                        <span className="font-bold text-base md:text-lg group-hover:text-[var(--accent)] transition-colors truncate flex items-center gap-2">
                          {channel.name}
                          {i === 0 && (
                            <Trophy className="w-4 h-4 text-yellow-400 hidden md:inline" />
                          )}
                        </span>
                        <Link
                          href={channel.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[var(--muted-foreground)] text-xs md:text-sm flex items-center gap-1 hover:text-white transition-colors w-max"
                        >
                          {channel.handle
                            ? `@${channel.handle}`
                            : "Visit Channel"}{" "}
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                    </div>

                    {/* Watchlist count + toggle */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleWatchlist(channel.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                          isWatched
                            ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                            : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-zinc-700 hover:text-white"
                        }`}
                        title={
                          isWatched
                            ? "Remove from watchlist"
                            : "Add to watchlist"
                        }
                      >
                        <Star
                          className={`w-4 h-4 ${isWatched ? "fill-current" : ""}`}
                        />
                        <span className="tabular-nums">
                          {channel.watchlistCount}
                        </span>
                      </button>
                    </div>

                    {/* Subscriber count */}
                    <div className="hidden md:block text-right font-semibold text-[var(--muted-foreground)] tabular-nums">
                      {channel.subscriberCount.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Request to Join Modal */}
      {showRequest && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
            <button
              onClick={() => setShowRequest(false)}
              className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-2">Request to Join</h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">
              Submit your YouTube channel link. A moderator will review it.
            </p>
            {requestSent ? (
              <div className="text-green-400 font-bold text-center py-8">
                Request submitted! A moderator will review it soon.
              </div>
            ) : (
              <form onSubmit={submitRequest} className="flex flex-col gap-3">
                <input
                  required
                  type="url"
                  placeholder="https://youtube.com/@yourchannel"
                  value={requestUrl}
                  onChange={(e) => setRequestUrl(e.target.value)}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <textarea
                  placeholder="Why should this channel be added? (optional)"
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  rows={3}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  className="mt-1 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all"
                >
                  Submit Request
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Admin Add Channel Modal */}
      {showAddChannel && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
            <button
              onClick={() => setShowAddChannel(false)}
              className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-2">Add Channel</h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">
              Paste a YouTube channel URL to add it directly.
            </p>
            <form onSubmit={addChannel} className="flex flex-col gap-3">
              <input
                required
                type="url"
                placeholder="https://youtube.com/@channelhandle"
                value={addChannelUrl}
                onChange={(e) => setAddChannelUrl(e.target.value)}
                className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
              />
              <button
                type="submit"
                className="mt-1 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all"
              >
                Add to Leaderboard
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}