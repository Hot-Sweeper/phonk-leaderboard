"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSession, signIn } from "next-auth/react";
import Image from "next/image";
import { useDetailPanel } from "@/lib/detail-panel";
import { Skeleton } from "@/components/Skeleton";
import { clearSessionCacheByPrefix, fetchJsonWithSessionCache } from "@/lib/client-cache";
import { SpotifyIcon, YouTubeIcon, TikTokIcon, InstagramIcon } from "@/components/platform-icons";
import {
  Trophy,
  Users,
  PlusCircle,
  Flame,
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

const ALL_PLATFORMS = [
  { key: "YOUTUBE", label: "YouTube" },
  { key: "SPOTIFY", label: "Spotify" },
  { key: "TIKTOK", label: "TikTok" },
  { key: "INSTAGRAM", label: "Instagram" },
];

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

const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  YOUTUBE: YouTubeIcon,
  SPOTIFY: SpotifyIcon,
  TIKTOK: TikTokIcon,
  INSTAGRAM: InstagramIcon,
};

const PLATFORM_COLOR: Record<string, string> = {
  YOUTUBE: "text-red-400",
  SPOTIFY: "text-green-400",
  TIKTOK: "text-cyan-400",
  INSTAGRAM: "text-fuchsia-400",
};

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
      const reserved = new Set(["p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct"]);
      return reserved.has(handle.toLowerCase()) ? null : handle;
    }
    return null;
  } catch {
    return null;
  }
}

function getDisplayHandle(link: ArtistLink): string | null {
  return link.handle ?? extractHandleFromUrl(link.platform, link.url);
}

function ListSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-5 space-y-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4 items-end max-w-2xl mx-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={`rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-4 ${i === 1 ? "md:-mt-8" : ""}`}>
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="h-24 w-24 rounded-full" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 px-5 py-4 flex items-center gap-4">
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

// ─── Color extraction from profile picture ─────────────────────────────────

function nameToRgb(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const h = Math.abs(hash) % 360;
  // HSL(h, 70%, 60%) → RGB
  const s = 0.7, l = 0.6;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return `${f(0)}, ${f(8)}, ${f(4)}`;
}

function useExtractColor(imageUrl: string | null, fallbackName: string): string {
  const [rgb, setRgb] = useState<string>(() => nameToRgb(fallbackName));
  useEffect(() => {
    if (!imageUrl) return;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 12;
        canvas.height = 12;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 12, 12);
        const data = ctx.getImageData(0, 0, 12, 12).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 10) continue; // skip transparent
          r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
        }
        if (count > 0) setRgb(`${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)}`);
      } catch { /* CORS blocked — keep name-hash fallback */ }
    };
    img.src = imageUrl;
  }, [imageUrl]);
  return rgb;
}

// ─── Change-mode podium card ─────────────────────────────────────────────────

type ChangeItemForPodium = {
  id: string;
  name: string;
  imageUrl: string | null;
  watchlistCount: number;
  currentValue: number;
  changePercent: number;
  hasData: boolean;
  metric: string;
};

function ChangePodiumCard({
  item,
  position,
  isWatched,
  onToggle,
  toggling,
  openArtist,
}: {
  item: ChangeItemForPodium;
  position: 0 | 1 | 2;
  isWatched: boolean;
  onToggle: () => void;
  toggling: boolean;
  openArtist: (id: string) => void;
}) {
  const accentHex = useExtractColor(item.imageUrl, item.name);
  const isFirst = position === 0;
  const isUp = item.changePercent > 0;
  const isDown = item.changePercent < 0;

  const sizes = {
    0: { height: "h-[220px] md:h-[260px]", fadeStop: "90%", artSize: "w-28 h-28 md:w-40 md:h-40", titleSize: "text-base md:text-xl" },
    1: { height: "h-[160px] md:h-[190px]", fadeStop: "80%", artSize: "w-24 h-24 md:w-32 md:h-32", titleSize: "text-sm md:text-lg" },
    2: { height: "h-[140px] md:h-[160px]", fadeStop: "75%", artSize: "w-24 h-24 md:w-32 md:h-32", titleSize: "text-sm md:text-lg" },
  }[position];

  return (
    <div className={`w-full flex-1 flex flex-col items-center justify-end h-full relative group ${isFirst ? "z-20" : "z-10"}`}>
      {/* Background Aura */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[150%] h-[120%] max-h-[300px] rounded-full blur-[100px] opacity-10 md:opacity-[0.15] pointer-events-none transition-opacity duration-700 group-hover:opacity-20"
        style={{ backgroundColor: `rgb(${accentHex})` }}
      />

      {/* Floating Avatar + Info */}
      <div className="relative z-30 flex flex-col items-center group-hover:-translate-y-3 transition-transform duration-500">
        {/* Avatar */}
        <button onClick={() => openArtist(item.id)} className="cursor-pointer">
          <div
            className={`relative ${sizes.artSize} rounded-full overflow-hidden ring-[3px] ring-offset-2 ring-offset-[var(--background)] transition-all duration-300 z-20 mb-3`}
            style={{
              boxShadow: `0 0 60px rgba(${accentHex}, 0.4)`,
              outline: `3px solid rgba(${accentHex}, 0.8)`,
              outlineOffset: "2px",
            }}
          >
            {item.imageUrl ? (
              <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="(max-width: 768px) 112px, 160px" />
            ) : (
              <div className="w-full h-full bg-zinc-900/80 flex items-center justify-center">
                <span className="text-3xl md:text-4xl font-black text-zinc-500">{item.name.charAt(0)}</span>
              </div>
            )}
          </div>
        </button>
        {/* Name */}
        <button onClick={() => openArtist(item.id)} className={`font-black text-white leading-tight line-clamp-2 text-center drop-shadow-md mb-0.5 hover:text-[var(--accent)] transition-colors cursor-pointer ${sizes.titleSize}`}>
          {item.name}
        </button>
        {/* Change badge */}
        {item.hasData && (
          <span className={`flex items-center gap-1 text-xs font-bold tabular-nums px-2 py-0.5 rounded-lg mb-3 ${isUp ? "bg-green-500/20 text-green-400" : isDown ? "bg-red-500/20 text-red-400" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
            {isUp ? <ArrowUpRight className="w-3 h-3" /> : isDown ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {item.changePercent > 0 ? "+" : ""}{item.changePercent.toFixed(1)}%
          </span>
        )}
      </div>

      {/* 2.5D Podium Base */}
      <div className="relative w-full flex flex-col items-center z-0">
        {/* Top Glass Surface */}
        <div
          className="absolute top-0 -translate-y-1/2 w-[94%] md:w-[96%] h-[20px] md:h-[28px] rounded-[100%] border-t-[2px] border-b border-x z-20 flex items-center justify-center backdrop-blur-xl shadow-2xl"
          style={{
            background: `linear-gradient(to bottom, rgba(${accentHex}, 0.35), rgba(${accentHex}, 0.12))`,
            borderColor: `rgba(${accentHex}, 0.7)`,
            boxShadow: `0 0 50px rgba(${accentHex}, 0.35) inset`,
          }}
        >
          <div className="w-[55%] h-[35%] rounded-[100%] bg-white/[0.06] border border-white/10 mix-blend-overlay" />
        </div>

        {/* Extruded Base Column */}
        <div
          className={`w-[92%] md:w-[96%] ${sizes.height} relative overflow-hidden flex flex-col items-center justify-center z-10 border-x border-white/[0.08] group-hover:brightness-125 transition-all duration-500`}
          style={{
            background: `linear-gradient(to bottom, rgba(${accentHex}, 0.3), rgba(${accentHex}, 0.12), rgba(${accentHex}, 0.05))`,
            backgroundImage: `radial-gradient(circle at center, rgba(255,255,255,0.12) 1px, transparent 1px)`,
            backgroundSize: `10px 10px`,
            WebkitMaskImage: `linear-gradient(to bottom, black 0%, black ${sizes.fadeStop}, transparent 100%)`,
            maskImage: `linear-gradient(to bottom, black 0%, black ${sizes.fadeStop}, transparent 100%)`,
          }}
        >
          {/* Light streaks */}
          <div className="absolute inset-y-0 left-[15%] w-6 md:w-10 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mix-blend-overlay skew-x-12" />
          <div className="absolute inset-y-0 right-[20%] w-3 md:w-5 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent mix-blend-overlay -skew-x-12" />

          {/* Watchlist button */}
          <div className="relative z-30 flex flex-col items-center">
            <button
              onClick={onToggle}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-60 shadow-2xl ${
                isWatched ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]" : "bg-black/50 border border-white/20 text-white hover:bg-white hover:text-black hover:scale-105"
              }`}
            >
              {toggling ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Star className={`w-3.5 h-3.5 ${isWatched ? "fill-current" : ""}`} />}
              <span className="tabular-nums">{item.watchlistCount}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PodiumCard({
  artist,
  rank,
  isWatched,
  onToggle,
  toggling,
  platform,
  openArtist,
}: {
  artist: Artist;
  rank: number;
  isWatched: boolean;
  onToggle: () => void;
  toggling: boolean;
  platform: string;
  openArtist: (id: string) => void;
}) {
  const isFirst = rank === 0;

  const theme = {
    0: {
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
      artSize: "w-28 h-28 md:w-40 md:h-40",
      titleSize: "text-base md:text-xl",
      numberSize: "text-[100px] md:text-[160px]",
    },
    1: {
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
      artSize: "w-24 h-24 md:w-32 md:h-32",
      titleSize: "text-sm md:text-lg",
      numberSize: "text-[80px] md:text-[130px]",
    },
    2: {
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
      artSize: "w-24 h-24 md:w-32 md:h-32",
      titleSize: "text-sm md:text-lg",
      numberSize: "text-[80px] md:text-[130px]",
    },
  }[rank as 0 | 1 | 2];

  const platformColors: Record<string, string> = { "": "text-green-400", YOUTUBE: "text-red-400", INSTAGRAM: "text-fuchsia-400", TIKTOK: "text-cyan-400" };

  const statLine = (() => {
    const color = platformColors[platform] ?? "text-green-400";
    if (!platform || platform === "") {
      const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
      if (spotifyLink && spotifyLink.monthlyListeners > 0) return { text: `${formatCount(spotifyLink.monthlyListeners)} listeners`, color };
    } else {
      const link = artist.links.find((l) => l.platform === platform);
      if (link && link.followerCount > 0) {
        const label = platform === "YOUTUBE" ? "subs" : "followers";
        return { text: `${formatCount(link.followerCount)} ${label}`, color };
      }
    }
    return null;
  })();

  return (
    <div className={`w-full flex-1 flex flex-col items-center justify-end h-full relative group ${isFirst ? "z-20" : "z-10"}`}>
      {/* Background Aura */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[150%] h-[120%] max-h-[300px] rounded-full blur-[100px] opacity-10 md:opacity-[0.15] pointer-events-none transition-opacity duration-700 group-hover:opacity-20" style={{ backgroundColor: `rgb(${theme.accentHex})` }} />

      {/* Floating Avatar + Info */}
      <div className="relative z-30 flex flex-col items-center group-hover:-translate-y-3 transition-transform duration-500">
        {/* Trophy for #1 */}
        {isFirst && (
          <div className="mb-1">
            <Trophy className="w-7 h-7 text-yellow-400 fill-yellow-400/30" />
          </div>
        )}
        {/* Avatar */}
        <button onClick={() => openArtist(artist.id)} className="cursor-pointer">
          <div className={`relative ${theme.artSize} rounded-full overflow-hidden ring-[3px] ring-offset-2 ring-offset-[var(--background)] ${theme.artRing} ${theme.artGlow} transition-all duration-300 z-20 mb-3`}>
            {artist.imageUrl ? (
              <Image src={artist.imageUrl} alt={artist.name} fill className="object-cover" sizes="(max-width: 768px) 112px, 160px" />
            ) : (
              <div className="w-full h-full bg-zinc-900/80 flex items-center justify-center">
                <span className="text-3xl md:text-4xl font-black text-zinc-500">{artist.name.charAt(0)}</span>
              </div>
            )}
          </div>
        </button>
        {/* Name */}
        <button onClick={() => openArtist(artist.id)} className={`font-black text-white leading-tight line-clamp-2 text-center drop-shadow-md mb-0.5 hover:text-[var(--accent)] transition-colors cursor-pointer ${theme.titleSize}`}>
          {artist.name}
        </button>
        {/* Stat line */}
        {statLine && <span className={`text-[10px] md:text-xs ${statLine.color} font-bold tabular-nums mb-1`}>{statLine.text}</span>}
        {/* Platform icons */}
        <div className="flex gap-1.5 mb-3">
          {artist.links.map((l) => {
            const Icon = PLATFORM_ICON[l.platform];
            const color = PLATFORM_COLOR[l.platform] ?? "text-zinc-400";
            return Icon ? <Icon key={l.id} className={`w-3.5 h-3.5 ${color}`} /> : null;
          })}
        </div>
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
            maskImage: `linear-gradient(to bottom, black 0%, black ${theme.fadeStop}, transparent 100%)`,
          }}
        >
          {/* Giant Rank Number */}
          <div className={`absolute inset-x-0 top-0 bottom-0 flex items-start justify-center pt-2 md:pt-3 select-none pointer-events-none ${theme.numberColor}`}>
            <span className={`font-black italic ${theme.numberSize} leading-none tracking-tighter`} style={{ textShadow: `0 0 40px rgba(${theme.accentHex}, 0.5), 0 0 80px rgba(${theme.accentHex}, 0.2)`, WebkitTextStroke: `1px rgba(${theme.accentHex}, 0.08)` }}>
              {rank + 1}
            </span>
          </div>

          {/* Light streaks */}
          <div className="absolute inset-y-0 left-[15%] w-6 md:w-10 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent mix-blend-overlay skew-x-12" />
          <div className="absolute inset-y-0 right-[20%] w-3 md:w-5 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent mix-blend-overlay -skew-x-12" />

          {/* Watchlist button centered */}
          <div className="relative z-30 flex flex-col items-center">
            <button
              onClick={onToggle}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-60 shadow-2xl ${
                isWatched ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]" : "bg-black/50 border border-white/20 text-white hover:bg-white hover:text-black hover:scale-105"
              }`}
            >
              {toggling ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Star className={`w-3.5 h-3.5 ${isWatched ? "fill-current" : ""}`} />}
              <span className="tabular-nums">{artist.watchlistCount}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ArtistListViewProps {
  platform: string;
  search: string;
  sortMode?: "current" | "change";
  period?: string;
  changeSortOrder?: "desc" | "asc" | "abs";
}

type AllChanges = {
  listeners: number | null;
  followers: number | null;
  youtube: number | null;
  tiktok: number | null;
  instagram: number | null;
  listenersCurrent: number;
  followersCurrent: number;
  youtubeCurrent: number;
  tiktokCurrent: number;
  instagramCurrent: number;
};

type ChangeItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  watchlistCount: number;
  currentValue: number;
  changePercent: number;
  hasData: boolean;
  metric: string;
  allChanges?: AllChanges;
};

export default function ArtistListView({ platform, search, sortMode = "current", period = "day", changeSortOrder = "desc" }: ArtistListViewProps) {
  const { data: session } = useSession();
  const { openArtist } = useDetailPanel();
  const [artists, setArtists] = useState<Artist[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingPodium, setLoadingPodium] = useState(true);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [watchlistedIds, setWatchlistedIds] = useState<Set<string>>(new Set());
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [rankChanges, setRankChanges] = useState<Record<string, { currentRank: number; previousRank: number | null; rankChange: number }>>({});
  const [changeItems, setChangeItems] = useState<ChangeItem[]>([]);
  const [loadingChange, setLoadingChange] = useState(false);

  const isChangeMode = sortMode === "change";

  const sortedChangeItems = useMemo(() => {
    if (!changeItems.length) return changeItems;
    return [...changeItems].sort((a, b) => {
      if (changeSortOrder === "desc") return b.changePercent - a.changePercent;
      if (changeSortOrder === "asc") return a.changePercent - b.changePercent;
      return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    });
  }, [changeItems, changeSortOrder]);
  // Request modal
  const [showRequest, setShowRequest] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqLinks, setReqLinks] = useState<{ platform: string; url: string }[]>([{ platform: "YOUTUBE", url: "" }]);
  const [reqReason, setReqReason] = useState("");
  const [requestSent, setRequestSent] = useState(false);

  // Add artist modal (mod)
  const [showAdd, setShowAdd] = useState(false);
  const [addLinks, setAddLinks] = useState<AddLinkInput[]>([{ platform: "SPOTIFY", url: "", handle: "" }]);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSubmitting, setAddSubmitting] = useState(false);

  // Link modal (admin)
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkModalArtistId, setLinkModalArtistId] = useState<string | null>(null);
  const [linkModalArtistName, setLinkModalArtistName] = useState("");
  const [linkModalPlatform, setLinkModalPlatform] = useState("YOUTUBE");
  const [linkModalUrl, setLinkModalUrl] = useState("");
  const [linkModalSubmitting, setLinkModalSubmitting] = useState(false);
  const [linkModalYtQuery, setLinkModalYtQuery] = useState("");
  const [linkModalYtResults, setLinkModalYtResults] = useState<Array<{ name: string; imageUrl: string | null; subscriberCount: number; handle: string | null; platformId: string | null }>>([]);
  const [linkModalYtSearching, setLinkModalYtSearching] = useState(false);

  const isPrivileged = session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";
  const prevSearchRef = useRef(search);
  const prevPlatformRef = useRef(platform);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadArtists = useCallback(async (q = "", plat = "") => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (plat) params.set("platform", plat);

    // Phase 1: fetch top 3 for the podium
    const podiumParams = new URLSearchParams(params);
    podiumParams.set("take", "3");
    const podiumQs = podiumParams.toString();
    const podiumData = await fetchJsonWithSessionCache<{ artists: Artist[]; totalCount: number }>(
      `rank:artists:podium:${podiumQs}`,
      `/api/artists?${podiumQs}`,
      300_000
    ).catch(() => null);
    if (podiumData) {
      setArtists(podiumData.artists);
      setTotalCount(podiumData.totalCount);
    }
    setLoadingPodium(false);

    // Phase 2: fetch the full first page
    const qs = params.toString();
    const data = await fetchJsonWithSessionCache<{ artists: Artist[]; totalCount: number }>(
      `rank:artists:list:${qs || "default"}`,
      `/api/artists${qs ? `?${qs}` : ""}`,
      300_000
    ).catch(() => null);
    if (data) {
      setArtists(data.artists);
      setTotalCount(data.totalCount);
    }
    setLoadingList(false);
  }, []);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (platform) params.set("platform", platform);
    params.set("skip", String(artists.length));
    const qs = params.toString();
    const data = await fetchJsonWithSessionCache<{ artists: Artist[]; totalCount: number }>(
      `rank:artists:more:${qs}`,
      `/api/artists?${qs}`,
      300_000
    ).catch(() => null);
    if (data) {
      setArtists((prev) => [...prev, ...data.artists]);
      setTotalCount(data.totalCount);
    }
    setLoadingMore(false);
  }, [search, platform, artists.length]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const loadWatchlist = useCallback(async () => {
    const ids = await fetchJsonWithSessionCache<string[]>("watchlist:ids", "/api/watchlist", 120_000).catch(() => null);
    if (ids) {
      setWatchlistedIds(new Set(ids));
    }
  }, []);

  const loadRankChanges = useCallback(async () => {
    const ranks = await fetchJsonWithSessionCache<Record<string, { currentRank: number; previousRank: number | null; rankChange: number }>>(
      "rank:artists:changes",
      "/api/artists/ranks",
      300_000
    ).catch(() => null);
    if (ranks) setRankChanges(ranks);
  }, []);

  const METRIC_FOR_PLATFORM: Record<string, string> = { "": "listeners", SPOTIFY: "listeners", YOUTUBE: "youtube", TIKTOK: "tiktok", INSTAGRAM: "instagram" };

  const loadChangeArtists = useCallback(async (plat: string, p: string) => {
    const metric = METRIC_FOR_PLATFORM[plat] ?? "listeners";
    setLoadingChange(true);
    const data = await fetchJsonWithSessionCache<{ artists: ChangeItem[] }>(
      `rank:artists:change:${p}:${metric}`,
      `/api/artists/changes?period=${p}&metric=${metric}&mode=change&skip=0&take=200`,
      300_000
    ).catch(() => null);
    if (data) setChangeItems(data.artists ?? []);
    setLoadingChange(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial load
  useEffect(() => {
    loadArtists();
    loadWatchlist();
    loadRankChanges();
  }, [loadArtists, loadWatchlist, loadRankChanges]);

  // Load change data when change mode is active or params change
  useEffect(() => {
    if (isChangeMode) loadChangeArtists(platform, period);
  }, [isChangeMode, platform, period, loadChangeArtists]);

  // React to prop changes
  useEffect(() => {
    if (search !== prevSearchRef.current || platform !== prevPlatformRef.current) {
      prevSearchRef.current = search;
      prevPlatformRef.current = platform;
      setLoadingPodium(true);
      setLoadingList(true);
      loadArtists(search, platform);
    }
  }, [search, platform, loadArtists]);

  // YouTube channel search for link modal
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

  // Spotify preview for add modal
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    addLinks.forEach((link, index) => {
      const trimmedUrl = link.url.trim();
      if (link.platform !== "SPOTIFY" || !isValidSpotifyArtistUrl(trimmedUrl)) return;
      if (link.spotifyPreviewUrl === trimmedUrl || link.spotifyPreviewLoading) return;
      timers.push(setTimeout(() => { void previewSpotifyLink(index, trimmedUrl); }, 350));
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [addLinks]);

  // Auto-load more when sentinel is visible
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !loadingMore && !loadingList && artists.length < totalCount) loadMoreRef.current(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [artists.length, totalCount, loadingMore, loadingList, loadMore]);

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
          setArtists((prev) => prev.map((a) => a.id === linkModalArtistId ? { ...a, links: updated.links } : a));
        }
        setShowLinkModal(false);
      }
    } finally {
      setLinkModalSubmitting(false);
    }
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
        setArtists((prev) => prev.map((a) => a.id === artistId ? { ...a, watchlistCount: a.watchlistCount + (isWatched ? -1 : 1) } : a));
        clearSessionCacheByPrefix("watchlist:");
        clearSessionCacheByPrefix("rank:artists:");
        window.dispatchEvent(new Event("watchlist-changed"));
      }
    } finally {
      setTogglingIds((prev) => { const next = new Set(prev); next.delete(artistId); return next; });
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
      setTimeout(() => { setShowRequest(false); setRequestSent(false); setReqName(""); setReqLinks([{ platform: "YOUTUBE", url: "" }]); setReqReason(""); }, 2000);
    }
  }

  async function addArtist(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const hasSpotify = addLinks.some((l) => l.platform === "SPOTIFY" && l.url.trim());
    if (!hasSpotify) { setAddError("A Spotify link is required."); return; }
    setAddSubmitting(true);
    const validLinks = addLinks.filter((l) => l.url.trim());
    try {
      const res = await fetch("/api/artists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links: validLinks.map((l) => ({ platform: l.platform, url: l.url, handle: l.handle || extractHandleFromUrl(l.platform, l.url) || undefined })) }),
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
    setAddLinks((prev) => prev.map((link, i) => i === index ? { ...link, spotifyPreviewLoading: true, spotifyPreviewError: null } : link));
    const artistIdMatch = url.match(/\/artist\/([a-zA-Z0-9]+)/);
    setAddLinks((prev) => prev.map((link, i) => i === index && link.url.trim() === url ? { ...link, spotifyPreviewUrl: url, spotifyPreviewLoading: false, spotifyPreviewName: null, spotifyPreviewImageUrl: null, spotifyPreviewPlatformId: artistIdMatch?.[1] ?? null, spotifyPreviewFollowerCount: 0, spotifyPreviewError: null } : link));
  }

  const top3 = artists.slice(0, 3);
  const rest = artists.slice(3);
  const showPodium = !search && !isChangeMode && artists.length >= 3;

  // Listen for sidebar-triggered modal opens
  useEffect(() => {
    const handleAddArtist = () => setShowAdd(true);
    const handleRequest = () => session ? setShowRequest(true) : signIn("google");
    window.addEventListener("open-add-artist", handleAddArtist);
    window.addEventListener("open-request-join", handleRequest);
    return () => {
      window.removeEventListener("open-add-artist", handleAddArtist);
      window.removeEventListener("open-request-join", handleRequest);
    };
  }, [session]);

  if (loadingPodium) return <ListSkeleton />;

  return (
    <>

      {/* Podium */}
      {showPodium && (
        <div className="flex flex-row items-end justify-center h-[520px] md:h-[620px] gap-2 md:gap-5 mb-16 px-2 md:px-0 max-w-5xl mx-auto">
          <PodiumCard key={top3[1].id} artist={top3[1]} rank={1} isWatched={watchlistedIds.has(top3[1].id)} onToggle={() => toggleWatchlist(top3[1].id)} toggling={togglingIds.has(top3[1].id)} platform={platform} openArtist={openArtist} />
          <PodiumCard key={top3[0].id} artist={top3[0]} rank={0} isWatched={watchlistedIds.has(top3[0].id)} onToggle={() => toggleWatchlist(top3[0].id)} toggling={togglingIds.has(top3[0].id)} platform={platform} openArtist={openArtist} />
          <PodiumCard key={top3[2].id} artist={top3[2]} rank={2} isWatched={watchlistedIds.has(top3[2].id)} onToggle={() => toggleWatchlist(top3[2].id)} toggling={togglingIds.has(top3[2].id)} platform={platform} openArtist={openArtist} />
        </div>
      )}

      {/* Change mode list */}
      {isChangeMode && (
        loadingChange ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 px-5 py-4 flex items-center gap-4">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5"><Skeleton className="h-4 w-36 max-w-full" /><Skeleton className="h-3 w-24 max-w-full" /></div>
                <Skeleton className="h-7 w-20 rounded-lg" />
              </div>
            ))}
          </div>
        ) : changeItems.length === 0 ? (
          <div className="text-center text-[var(--muted-foreground)] py-20">No trend data yet for this period.</div>
        ) : (
          <>
            {/* Change Podium — top 3, profile-color themed */}
            {!search && sortedChangeItems.length >= 3 && (
              <div className="flex flex-row items-end justify-center h-[520px] md:h-[620px] gap-2 md:gap-5 mb-16 px-2 md:px-0 max-w-5xl mx-auto">
                <ChangePodiumCard
                  item={sortedChangeItems[1]}
                  position={1}
                  isWatched={watchlistedIds.has(sortedChangeItems[1].id)}
                  onToggle={() => toggleWatchlist(sortedChangeItems[1].id)}
                  toggling={togglingIds.has(sortedChangeItems[1].id)}
                  openArtist={openArtist}
                />
                <ChangePodiumCard
                  item={sortedChangeItems[0]}
                  position={0}
                  isWatched={watchlistedIds.has(sortedChangeItems[0].id)}
                  onToggle={() => toggleWatchlist(sortedChangeItems[0].id)}
                  toggling={togglingIds.has(sortedChangeItems[0].id)}
                  openArtist={openArtist}
                />
                <ChangePodiumCard
                  item={sortedChangeItems[2]}
                  position={2}
                  isWatched={watchlistedIds.has(sortedChangeItems[2].id)}
                  onToggle={() => toggleWatchlist(sortedChangeItems[2].id)}
                  toggling={togglingIds.has(sortedChangeItems[2].id)}
                  openArtist={openArtist}
                />
              </div>
            )}
            {/* Rest of the list */}
            <div className="flex flex-col gap-2">
              {(!search && sortedChangeItems.length >= 3 ? sortedChangeItems.slice(3) : sortedChangeItems).map((item, idx) => {
                const listRank = (!search && sortedChangeItems.length >= 3 ? idx + 3 : idx);
                const isWatched = watchlistedIds.has(item.id);
                const isUp = item.changePercent > 0;
                const isDown = item.changePercent < 0;
                return (
                  <div key={item.id} className="group flex items-center gap-4 px-5 py-3 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 hover:bg-[var(--muted)] transition-all">
                    {/* Rank */}
                    <div className="w-10 text-center shrink-0">
                      <span className="font-black text-lg tabular-nums text-[var(--muted-foreground)]">{listRank + 1}</span>
                    </div>
                    {/* Avatar */}
                    <button onClick={() => openArtist(item.id)} className="shrink-0 cursor-pointer">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover border border-[var(--muted)] group-hover:border-[var(--accent)] transition-colors" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center border border-[var(--muted)]">
                          <span className="font-bold text-sm text-[var(--muted-foreground)]">{item.name.charAt(0)}</span>
                        </div>
                      )}
                    </button>
                    {/* Name + Metric */}
                    <div className="flex-1 min-w-0">
                      <button onClick={() => openArtist(item.id)} className="font-bold text-base group-hover:text-[var(--accent)] transition-colors truncate block cursor-pointer text-left">{item.name}</button>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        <span className="text-xs text-[var(--muted-foreground)] tabular-nums">{formatCount(item.currentValue)} {item.metric}</span>
                      </div>
                    </div>
                    {/* Change badge */}
                    <div className="shrink-0 flex items-center gap-2">
                      {item.hasData ? (
                        <span className={`flex items-center gap-1 text-sm font-bold tabular-nums px-2.5 py-1 rounded-lg ${isUp ? "bg-green-500/15 text-green-400" : isDown ? "bg-red-500/15 text-red-400" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
                          {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : isDown ? <ArrowDownRight className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                          {item.changePercent > 0 ? "+" : ""}{item.changePercent.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)] opacity-50">No data</span>
                      )}
                      {/* Watchlist */}
                      <button
                        onClick={() => toggleWatchlist(item.id)}
                        disabled={togglingIds.has(item.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold transition-all shrink-0 disabled:opacity-60 ${isWatched ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"}`}
                      >
                        {togglingIds.has(item.id) ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Star className={`w-4 h-4 ${isWatched ? "fill-current" : ""}`} />}
                        <span className="tabular-nums">{item.watchlistCount}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      )}

      {/* Artist List (current mode) */}
      {!isChangeMode && (loadingList ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 px-5 py-4 flex items-center gap-4">
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
      ) : artists.length === 0 ? (
        <div className="text-center text-[var(--muted-foreground)] py-20">
          {search || platform ? "No artists match your filters." : "No artists yet. Be the first to request one!"}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(showPodium ? rest : artists).map((artist, idx) => {
            const rc = rankChanges[artist.id];
            const rank = showPodium ? idx + 3 : idx;
            const isWatched = watchlistedIds.has(artist.id);
            return (
              <div key={artist.id} className="group flex items-center gap-4 px-5 py-3.5 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 hover:bg-[var(--muted)] transition-all">
                {/* Rank + Change */}
                <div className="w-12 flex flex-col items-center shrink-0">
                  <span className="font-black text-lg tabular-nums text-[var(--muted-foreground)]">{rank + 1}</span>
                  {rc && rc.rankChange !== 0 && (
                    <span className={`flex items-center gap-0.5 text-[10px] font-bold leading-none ${rc.rankChange > 0 ? "text-green-400" : "text-red-400"}`}>
                      {rc.rankChange > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(rc.rankChange)}
                    </span>
                  )}
                  {rc && rc.rankChange === 0 && rc.previousRank !== null && <Minus className="w-3 h-3 text-zinc-600" />}
                </div>

                {/* Avatar */}
                <button onClick={() => openArtist(artist.id)} className="shrink-0 cursor-pointer">
                  {artist.imageUrl ? (
                    <Image src={artist.imageUrl} alt={artist.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover border border-[var(--muted)] group-hover:border-[var(--accent)] transition-colors" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center border border-[var(--muted)]">
                      <span className="font-bold text-sm text-[var(--muted-foreground)]">{artist.name.charAt(0)}</span>
                    </div>
                  )}
                </button>

                {/* Name + Stats */}
                <div className="flex-1 min-w-0">
                  <button onClick={() => openArtist(artist.id)} className="font-bold text-base group-hover:text-[var(--accent)] transition-colors truncate block cursor-pointer text-left">
                    {artist.name}
                  </button>
                  <div className="flex gap-3 mt-1 flex-wrap">
                    {(() => {
                      if (platform) {
                        const link = artist.links.find((l) => l.platform === platform);
                        if (link) {
                          return (
                            <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                              {(() => { const Icon = PLATFORM_ICON[link.platform]; const color = PLATFORM_COLOR[link.platform] ?? 'text-zinc-400'; return Icon ? <Icon className={`w-3 h-3 shrink-0 ${color}`} /> : <span className="w-2 h-2 rounded-full shrink-0 bg-zinc-500" />; })()}
                              <span className="tabular-nums">{formatCount(link.followerCount)} {PLATFORM_STAT_LABEL[link.platform] ?? ""}</span>
                            </span>
                          );
                        }
                        return null;
                      }
                      const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
                      return (
                        <>
                          {spotifyLink && spotifyLink.monthlyListeners > 0 && (
                            <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                              <SpotifyIcon className="w-3 h-3 shrink-0 text-green-400" />
                              <span className="tabular-nums">{formatCount(spotifyLink.monthlyListeners)} listeners</span>
                            </span>
                          )}
                          {spotifyLink && spotifyLink.followerCount > 0 && (
                            <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                              <SpotifyIcon className="w-3 h-3 shrink-0 text-green-600" />
                              <span className="tabular-nums">{formatCount(spotifyLink.followerCount)} followers</span>
                            </span>
                          )}
                          {artist.links.filter((l) => l.platform !== "SPOTIFY").map((l) => (
                            <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-white transition-colors">
                              {(() => { const Icon = PLATFORM_ICON[l.platform]; const color = PLATFORM_COLOR[l.platform] ?? 'text-zinc-400'; return Icon ? <Icon className={`w-3 h-3 shrink-0 ${color}`} /> : <span className="w-2 h-2 rounded-full shrink-0 bg-zinc-500" />; })()}
                              {l.followerCount > 0 ? (
                                <span className="tabular-nums">{formatCount(l.followerCount)} {PLATFORM_STAT_LABEL[l.platform] ?? ""}</span>
                              ) : getDisplayHandle(l) ? (
                                <span>@{getDisplayHandle(l)}</span>
                              ) : null}
                            </a>
                          ))}
                          {isPrivileged && (() => {
                            const existing = new Set(artist.links.map((l) => l.platform));
                            const missing = Object.keys(PLATFORM_DOT).filter((p) => !existing.has(p));
                            return missing.map((p) => (
                              <button key={p} onClick={(e) => { e.stopPropagation(); openLinkModal(artist.id, artist.name, p); }} className="flex items-center gap-0.5 text-xs opacity-40 hover:opacity-100 transition-opacity" title={`Add ${p.charAt(0) + p.slice(1).toLowerCase()}`}>
                                {(() => { const Icon = PLATFORM_ICON[p]; const color = PLATFORM_COLOR[p] ?? 'text-zinc-400'; return Icon ? <Icon className={`w-3 h-3 shrink-0 ${color}`} /> : <span className={`w-2 h-2 rounded-full shrink-0 ${PLATFORM_DOT[p]}`} />; })()}
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
                    isWatched ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
                  }`}
                >
                  {togglingIds.has(artist.id) ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Star className={`w-4 h-4 ${isWatched ? "fill-current" : ""}`} />}
                  <span className="tabular-nums">{artist.watchlistCount}</span>
                </button>
              </div>
            );
          })}
        </div>
      ))}

      {/* Load More sentinel */}
      {!isChangeMode && artists.length < totalCount && (
        <div ref={sentinelRef} className="flex justify-center mt-6 py-4">
          {loadingMore && (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading more...
            </div>
          )}
        </div>
      )}

      {/* Request Modal */}
      {showRequest && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
            <button onClick={() => setShowRequest(false)} className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-black mb-2">Request to Join</h2>
            <p className="text-[var(--muted-foreground)] text-sm mb-4">Submit an artist with their social links. A moderator will review it.</p>
            {requestSent ? (
              <div className="text-green-400 font-bold text-center py-8">Request submitted!</div>
            ) : (
              <form onSubmit={submitRequest} className="flex flex-col gap-3">
                <input required placeholder="Artist name" value={reqName} onChange={(e) => setReqName(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                <div className="text-xs font-bold uppercase text-[var(--muted-foreground)] mt-2">Platform Links</div>
                {reqLinks.map((link, i) => (
                  <div key={i} className="flex gap-2">
                    <select value={link.platform} onChange={(e) => setReqLinks((prev) => prev.map((l, j) => j === i ? { ...l, platform: e.target.value } : l))} className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none w-32">
                      {ALL_PLATFORMS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    <input required placeholder="URL" value={link.url} onChange={(e) => setReqLinks((prev) => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))} className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none flex-1 focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                    {reqLinks.length > 1 && (
                      <button type="button" onClick={() => setReqLinks((prev) => prev.filter((_, j) => j !== i))} className="text-[var(--muted-foreground)] hover:text-red-400 p-1"><X className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => setReqLinks((prev) => [...prev, { platform: "YOUTUBE", url: "" }])} className="text-[var(--accent)] text-sm font-bold flex items-center gap-1 hover:underline w-max">
                  <PlusCircle className="w-4 h-4" /> Add another link
                </button>
                <textarea placeholder="Why should they be added? (optional)" value={reqReason} onChange={(e) => setReqReason(e.target.value)} rows={2} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                <button type="submit" className="mt-1 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all">Submit Request</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Add Artist Modal (mod) */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setShowAdd(false)} className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"><X className="w-5 h-5" /></button>
            <h2 className="text-xl font-black mb-4">Add Artist</h2>
            <form onSubmit={addArtist} className="flex flex-col gap-3">
              {addError && <div className="text-red-400 text-sm bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{addError}</div>}
              <div className="text-xs font-bold uppercase text-[var(--muted-foreground)]">Spotify Link (required)</div>
              <input
                required placeholder="https://open.spotify.com/artist/..."
                value={addLinks[0]?.url ?? ""}
                onChange={(e) => setAddLinks((prev) => prev.map((l, j) => j === 0 ? { ...l, url: e.target.value, spotifyPreviewUrl: undefined, spotifyPreviewName: null, spotifyPreviewImageUrl: null, spotifyPreviewPlatformId: null, spotifyPreviewFollowerCount: 0, spotifyPreviewLoading: false, spotifyPreviewError: null } : l))}
                className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
              />
              {addLinks[0]?.url.trim() && (
                <div className="rounded-xl border border-[var(--muted)] bg-[var(--muted)]/50 px-3 py-2.5 text-sm">
                  {addLinks[0].spotifyPreviewLoading ? (
                    <div className="flex items-center gap-2 text-[var(--muted-foreground)]"><Loader2 className="w-4 h-4 animate-spin" />Looking up Spotify artist...</div>
                  ) : isValidSpotifyArtistUrl(addLinks[0].url) ? (
                    <div className="text-green-400 flex items-center gap-2"><Check className="w-4 h-4" />URL accepted</div>
                  ) : (
                    <div className="text-[var(--muted-foreground)]">Paste a valid Spotify artist URL</div>
                  )}
                </div>
              )}
              <div className="text-xs font-bold uppercase text-[var(--muted-foreground)] mt-2">Additional Links (optional)</div>
              {addLinks.slice(1).map((link, idx) => {
                const i = idx + 1;
                return (
                  <div key={i} className="flex gap-2">
                    <select value={link.platform} onChange={(e) => setAddLinks((prev) => prev.map((l, j) => j === i ? { ...l, platform: e.target.value } : l))} className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none w-32">
                      {ALL_PLATFORMS.filter((p) => p.key !== "SPOTIFY").map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                    </select>
                    <input required placeholder="URL" value={link.url} onChange={(e) => setAddLinks((prev) => prev.map((l, j) => j === i ? { ...l, url: e.target.value } : l))} className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none flex-1 focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500" />
                    <button type="button" onClick={() => setAddLinks((prev) => prev.filter((_, j) => j !== i))} className="text-[var(--muted-foreground)] hover:text-red-400 p-1"><X className="w-4 h-4" /></button>
                  </div>
                );
              })}
              <button type="button" onClick={() => setAddLinks((prev) => [...prev, { platform: "YOUTUBE", url: "", handle: "" }])} className="text-[var(--accent)] text-sm font-bold flex items-center gap-1 hover:underline w-max">
                <PlusCircle className="w-4 h-4" /> Add another link
              </button>
              <button type="submit" disabled={addSubmitting} className="mt-2 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {addSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Add to Leaderboard
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Link Modal (admin) */}
      {showLinkModal && linkModalArtistId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
            <button onClick={() => setShowLinkModal(false)} className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"><X className="w-5 h-5" /></button>
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
                    <input placeholder="Search YouTube channel..." value={linkModalYtQuery} onChange={(e) => setLinkModalYtQuery(e.target.value)} className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500 w-full" />
                    {linkModalYtSearching && <RefreshCw className="w-4 h-4 animate-spin absolute right-3 top-2.5 text-[var(--muted-foreground)]" />}
                  </div>
                  {linkModalYtResults.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {linkModalYtResults.map((ch) => (
                        <button key={ch.platformId} type="button"
                          onClick={() => { setLinkModalUrl(`https://www.youtube.com/${ch.handle ? `@${ch.handle}` : `channel/${ch.platformId}`}`); setLinkModalYtQuery(ch.name); setLinkModalYtResults([]); }}
                          className={`flex items-center gap-4 p-3 rounded-xl border transition-all text-left ${linkModalUrl.includes(ch.platformId ?? "___") ? "border-red-500 bg-red-950/30" : "border-[var(--muted)] bg-[var(--muted)]/30 hover:border-red-500/50 hover:bg-red-950/10"}`}
                        >
                          {ch.imageUrl ? <img src={ch.imageUrl} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" /> : <div className="w-12 h-12 rounded-full bg-red-950/50 flex items-center justify-center shrink-0"><span className="text-lg font-black text-red-400">{ch.name.charAt(0)}</span></div>}
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
    </>
  );
}
