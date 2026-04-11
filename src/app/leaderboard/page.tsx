"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { Skeleton } from "@/components/Skeleton";
import {
  Trophy,
  TrendingUp,
  Users,
  PlusCircle,
  Flame,
  Search,
  Star,
  X,
  Send,
  ExternalLink,
  Loader2,
  Check,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  RefreshCw,
} from "lucide-react";


type ArtistLink = {
  id: string;
  platform: string;
  url: string;
  handle: string | null;
  followerCount: number;
  monthlyListeners: number;
};

type AddLinkInput = {
  platform: string;
  url: string;
  handle: string;
  spotifyPreviewUrl?: string;
  spotifyPreviewName?: string | null;
  spotifyPreviewImageUrl?: string | null;
  spotifyPreviewFollowerCount?: number;
  spotifyPreviewPlatformId?: string | null;
  spotifyPreviewLoading?: boolean;
  spotifyPreviewError?: string | null;
};

type Artist = {
  id: string;
  name: string;
  imageUrl: string | null;
  watchlistCount: number;
  links: ArtistLink[];
};

const PLATFORMS = [
  { key: "", label: "Spotify Listeners", color: "text-green-400" },
  { key: "YOUTUBE", label: "YouTube Subs", color: "text-red-400" },
  { key: "INSTAGRAM", label: "Instagram", color: "text-fuchsia-400" },
  { key: "TIKTOK", label: "TikTok", color: "text-cyan-400" },
];

const ALL_PLATFORMS = [
  { key: "YOUTUBE", label: "YouTube" },
  { key: "SPOTIFY", label: "Spotify" },
  { key: "TIKTOK", label: "TikTok" },
  { key: "INSTAGRAM", label: "Instagram" },
];

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function isValidSpotifyArtistUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.hostname !== "open.spotify.com") return false;
    return /\/(?:intl-[\w-]+\/)?artist\/[a-zA-Z0-9]+/.test(parsedUrl.pathname);
  } catch {
    return false;
  }
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

      const reservedPaths = new Set([
        "p",
        "reel",
        "reels",
        "tv",
        "stories",
        "explore",
        "accounts",
        "direct",
      ]);

      return reservedPaths.has(handle.toLowerCase()) ? null : handle;
    }

    return null;
  } catch {
    return null;
  }
}

function getDisplayHandle(link: ArtistLink): string | null {
  return link.handle ?? extractHandleFromUrl(link.platform, link.url);
}

const PLATFORM_STAT_LABEL: Record<string, string> = {
  YOUTUBE: "subs",
  SPOTIFY: "listeners",
  TIKTOK: "followers",
  INSTAGRAM: "followers",
};

const PLATFORM_DOT: Record<string, string> = {
  YOUTUBE: "bg-red-400",
  SPOTIFY: "bg-green-400",
  TIKTOK: "bg-cyan-400",
  INSTAGRAM: "bg-fuchsia-400",
};

function LeaderboardPageSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-4 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 items-end max-w-2xl mx-auto">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={`rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-4 ${index === 1 ? "md:-mt-8" : ""}`}>
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className={`w-full rounded-t-2xl ${index === 1 ? "h-44" : "h-36"}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-28 rounded-xl shrink-0" />
          ))}
        </div>
        <Skeleton className="h-10 flex-1 rounded-xl" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 px-5 py-4 flex items-center gap-4">
            <Skeleton className="h-8 w-8" />
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 max-w-full" />
              <Skeleton className="h-3 w-28 max-w-full" />
            </div>
            <Skeleton className="h-8 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Podium Card ─── */
function PodiumCard({
  artist,
  rank,
  isWatched,
  onToggle,
  toggling,
  platform,
}: {
  artist: Artist;
  rank: number;
  isWatched: boolean;
  onToggle: () => void;
  toggling: boolean;
  platform: string;
}) {
  const heights = ["h-52", "h-44", "h-40"];
  const rings = [
    "ring-yellow-400/60 shadow-[0_0_40px_rgba(250,204,21,0.25)]",
    "ring-zinc-400/40 shadow-[0_0_30px_rgba(161,161,170,0.15)]",
    "ring-amber-700/40 shadow-[0_0_25px_rgba(180,83,9,0.15)]",
  ];
  const medals = ["text-yellow-400", "text-zinc-300", "text-amber-600"];
  const glows = [
    "from-yellow-400/10 via-transparent",
    "from-zinc-400/5 via-transparent",
    "from-amber-700/5 via-transparent",
  ];
  const order = [1, 0, 2]; // visual order: silver, gold, bronze

  return (
    <div
      className={`flex flex-col items-center ${rank === 0 ? "order-2 md:-mt-8" : rank === 1 ? "order-1" : "order-3"}`}
      style={{ order: order[rank] }}
    >
      {/* Avatar + crown */}
      <div className="relative mb-3">
        {rank === 0 && (
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-yellow-400 text-2xl">
            <Trophy className="w-7 h-7 fill-yellow-400/30" />
          </div>
        )}
        <Link href={`/artist/${artist.id}`}>
          {artist.imageUrl ? (
            <Image
              src={artist.imageUrl}
              alt={artist.name}
              width={96}
              height={96}
              className={`w-20 h-20 md:w-24 md:h-24 rounded-full ring-4 ${rings[rank]} object-cover transition-transform hover:scale-105`}
            />
          ) : (
            <div
              className={`w-20 h-20 md:w-24 md:h-24 rounded-full ring-4 ${rings[rank]} bg-[var(--muted)] flex items-center justify-center`}
            >
              <span className="text-2xl font-black text-[var(--muted-foreground)]">
                {artist.name.charAt(0)}
              </span>
            </div>
          )}
        </Link>
      </div>

      {/* Podium block */}
      <div
        className={`w-full ${heights[rank]} rounded-t-2xl bg-gradient-to-t ${glows[rank]} to-transparent border border-[var(--muted)] border-b-0 relative flex flex-col items-center pt-4 px-3`}
        style={{
          background: `linear-gradient(to top, var(--secondary) 0%, transparent 100%), var(--secondary)`,
        }}
      >
        {/* Rank number */}
        <span className={`text-3xl md:text-4xl font-black ${medals[rank]} mb-1 tabular-nums`}>
          {rank + 1}
        </span>

        {/* Name */}
        <Link
          href={`/artist/${artist.id}`}
          className="font-bold text-sm md:text-base text-center hover:text-[var(--accent)] transition-colors truncate max-w-full"
        >
          {artist.name}
        </Link>

        {/* Platform stat */}
        <div className="flex flex-col items-center gap-1 mt-2">
          {(() => {
            const platformColors: Record<string, string> = {
              "": "text-green-400",
              YOUTUBE: "text-red-400",
              INSTAGRAM: "text-fuchsia-400",
              TIKTOK: "text-cyan-400",
            };
            const color = platformColors[platform] ?? "text-green-400";

            if (!platform || platform === "") {
              const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
              if (spotifyLink && spotifyLink.monthlyListeners > 0) {
                return (
                  <span className={`text-xs ${color} font-bold tabular-nums`}>
                    {formatCount(spotifyLink.monthlyListeners)} listeners
                  </span>
                );
              }
            } else {
              const link = artist.links.find((l) => l.platform === platform);
              if (link && link.followerCount > 0) {
                const label = platform === "YOUTUBE" ? "subs" : "followers";
                return (
                  <span className={`text-xs ${color} font-bold tabular-nums`}>
                    {formatCount(link.followerCount)} {label}
                  </span>
                );
              }
            }
            return null;
          })()}
          <div className="flex gap-1.5">
            {artist.links.map((l) => (
              <span
                key={l.id}
                className={`w-2 h-2 rounded-full ${PLATFORM_DOT[l.platform] ?? "bg-zinc-500"}`}
                title={`${l.platform}: ${formatCount(l.followerCount)}`}
              />
            ))}
          </div>
        </div>

        {/* Watchlist */}
        <button
          onClick={onToggle}
          disabled={toggling}
          className={`mt-auto mb-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-60 ${
            isWatched
              ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
              : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
          }`}
        >
          {toggling ? (
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Star className={`w-3.5 h-3.5 ${isWatched ? "fill-current" : ""}`} />
          )}
          {artist.watchlistCount}
        </button>
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function LeaderboardPage() {
  const { data: session } = useSession();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("");
  const [loading, setLoading] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [showRequest, setShowRequest] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqLinks, setReqLinks] = useState<{ platform: string; url: string }[]>([
    { platform: "YOUTUBE", url: "" },
  ]);
  const [reqReason, setReqReason] = useState("");
  const [requestSent, setRequestSent] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addLinks, setAddLinks] = useState<AddLinkInput[]>([
    { platform: "SPOTIFY", url: "", handle: "" },
  ]);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [rankChanges, setRankChanges] = useState<Record<string, { currentRank: number; previousRank: number | null; rankChange: number }>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Add-link-for-artist modal state (admin only)
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkModalArtistId, setLinkModalArtistId] = useState<string | null>(null);
  const [linkModalArtistName, setLinkModalArtistName] = useState("");
  const [linkModalPlatform, setLinkModalPlatform] = useState("YOUTUBE");
  const [linkModalUrl, setLinkModalUrl] = useState("");
  const [linkModalSubmitting, setLinkModalSubmitting] = useState(false);
  const [linkModalYtQuery, setLinkModalYtQuery] = useState("");
  const [linkModalYtResults, setLinkModalYtResults] = useState<Array<{ name: string; imageUrl: string | null; subscriberCount: number; handle: string | null; platformId: string | null }>>([]);
  const [linkModalYtSearching, setLinkModalYtSearching] = useState(false);

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const loadArtists = useCallback(
    async (q = "", plat = "") => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (plat) params.set("platform", plat);
      const qs = params.toString();
      const res = await fetch(`/api/artists${qs ? `?${qs}` : ""}`);
      if (res.ok) {
        const data = await res.json();
        setArtists(data.artists);
        setTotalCount(data.totalCount);
      }
      setLoading(false);
    },
    []
  );

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (platform) params.set("platform", platform);
    params.set("skip", String(artists.length));
    const qs = params.toString();
    const res = await fetch(`/api/artists?${qs}`);
    if (res.ok) {
      const data = await res.json();
      setArtists((prev) => [...prev, ...data.artists]);
      setTotalCount(data.totalCount);
    }
    setLoadingMore(false);
  }, [search, platform, artists.length]);

  const loadWatchlist = useCallback(async () => {
    const res = await fetch("/api/watchlist");
    if (res.ok) {
      const ids: string[] = await res.json();
      setWatchlistedIds(new Set(ids));
    }
  }, []);

  const loadRankChanges = useCallback(async () => {
    const res = await fetch("/api/artists/ranks");
    if (res.ok) {
      setRankChanges(await res.json());
    }
  }, []);

  useEffect(() => {
    loadArtists();
    loadWatchlist();
    loadRankChanges();
  }, [loadArtists, loadWatchlist, loadRankChanges]);

  // Debounced YouTube channel search for link modal
  useEffect(() => {
    if (linkModalPlatform !== "YOUTUBE" || !linkModalYtQuery.trim()) {
      setLinkModalYtResults([]);
      return;
    }
    const timeout = setTimeout(async () => {
      setLinkModalYtSearching(true);
      try {
        const res = await fetch("/api/artists/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "search", q: linkModalYtQuery.trim() }),
        });
        if (res.ok) setLinkModalYtResults(await res.json());
      } finally {
        setLinkModalYtSearching(false);
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [linkModalYtQuery, linkModalPlatform]);

  function openLinkModal(artistId: string, artistName: string, plat: string) {
    setLinkModalArtistId(artistId);
    setLinkModalArtistName(artistName);
    setLinkModalPlatform(plat);
    setLinkModalUrl("");
    setLinkModalYtResults([]);
    setLinkModalYtQuery(plat === "YOUTUBE" ? artistName : "");
    setShowLinkModal(true);
  }

  async function submitLinkModal(e: React.FormEvent) {
    e.preventDefault();
    if (!linkModalArtistId || !linkModalUrl.trim()) return;
    setLinkModalSubmitting(true);
    try {
      const res = await fetch(`/api/artists/${linkModalArtistId}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: linkModalPlatform, url: linkModalUrl.trim(), note: "" }),
      });
      if (res.ok) {
        const updated = await res.json();
        if (updated?.links) {
          // Patch artist in-place without reloading the whole list
          setArtists((prev) =>
            prev.map((a) =>
              a.id === linkModalArtistId ? { ...a, links: updated.links } : a
            )
          );
        }
        setShowLinkModal(false);
      }
    } finally {
      setLinkModalSubmitting(false);
    }
  }

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    addLinks.forEach((link, index) => {
      const trimmedUrl = link.url.trim();
      if (link.platform !== "SPOTIFY" || !isValidSpotifyArtistUrl(trimmedUrl)) {
        return;
      }

      if (link.spotifyPreviewUrl === trimmedUrl || link.spotifyPreviewLoading) {
        return;
      }

      timers.push(
        setTimeout(() => {
          void previewSpotifyLink(index, trimmedUrl);
        }, 350)
      );
    });

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [addLinks]);

  function handleSearch(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      loadArtists(value, platform);
    }, 350);
  }

  function handlePlatform(p: string) {
    setPlatform(p);
    setLoading(true);
    loadArtists(search, p);
  }

  async function toggleWatchlist(artistId: string) {
    if (!session) return signIn("google");
    if (togglingIds.has(artistId)) return;
    setTogglingIds((prev) => new Set(prev).add(artistId));
    const isWatched = watchlistedIds.has(artistId);
    try {
      const res = await fetch("/api/watchlist", {
        method: isWatched ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId }),
      });
      if (res.ok) {
        setWatchlistedIds((prev) => {
          const next = new Set(prev);
          isWatched ? next.delete(artistId) : next.add(artistId);
          return next;
        });
        setArtists((prev) =>
          prev.map((a) =>
            a.id === artistId
              ? { ...a, watchlistCount: a.watchlistCount + (isWatched ? -1 : 1) }
              : a
          )
        );
      }
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(artistId);
        return next;
      });
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return signIn("google");
    const validLinks = reqLinks.filter((l) => l.url.trim());
    const linksStr = validLinks.map((l) => l.url.trim()).join("\n");
    if (!linksStr) return;
    const res = await fetch("/api/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: reqName, links: linksStr, reason: reqReason }),
    });
    if (res.ok) {
      setRequestSent(true);
      setTimeout(() => {
        setShowRequest(false);
        setRequestSent(false);
        setReqName("");
        setReqLinks([{ platform: "YOUTUBE", url: "" }]);
        setReqReason("");
      }, 2000);
    }
  }

  async function addArtist(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);

    // Require Spotify link
    const hasSpotify = addLinks.some(
      (l) => l.platform === "SPOTIFY" && l.url.trim()
    );
    if (!hasSpotify) {
      setAddError("A Spotify link is required.");
      return;
    }

    setAddSubmitting(true);
    const validLinks = addLinks.filter((l) => l.url.trim());
    try {
      const res = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          links: validLinks.map((l) => ({
            platform: l.platform,
            url: l.url,
            handle: l.handle || extractHandleFromUrl(l.platform, l.url) || undefined,
          })),
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setAddLinks([{ platform: "SPOTIFY", url: "", handle: "" }]);
        setAddError(null);
        loadArtists(search, platform);
      } else {
        const data = await res.json().catch(() => ({}));
        setAddError(data.error || "Failed to add artist.");
      }
    } finally {
      setAddSubmitting(false);
    }
  }

  async function previewSpotifyLink(index: number, url: string) {
    setAddLinks((prev) =>
      prev.map((link, currentIndex) =>
        currentIndex === index
          ? {
              ...link,
              spotifyPreviewLoading: true,
              spotifyPreviewError: null,
            }
          : link
      )
    );

    const artistIdMatch = url.match(/\/artist\/([a-zA-Z0-9]+)/);
    setAddLinks((prev) =>
      prev.map((link, currentIndex) =>
        currentIndex === index && link.url.trim() === url
          ? {
              ...link,
              spotifyPreviewUrl: url,
              spotifyPreviewLoading: false,
              spotifyPreviewName: null,
              spotifyPreviewImageUrl: null,
              spotifyPreviewPlatformId: artistIdMatch?.[1] ?? null,
              spotifyPreviewFollowerCount: 0,
              spotifyPreviewError: null,
            }
          : link
      )
    );
  }

  const top3 = artists.slice(0, 3);
  const rest = artists.slice(3);
  const totalWatchlists = artists.reduce((s, a) => s + a.watchlistCount, 0);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans overflow-hidden relative">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-5xl mx-auto relative z-10">
        {/* ── Header ── */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase flex items-center gap-4">
              <Flame className="w-10 h-10 md:w-14 md:h-14 text-[var(--accent)]" />
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-400 to-[#c026d3]">
                Phonk Ranks
              </span>
            </h1>
            <p className="text-[var(--muted-foreground)] mt-2 text-base md:text-lg max-w-lg">
              The definitive ranking of Phonk artists — watchlist your favorites to boost their rank.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            {isPrivileged && (
              <button
                onClick={() => setShowAdd(true)}
                className="px-5 py-3 rounded-xl font-bold bg-[var(--accent)] hover:bg-[#a21caf] transition-all flex items-center gap-2 shadow-[0_0_20px_var(--accent-glow)] text-white"
              >
                <PlusCircle className="w-5 h-5" /> Add Artist
              </button>
            )}
            <button
              onClick={() =>
                session ? setShowRequest(true) : signIn("google")
              }
              className="px-5 py-3 rounded-xl font-bold border border-[var(--muted)] hover:border-[var(--accent)] transition-all flex items-center gap-2"
            >
              <Send className="w-5 h-5" /> Request to Join
            </button>
          </div>
        </header>

        {/* ── Stats ── */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            {
              icon: Trophy,
              iconColor: "text-yellow-400",
              label: "Most Watched",
              value: top3[0]?.name ?? "—",
            },
            {
              icon: Users,
              iconColor: "text-blue-400",
              label: "Artists",
              value: String(totalCount),
            },
            {
              icon: TrendingUp,
              iconColor: "text-[var(--accent)]",
              label: "Total Watchlists",
              value: String(totalWatchlists),
            },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-[var(--secondary)]/80 border border-[var(--muted)] rounded-2xl p-5 text-center"
            >
              <s.icon className={`w-6 h-6 ${s.iconColor} mx-auto mb-2`} />
              <div className="text-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-widest">
                {s.label}
              </div>
              <div className="text-xl font-black mt-1 truncate">{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── Podium (top 3) ── */}
        {!loading && artists.length >= 3 && !search && (
          <div className="grid grid-cols-3 gap-4 md:gap-6 mb-12 items-end max-w-2xl mx-auto">
            {top3.map((artist, i) => (
              <PodiumCard
                key={artist.id}
                artist={artist}
                rank={i}
                isWatched={watchlistedIds.has(artist.id)}
                onToggle={() => toggleWatchlist(artist.id)}
                toggling={togglingIds.has(artist.id)}
                platform={platform}
              />
            ))}
          </div>
        )}

        {/* ── Platform Tabs + Search ── */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => handlePlatform(p.key)}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                  platform === p.key
                    ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                    : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-white border border-[var(--muted)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search artists..."
              className="w-full bg-[var(--secondary)] border border-[var(--muted)] rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600"
            />
          </div>
        </div>

        {/* ── Leaderboard List ── */}
        {loading ? (
          <LeaderboardPageSkeleton />
        ) : artists.length === 0 ? (
          <div className="text-center text-[var(--muted-foreground)] py-20">
            {search || platform
              ? "No artists match your filters."
              : "No artists yet. Be the first to request one!"}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {(() => {
              const showPodium = !search && artists.length >= 3;
              const listArtists = showPodium ? rest : artists;
              return listArtists.map((artist, idx) => {
              const rc = rankChanges[artist.id];
              const rank = showPodium ? idx + 3 : idx;
              const isWatched = watchlistedIds.has(artist.id);
              return (
                <div
                  key={artist.id}
                  className="group flex items-center gap-4 px-5 py-3.5 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 hover:bg-[var(--muted)] transition-all"
                >
                  {/* Rank + Change */}
                  <div className="w-12 flex flex-col items-center shrink-0">
                    <span className="font-black text-lg tabular-nums text-[var(--muted-foreground)]">
                      {rank + 1}
                    </span>
                    {rc && rc.rankChange !== 0 && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-bold leading-none ${rc.rankChange > 0 ? "text-green-400" : "text-red-400"}`}>
                        {rc.rankChange > 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {Math.abs(rc.rankChange)}
                      </span>
                    )}
                    {rc && rc.rankChange === 0 && rc.previousRank !== null && (
                      <Minus className="w-3 h-3 text-zinc-600" />
                    )}
                  </div>

                  {/* Avatar */}
                  <Link href={`/artist/${artist.id}`} className="shrink-0">
                    {artist.imageUrl ? (
                      <Image
                        src={artist.imageUrl}
                        alt={artist.name}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover border border-[var(--muted)] group-hover:border-[var(--accent)] transition-colors"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center border border-[var(--muted)]">
                        <span className="font-bold text-sm text-[var(--muted-foreground)]">
                          {artist.name.charAt(0)}
                        </span>
                      </div>
                    )}
                  </Link>

                  {/* Name + platform stats */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/artist/${artist.id}`}
                      className="font-bold text-base group-hover:text-[var(--accent)] transition-colors truncate block"
                    >
                      {artist.name}
                    </Link>
                    <div className="flex gap-3 mt-1 flex-wrap">
                      {(() => {
                        // When filtering by platform, show that platform's metric prominently
                        if (platform) {
                          const link = artist.links.find((l) => l.platform === platform);
                          if (link) {
                            return (
                              <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[link.platform] ?? "bg-zinc-500"}`} />
                                <span className="tabular-nums">
                                  {formatCount(link.followerCount)} {PLATFORM_STAT_LABEL[link.platform] ?? ""}
                                </span>
                              </span>
                            );
                          }
                          return null;
                        }
                        // Default tab: show Spotify monthly listeners + followers as secondary
                        const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
                        return (
                          <>
                            {spotifyLink && spotifyLink.monthlyListeners > 0 && (
                              <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                <span className="w-2 h-2 rounded-full shrink-0 bg-green-400" />
                                <span className="tabular-nums">
                                  {formatCount(spotifyLink.monthlyListeners)} listeners
                                </span>
                              </span>
                            )}
                            {spotifyLink && spotifyLink.followerCount > 0 && (
                              <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                <span className="w-2 h-2 rounded-full shrink-0 bg-green-700" />
                                <span className="tabular-nums">
                                  {formatCount(spotifyLink.followerCount)} followers
                                </span>
                              </span>
                            )}
                            {artist.links.filter((l) => l.platform !== "SPOTIFY").map((l) => (
                              <a
                                key={l.id}
                                href={l.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-white transition-colors"
                              >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[l.platform] ?? "bg-zinc-500"}`} />
                                {l.followerCount > 0 ? (
                                  <span className="tabular-nums">
                                    {formatCount(l.followerCount)} {PLATFORM_STAT_LABEL[l.platform] ?? ""}
                                  </span>
                                ) : getDisplayHandle(l) ? (
                                  <span>@{getDisplayHandle(l)}</span>
                                ) : null}
                              </a>
                            ))}
                            {isPrivileged && (() => {
                              const existing = new Set(artist.links.map((l) => l.platform));
                              const missing = Object.keys(PLATFORM_DOT).filter((p) => !existing.has(p));
                              return missing.map((p) => (
                                <button
                                  key={p}
                                  onClick={(e) => { e.stopPropagation(); openLinkModal(artist.id, artist.name, p); }}
                                  className="flex items-center gap-0.5 text-xs opacity-40 hover:opacity-100 transition-opacity"
                                  title={`Add ${p.charAt(0) + p.slice(1).toLowerCase()}`}
                                >
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[p]}`} />
                                  <X className="w-2.5 h-2.5 text-red-400" />
                                </button>
                              ));
                            })()}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Watchlist */}
                  <button
                    onClick={() => toggleWatchlist(artist.id)}
                    disabled={togglingIds.has(artist.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all shrink-0 disabled:opacity-60 ${
                      isWatched
                        ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
                    }`}
                  >
                    {togglingIds.has(artist.id) ? (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Star
                        className={`w-4 h-4 ${isWatched ? "fill-current" : ""}`}
                      />
                    )}
                    <span className="tabular-nums">
                      {artist.watchlistCount}
                    </span>
                  </button>
                </div>
              );
            });
            })()}
          </div>
        )}

        {/* Load More */}
        {!loading && artists.length < totalCount && (
          <div className="flex justify-center mt-6">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-6 py-3 rounded-xl font-bold border border-[var(--muted)] hover:border-[var(--accent)] bg-[var(--secondary)]/80 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              {loadingMore ? "Loading..." : `Load More (${artists.length} / ${totalCount})`}
            </button>
          </div>
        )}
      </div>

      {/* ── Request to Join Modal ── */}
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
              Submit an artist with their social links. A moderator will review
              it.
            </p>
            {requestSent ? (
              <div className="text-green-400 font-bold text-center py-8">
                Request submitted!
              </div>
            ) : (
              <form onSubmit={submitRequest} className="flex flex-col gap-3">
                <input
                  required
                  placeholder="Artist name"
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />

                <div className="text-xs font-bold uppercase text-[var(--muted-foreground)] mt-2">
                  Platform Links
                </div>
                {reqLinks.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <select
                      value={link.platform}
                      onChange={(e) =>
                        setReqLinks((prev) =>
                          prev.map((l, j) =>
                            j === i ? { ...l, platform: e.target.value } : l
                          )
                        )
                      }
                      className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none w-32"
                    >
                      {ALL_PLATFORMS.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      placeholder="URL"
                      value={link.url}
                      onChange={(e) =>
                        setReqLinks((prev) =>
                          prev.map((l, j) =>
                            j === i ? { ...l, url: e.target.value } : l
                          )
                        )
                      }
                      className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none flex-1 focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                    />
                    {reqLinks.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setReqLinks((prev) => prev.filter((_, j) => j !== i))
                        }
                        className="text-[var(--muted-foreground)] hover:text-red-400 p-1"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setReqLinks((prev) => [
                      ...prev,
                      { platform: "YOUTUBE", url: "" },
                    ])
                  }
                  className="text-[var(--accent)] text-sm font-bold flex items-center gap-1 hover:underline w-max"
                >
                  <PlusCircle className="w-4 h-4" /> Add another link
                </button>

                <textarea
                  placeholder="Why should they be added? (optional)"
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  rows={2}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  className="mt-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all"
                >
                  Submit Request
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Admin Add Artist Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowAdd(false)}
              className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-4">Add Artist</h2>
            <form onSubmit={addArtist} className="flex flex-col gap-3">
              {addError && (
                <div className="text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">
                  {addError}
                </div>
              )}

              <div className="text-xs font-bold uppercase text-[var(--muted-foreground)]">
                Spotify Link (required)
              </div>
              <input
                required
                placeholder="https://open.spotify.com/artist/..."
                value={addLinks[0]?.url ?? ""}
                onChange={(e) =>
                  setAddLinks((prev) =>
                    prev.map((l, j) =>
                      j === 0
                        ? {
                            ...l,
                            url: e.target.value,
                            spotifyPreviewUrl: undefined,
                            spotifyPreviewName: null,
                            spotifyPreviewImageUrl: null,
                            spotifyPreviewPlatformId: null,
                            spotifyPreviewFollowerCount: 0,
                            spotifyPreviewLoading: false,
                            spotifyPreviewError: null,
                          }
                        : l
                    )
                  )
                }
                className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
              />
              {addLinks[0]?.url.trim() && (
                <div className="rounded-xl border border-[var(--muted)] bg-[var(--muted)]/50 px-3 py-2.5 text-sm">
                  {addLinks[0].spotifyPreviewLoading ? (
                    <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Looking up Spotify artist...
                    </div>
                  ) : isValidSpotifyArtistUrl(addLinks[0].url) ? (
                    <div className="text-green-400 flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      URL accepted — name and image will be fetched from Spotify
                    </div>
                  ) : (
                    <div className="text-[var(--muted-foreground)]">Paste a valid Spotify artist URL</div>
                  )}
                </div>
              )}

              <div className="text-xs font-bold uppercase text-[var(--muted-foreground)] mt-2">
                Additional Links (optional)
              </div>
              {addLinks.slice(1).map((link, idx) => {
                const i = idx + 1;
                return (
                <div key={i} className="flex gap-2">
                  <select
                    value={link.platform}
                    onChange={(e) =>
                      setAddLinks((prev) =>
                        prev.map((l, j) =>
                          j === i ? { ...l, platform: e.target.value } : l
                        )
                      )
                    }
                    className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none w-32"
                  >
                    {ALL_PLATFORMS.filter((p) => p.key !== "SPOTIFY").map((p) => (
                      <option key={p.key} value={p.key}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="URL"
                    value={link.url}
                    onChange={(e) =>
                      setAddLinks((prev) =>
                        prev.map((l, j) =>
                          j === i ? { ...l, url: e.target.value } : l
                        )
                      )
                    }
                    className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none flex-1 focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAddLinks((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="text-[var(--muted-foreground)] hover:text-red-400 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                );
              })}
              <button
                type="button"
                onClick={() =>
                  setAddLinks((prev) => [
                    ...prev,
                    { platform: "YOUTUBE", url: "", handle: "" },
                  ])
                }
                className="text-[var(--accent)] text-sm font-bold flex items-center gap-1 hover:underline w-max"
              >
                <PlusCircle className="w-4 h-4" /> Add another link
              </button>

              <button
                type="submit"
                disabled={addSubmitting}
                className="mt-2 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {addSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Add to Leaderboard
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Link Modal (admin, from leaderboard) ── */}
      {showLinkModal && linkModalArtistId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
            <button onClick={() => setShowLinkModal(false)} className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black mb-1">Add Link</h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">
              Add a {linkModalPlatform.charAt(0) + linkModalPlatform.slice(1).toLowerCase()} link for <strong className="text-white">{linkModalArtistName}</strong>
            </p>
            <form onSubmit={submitLinkModal} className="flex flex-col gap-3">
              <select value={linkModalPlatform} onChange={(e) => { setLinkModalPlatform(e.target.value); setLinkModalUrl(""); setLinkModalYtResults([]); setLinkModalYtQuery(e.target.value === "YOUTUBE" ? linkModalArtistName : ""); }} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]">
                {ALL_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              {linkModalPlatform === "YOUTUBE" ? (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <input
                      placeholder="Search YouTube channel..."
                      value={linkModalYtQuery}
                      onChange={(e) => setLinkModalYtQuery(e.target.value)}
                      className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500 w-full"
                    />
                    {linkModalYtSearching && (
                      <RefreshCw className="w-4 h-4 animate-spin absolute right-3 top-2.5 text-[var(--muted-foreground)]" />
                    )}
                  </div>
                  {linkModalYtResults.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {linkModalYtResults.map((ch) => (
                        <button
                          key={ch.platformId}
                          type="button"
                          onClick={() => {
                            setLinkModalUrl(`https://www.youtube.com/${ch.handle ? `@${ch.handle}` : `channel/${ch.platformId}`}`);
                            setLinkModalYtQuery(ch.name);
                            setLinkModalYtResults([]);
                          }}
                          className={`flex items-center gap-4 p-3 rounded-xl border transition-all text-left ${
                            linkModalUrl.includes(ch.platformId ?? "___")
                              ? "border-red-500 bg-red-950/30"
                              : "border-[var(--muted)] bg-[var(--muted)]/30 hover:border-red-500/50 hover:bg-red-950/10"
                          }`}
                        >
                          {ch.imageUrl ? (
                            <img src={ch.imageUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-red-950/50 flex items-center justify-center shrink-0">
                              <span className="text-lg font-black text-red-400">{ch.name.charAt(0)}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-bold truncate">{ch.name}</div>
                            {ch.handle && <div className="text-xs text-[var(--muted-foreground)]">@{ch.handle}</div>}
                            <div className="text-sm text-red-400 font-bold tabular-nums mt-0.5">{formatCount(ch.subscriberCount)} subscribers</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {!linkModalYtResults.length && !linkModalYtSearching && (
                    <input type="url" placeholder="Or paste YouTube URL manually..." value={linkModalUrl} onChange={(e) => setLinkModalUrl(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                  )}
                </div>
              ) : (
                <input required type="url" placeholder="https://..." value={linkModalUrl} onChange={(e) => setLinkModalUrl(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
              )}
              <button type="submit" disabled={linkModalSubmitting || !linkModalUrl.trim()} className="mt-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {linkModalSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Apply Link
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
