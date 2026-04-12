"use client";
import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Package,
  Star,
  Search,
  MousePointerClick,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  salesCount: number | null;
  clickCount: number;
  watchlistCount: number;
  tags: string[];
  createdAt: string;
  versions: PackVersion[];
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatPrice(cents: number, currency: string) {
  if (cents === 0) return "Free";
  const symbols: Record<string, string> = { USD: "$", EUR: "\u20AC", GBP: "\u00A3" };
  const sym = symbols[currency.toUpperCase()] ?? currency + " ";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

function shortName(full: string) {
  const match = full.match(/\((.+)\)$/);
  return match ? match[1] : full;
}

/* ------------------------------------------------------------------ */
/*  Pack Card                                                          */
/* ------------------------------------------------------------------ */

function PackCard({
  pack,
  onWatchlistToggle,
  isWatched,
  onClickTrack,
}: {
  pack: SamplePack;
  onWatchlistToggle: (packId: string) => void;
  isWatched: boolean;
  onClickTrack: (packId: string, platform: string) => void;
}) {
  const hasVersions = pack.versions.length > 0;
  const priceRange = hasVersions
    ? { min: Math.min(...pack.versions.map((v) => v.priceCents)), max: Math.max(...pack.versions.map((v) => v.priceCents)) }
    : null;

  const priceLabel = hasVersions && priceRange
    ? priceRange.min === 0 && priceRange.max === 0
      ? "Free"
      : priceRange.min === priceRange.max
        ? formatPrice(priceRange.min, pack.currency)
        : `${formatPrice(priceRange.min, pack.currency)} - ${formatPrice(priceRange.max, pack.currency)}`
    : formatPrice(pack.priceCents, pack.currency);

  return (
    <div className="group rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 overflow-hidden hover:border-cyan-800/50 transition-all flex flex-col">
      {/* Clickable area — links to detail page */}
      <Link href={`/samples/${pack.id}`} className="text-left w-full">
        {/* Cover */}
        <div className="relative w-full aspect-square bg-[var(--background)]">
          {pack.imageUrl ? (
            <Image
              src={pack.imageUrl}
              alt={pack.name}
              fill
              className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Package className="w-16 h-16 text-[var(--muted-foreground)] opacity-20" />
            </div>
          )}
          {/* Price badge */}
          <div className="absolute top-2 right-2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-sm text-xs font-black text-cyan-400">
            {priceLabel}
          </div>
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-bold bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm">
              View Details
            </span>
          </div>
        </div>

        {/* Pack info */}
        <div className="p-4 pb-2 space-y-1">
          <div className="font-bold text-sm truncate">{pack.name}</div>
          {pack.seller && (
            <div className="text-xs text-[var(--muted-foreground)]">by {pack.seller}</div>
          )}
        </div>
      </Link>

      {/* Versions */}
      {hasVersions && (
        <div className="px-4 pb-2">
          <div className="space-y-1">
            {pack.versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-[var(--background)]/80 border border-[var(--muted)]/50"
              >
                <span className="text-[var(--foreground)] font-medium truncate mr-2">{shortName(v.name)}</span>
                <span className={`font-bold shrink-0 ${v.priceCents === 0 ? "text-green-400" : "text-cyan-400"}`}>
                  {formatPrice(v.priceCents, v.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats + actions */}
      <div className="px-4 pb-4 pt-1 mt-auto space-y-3">
        {/* Stats */}
        <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)]">
          <span className="flex items-center gap-0.5">
            <Bookmark className="w-3 h-3" /> {pack.watchlistCount}
          </span>
          <span className="flex items-center gap-0.5">
            <MousePointerClick className="w-3 h-3" /> {pack.clickCount}
          </span>
          {pack.ratingAverage != null && (
            <span className="flex items-center gap-0.5 text-yellow-400">
              <Star className="w-3 h-3 fill-yellow-400" />
              {pack.ratingAverage.toFixed(1)}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onWatchlistToggle(pack.id); }}
            className={`p-2 rounded-lg transition-all ${
              isWatched
                ? "bg-cyan-500/20 text-cyan-400"
                : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
            }`}
            title={isWatched ? "Remove from watchlist" : "Add to watchlist"}
          >
            {isWatched ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>

          {pack.payhipUrl && (
            <a
              href={pack.payhipUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.stopPropagation(); onClickTrack(pack.id, "payhip"); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] font-bold text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://payhip.com/favicon.ico" alt="" className="w-4 h-4" />
              Payhip
            </a>
          )}
          {pack.gumroadUrl && (
            <a
              href={pack.gumroadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => { e.stopPropagation(); onClickTrack(pack.id, "gumroad"); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-pink-500/10 border border-pink-500/20 text-[11px] font-bold text-pink-400 hover:bg-pink-500/20 hover:text-pink-300 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://gumroad.com/favicon.ico" alt="" className="w-4 h-4" />
              Gumroad
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SamplesPage() {
  const [packs, setPacks] = useState<SamplePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/sample-packs")
      .then((r) => r.json())
      .then((data) => setPacks(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleClickTrack = useCallback((packId: string, platform: string) => {
    fetch(`/api/sample-packs/${packId}/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.clickCount >= 0) {
          setPacks((prev) =>
            prev.map((p) => (p.id === packId ? { ...p, clickCount: data.clickCount } : p))
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleWatchlistToggle = useCallback((packId: string) => {
    fetch(`/api/sample-packs/${packId}/watchlist`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setWatchedIds((prev) => {
          const next = new Set(prev);
          if (data.watched) next.add(packId);
          else next.delete(packId);
          return next;
        });
        if (data.watchlistCount >= 0) {
          setPacks((prev) =>
            prev.map((p) => (p.id === packId ? { ...p, watchlistCount: data.watchlistCount } : p))
          );
        }
      })
      .catch(() => {});
  }, []);

  const filtered = search
    ? packs.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.seller?.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
        );
      })
    : packs;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans relative">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-5xl mx-auto relative z-10">
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 mb-2">
          <Package className="w-8 h-8 text-cyan-400" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-cyan-400">
            Sample Packs
          </span>
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm mb-6 max-w-lg">
          Curated sample packs from the Phonk community. Click to grab them on Payhip or Gumroad.
        </p>

        {/* Search */}
        <div className="relative mb-8 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search packs..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-cyan-500/50"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-4 space-y-3">
                <Skeleton className="w-full aspect-square rounded-xl" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4 opacity-40" />
            <p className="text-[var(--muted-foreground)] text-sm">
              {packs.length === 0 ? "No sample packs yet." : "No packs match your search."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((pack) => (
              <PackCard
                key={pack.id}
                pack={pack}
                onWatchlistToggle={handleWatchlistToggle}
                isWatched={watchedIds.has(pack.id)}
                onClickTrack={handleClickTrack}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
