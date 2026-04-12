"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import Image from "next/image";
import { Skeleton } from "@/components/Skeleton";
import { clearSessionCacheByPrefix, fetchJsonWithSessionCache } from "@/lib/client-cache";
import {
  Eye,
  MousePointerClick,
  Star,
  Bookmark,
  BookmarkCheck,
  ExternalLink,
  Package,
  Check,
  X,
} from "lucide-react";
import { useDetailPanel } from "@/lib/detail-panel";

function formatPrice(cents: number, currency = "USD"): string {
  if (cents === 0) return "Free";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

function shortName(name: string): string {
  return name.replace(/\s*-\s*.*$/, "").trim();
}

type PackVersion = {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  description: string | null;
};

type SamplePack = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  seller: string | null;
  payhipUrl: string | null;
  gumroadUrl: string | null;
  priceCents: number;
  currency: string;
  ratingAverage: number | null;
  ratingCount: number;
  clickCount: number;
  watchlistCount: number;
  tags: string[];
  versions: PackVersion[];
};

export default function PackPanel({ id }: { id: string }) {
  const { data: session } = useSession();
  const { close } = useDetailPanel();
  const [pack, setPack] = useState<SamplePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWatched, setIsWatched] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    setPack(null);

    Promise.all([
      fetchJsonWithSessionCache<SamplePack | null>(`pack:${id}:detail`, `/api/sample-packs/${id}`, 60_000).catch(() => null),
      fetchJsonWithSessionCache<{ watched: boolean }>(`pack:${id}:watch`, `/api/sample-packs/${id}/watchlist`, 30_000).catch(() => ({ watched: false })),
    ]).then(([packData, watchData]) => {
      if (packData) {
        setPack(packData);
        if (packData.versions?.length > 0) setSelectedVersion(packData.versions[0].id);
      }
      setIsWatched(watchData.watched);
      setLoading(false);
    });
  }, [id]);

  const handleWatchlistToggle = useCallback(async () => {
    if (!session) return signIn("google");
    if (toggling) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/sample-packs/${id}/watchlist`, {
        method: isWatched ? "DELETE" : "POST",
      });
      if (res.ok && pack) {
        setIsWatched(!isWatched);
        setPack({ ...pack, watchlistCount: pack.watchlistCount + (isWatched ? -1 : 1) });
        clearSessionCacheByPrefix(`pack:${id}:`);
      }
    } finally {
      setToggling(false);
    }
  }, [session, toggling, isWatched, id, pack]);

  const handleClickTrack = useCallback(async (platform: string) => {
    await fetch(`/api/sample-packs/${id}/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    }).catch(() => {});
  }, [id]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-32" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!pack) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Package className="w-10 h-10 text-[var(--muted-foreground)]" />
        <p className="text-sm font-bold text-[var(--muted-foreground)]">Pack not found</p>
      </div>
    );
  }

  const hasVersions = pack.versions.length > 0;
  const activeVersion = hasVersions ? pack.versions.find((v) => v.id === selectedVersion) ?? pack.versions[0] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-[var(--muted)]/50">
        <div className="flex items-start gap-3">
          {pack.imageUrl ? (
            <Image src={pack.imageUrl} alt={pack.name} width={64} height={64} className="w-16 h-16 rounded-xl object-cover shrink-0" unoptimized />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-[var(--secondary)] flex items-center justify-center shrink-0">
              <Package className="w-6 h-6 text-[var(--muted-foreground)]" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-black leading-tight truncate">{pack.name}</h2>
            {pack.seller && (
              <p className="text-xs text-[var(--muted-foreground)] mt-0.5">by {pack.seller}</p>
            )}
          </div>
          <button onClick={close} className="text-[var(--muted-foreground)] hover:text-white p-1 -mt-1 -mr-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Watchlist */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={handleWatchlistToggle}
            disabled={toggling}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all disabled:opacity-60 ${
              isWatched
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                : "bg-[var(--secondary)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
            }`}
          >
            {toggling ? (
              <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isWatched ? (
              <BookmarkCheck className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            {isWatched ? "Watchlisted" : "Watchlist"}
          </button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[var(--muted)] bg-[var(--secondary)]/40 p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Watchlisted</div>
            <div className="text-lg font-black tabular-nums flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> {pack.watchlistCount}
            </div>
          </div>
          <div className="rounded-lg border border-[var(--muted)] bg-[var(--secondary)]/40 p-3">
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-1">Clicks</div>
            <div className="text-lg font-black tabular-nums flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5 text-[var(--muted-foreground)]" /> {pack.clickCount}
            </div>
          </div>
          {pack.ratingAverage != null && (
            <div className="rounded-lg border border-yellow-800/30 bg-yellow-950/20 p-3 col-span-2">
              <div className="text-[9px] font-bold uppercase tracking-wider text-yellow-400/70 mb-1">Rating</div>
              <div className="text-lg font-black tabular-nums text-yellow-400 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 fill-yellow-400" /> {pack.ratingAverage.toFixed(1)}
                <span className="text-xs font-normal text-[var(--muted-foreground)]">({pack.ratingCount} reviews)</span>
              </div>
            </div>
          )}
        </div>

        {/* Description */}
        {pack.description && (
          <div className="rounded-lg border border-[var(--muted)] bg-[var(--secondary)]/40 p-3">
            <p className="text-xs text-[var(--muted-foreground)] leading-relaxed whitespace-pre-line line-clamp-6">{pack.description}</p>
          </div>
        )}

        {/* Tags */}
        {pack.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {pack.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">{tag}</span>
            ))}
          </div>
        )}

        {/* Price / Versions */}
        {hasVersions ? (
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] mb-2">Versions</h3>
            <div className="flex flex-col gap-1.5">
              {pack.versions.map((v) => {
                const isActive = v.id === selectedVersion;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersion(v.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold transition-all border text-left ${
                      isActive
                        ? "bg-cyan-500/15 border-cyan-500/40 text-white"
                        : "bg-[var(--secondary)] border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isActive && <Check className="w-3 h-3 text-cyan-400" />}
                      <span className="text-xs">{shortName(v.name)}</span>
                    </div>
                    <span className={`text-xs ${v.priceCents === 0 ? "text-green-400" : "text-cyan-400"}`}>
                      {formatPrice(v.priceCents, v.currency)}
                    </span>
                  </button>
                );
              })}
            </div>
            {activeVersion?.description && (
              <p className="text-[10px] text-[var(--muted-foreground)] leading-relaxed mt-2 whitespace-pre-line line-clamp-3">
                {activeVersion.description}
              </p>
            )}
          </div>
        ) : (
          <div className="text-xl font-black">
            <span className={pack.priceCents === 0 ? "text-green-400" : "text-cyan-400"}>
              {formatPrice(pack.priceCents, pack.currency)}
            </span>
          </div>
        )}

        {/* Buy buttons */}
        <div className="flex flex-col gap-2">
          {pack.payhipUrl && (
            <a
              href={pack.payhipUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleClickTrack("payhip")}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500/15 border border-blue-500/30 text-sm font-bold text-blue-400 hover:bg-blue-500/25 transition-all"
            >
              Buy on Payhip <ExternalLink className="w-3 h-3" />
            </a>
          )}
          {pack.gumroadUrl && (
            <a
              href={pack.gumroadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleClickTrack("gumroad")}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-pink-500/15 border border-pink-500/30 text-sm font-bold text-pink-400 hover:bg-pink-500/25 transition-all"
            >
              Buy on Gumroad <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
