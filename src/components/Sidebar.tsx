"use client";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { useDetailPanel } from "@/lib/detail-panel";
import { clearSessionCacheByPrefix, fetchJsonWithSessionCache } from "@/lib/client-cache";
import {
  Trophy,
  Package,
  Send,
  Shield,
  Settings,
  Star,
  Users,
  ChevronDown,
  ChevronRight,
  PlusCircle,
  CreditCard,
  SlidersHorizontal,
  MessageCircle,
  Palette,
  Inbox,
} from "lucide-react";
import { signIn } from "next-auth/react";

type WatchlistArtist = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export default function Sidebar() {
  const { data: session } = useSession();
  const { openArtist } = useDetailPanel();
  const path = usePathname();
  const [watchlistArtists, setWatchlistArtists] = useState<WatchlistArtist[]>([]);
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const watchlistLoadDelayMs = process.env.NODE_ENV === "development" ? 1200 : 0;

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const isRankings =
    path.startsWith("/rankings") ||
    path === "/leaderboard" ||
    path === "/bubbles" ||
    path === "/songs" ||
    path.startsWith("/hype");
  const isModeration =
    path === "/moderation" || path === "/review" || path === "/import";
  const isBilling = path.startsWith("/billing");
  const isCommunity = path.startsWith("/community") || path.startsWith("/u/");
  const isCoverArtMarketplace =
    path.startsWith("/marketplace/cover-art") || path === "/marketplace";
  const isMarketplaceOrders = path.startsWith("/marketplace/orders");
  const isDemos = path.startsWith("/demos");

  const refreshWatchlist = useCallback(async () => {
    if (!session) {
      setWatchlistArtists([]);
      return;
    }
    try {
      const artists = await fetchJsonWithSessionCache<WatchlistArtist[]>(
        "watchlist:details",
        "/api/watchlist?details=true",
        30_000
      );
      setWatchlistArtists(artists);
    } catch {
      // silent
    }
  }, [session]);

  useEffect(() => {
    if (!session) {
      const resetId = window.setTimeout(() => {
        setWatchlistArtists([]);
      }, 0);
      return () => window.clearTimeout(resetId);
    }
    if (!watchlistOpen) return;

    const timeoutId = window.setTimeout(() => {
      void refreshWatchlist();
    }, watchlistLoadDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [session, watchlistOpen, watchlistLoadDelayMs, refreshWatchlist]);

  useEffect(() => {
    const handler = () => {
      clearSessionCacheByPrefix("watchlist:");
      refreshWatchlist();
    };
    window.addEventListener("watchlist-changed", handler);
    return () => window.removeEventListener("watchlist-changed", handler);
  }, [refreshWatchlist]);

  const navItems = [
    {
      href: "/community",
      icon: MessageCircle,
      label: "Community",
      active: isCommunity,
    },
    {
      href: "/rankings",
      icon: Trophy,
      label: "Rankings",
      active: isRankings,
    },
    {
      href: "/marketplace/cover-art",
      icon: Palette,
      label: "Cover Art",
      active: isCoverArtMarketplace,
    },
    ...(session
      ? [
          {
            href: "/marketplace/orders",
            icon: Inbox,
            label: "My Orders",
            active: isMarketplaceOrders,
          },
        ]
      : []),
    {
      href: "/samples",
      icon: Package,
      label: "Samples",
      active: path.startsWith("/samples"),
    },
    {
      href: "/demos",
      icon: Inbox,
      label: "Demos",
      active: isDemos || path === "/submit",
    },
    {
      href: "/submit",
      icon: Send,
      label: "Submit",
      active: path === "/submit",
    },
  ];

  const modItems = session
    ? [
        {
          href: "/moderation",
          icon: Shield,
          label: isPrivileged ? "Moderation" : "Requests",
          active: isModeration,
        },
      ]
    : [];

  const accountItems = session
    ? [
        {
          href: "/billing",
          icon: CreditCard,
          label: "Billing",
          active: isBilling,
        },
      ]
    : [];

  const adminItems =
    session?.user?.role === "ADMIN"
      ? [
          {
            href: "/admin",
            icon: Settings,
            label: "Admin",
            active: path === "/admin",
          },
          {
            href: "/admin/tiers",
            icon: SlidersHorizontal,
            label: "Tiers",
            active: path.startsWith("/admin/tiers"),
          },
        ]
      : [];

  const allNav = [...navItems, ...modItems, ...accountItems, ...adminItems];

  return (
    <aside className="hidden lg:flex flex-col w-full h-[calc(100vh-3.5rem)] sticky top-14 bg-[var(--secondary)]/50 border-r border-[var(--muted)]/50">
      {/* Navigation */}
      <nav className="px-3 pt-4 pb-2 space-y-0.5">
        {allNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
              item.active
                ? "bg-[var(--muted)] text-white"
                : "text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--muted)]/50"
            }`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="mx-3 my-2 h-px bg-[var(--muted)]/50" />

      {/* Watchlist section */}
      <div className="flex-1 min-h-0 flex flex-col">
        <button
          onClick={() => setWatchlistOpen((o) => !o)}
          className="flex items-center justify-between px-4 py-2 text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)] hover:text-white transition-colors"
        >
          <span className="flex items-center gap-2">
            <Star className="w-3.5 h-3.5" />
            Your Watchlist
          </span>
          {watchlistOpen ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {watchlistOpen && (
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
            {!session ? (
              <p className="px-3 py-4 text-xs text-[var(--muted-foreground)] leading-relaxed">
                Sign in to see your watchlisted artists here.
              </p>
            ) : watchlistArtists.length === 0 ? (
              <p className="px-3 py-4 text-xs text-[var(--muted-foreground)] leading-relaxed">
                No artists watchlisted yet. Star artists from the rankings to see them here.
              </p>
            ) : (
              <div className="space-y-0.5">
                {watchlistArtists.map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => openArtist(artist.id)}
                    className={`w-full flex items-center gap-3 px-2 py-1.5 rounded-lg transition-colors group text-left cursor-pointer ${
                      path === `/artist/${artist.id}`
                        ? "bg-[var(--muted)] text-white"
                        : "text-[var(--muted-foreground)] hover:text-white hover:bg-[var(--muted)]/50"
                    }`}
                  >
                    {artist.imageUrl ? (
                      <Image
                        src={artist.imageUrl}
                        alt={artist.name}
                        width={32}
                        height={32}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center shrink-0">
                        <Users className="w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                      </div>
                    )}
                    <span className="text-sm font-medium truncate">
                      {artist.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons at the bottom */}
      <div className="shrink-0 px-3 py-3 border-t border-[var(--muted)]/50 flex flex-col gap-1.5">
        {isPrivileged && (
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("open-add-artist"))}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-[var(--accent)] hover:bg-[#a21caf] text-white transition-colors shadow-[0_0_12px_var(--accent-glow)]"
          >
            <PlusCircle className="w-4 h-4 shrink-0" /> Add Artist
          </button>
        )}
        <button
          onClick={() => session ? window.dispatchEvent(new CustomEvent("open-request-join")) : signIn("google")}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white hover:border-[var(--accent)] transition-colors"
        >
          <Send className="w-4 h-4 shrink-0" /> Request to Join
        </button>
        {/* Spotify attribution — required by Spotify Design Guidelines */}
        <a
          href="https://www.spotify.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 mt-1 rounded-lg text-xs text-[var(--muted-foreground)] hover:text-white transition-colors"
          aria-label="Powered by Spotify"
        >
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 fill-[#1DB954]" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          <span>Powered by Spotify</span>
        </a>
      </div>
    </aside>
  );
}
