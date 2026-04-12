"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import {
  Package,
  Star,
  ArrowLeft,
  Eye,
  MousePointerClick,
  Bookmark,
  BookmarkCheck,
  Check,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";

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

export default function PackDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [pack, setPack] = useState<SamplePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [isWatched, setIsWatched] = useState(false);

  useEffect(() => {
    fetch(`/api/sample-packs/${id}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) {
          setPack(data);
          if (data.versions.length > 0) setSelectedVersion(data.versions[0].id);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  const handleClickTrack = useCallback((platform: string) => {
    fetch(`/api/sample-packs/${id}/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.clickCount >= 0) {
          setPack((prev) => prev ? { ...prev, clickCount: data.clickCount } : prev);
        }
      })
      .catch(() => {});
  }, [id]);

  const handleWatchlistToggle = useCallback(() => {
    fetch(`/api/sample-packs/${id}/watchlist`, { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        setIsWatched(data.watched);
        if (data.watchlistCount >= 0) {
          setPack((prev) => prev ? { ...prev, watchlistCount: data.watchlistCount } : prev);
        }
      })
      .catch(() => {});
  }, [id]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="w-full aspect-[2.5/1] rounded-2xl" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-5 w-1/3" />
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-16 rounded-xl" />
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !pack) {
    return (
      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Package className="w-16 h-16 text-[var(--muted-foreground)] mx-auto opacity-40" />
          <p className="text-[var(--muted-foreground)]">Pack not found</p>
          <button
            onClick={() => router.push("/samples")}
            className="text-cyan-400 hover:text-cyan-300 text-sm font-bold"
          >
            Back to Sample Packs
          </button>
        </div>
      </main>
    );
  }

  const hasVersions = pack.versions.length > 0;
  const activeVersion = hasVersions ? pack.versions.find((v) => v.id === selectedVersion) ?? pack.versions[0] : null;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans relative">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Back button */}
        <button
          onClick={() => router.push("/samples")}
          className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Sample Packs
        </button>

        {/* Hero image */}
        {pack.imageUrl && (
          <div className="relative w-full aspect-[2.5/1] rounded-2xl overflow-hidden mb-8 bg-[var(--secondary)]">
            <Image
              src={pack.imageUrl}
              alt={pack.name}
              fill
              className="object-cover"
              sizes="(max-width: 896px) 100vw, 896px"
              priority
              unoptimized
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--background)] via-transparent to-transparent" />
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">{pack.name}</h1>
            {pack.seller && (
              <p className="text-sm text-[var(--muted-foreground)] mt-1">by {pack.seller}</p>
            )}
          </div>
          <button
            onClick={handleWatchlistToggle}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 ${
              isWatched
                ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/40"
                : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-white border border-[var(--muted)]"
            }`}
          >
            {isWatched ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            {isWatched ? "Watchlisted" : "Watchlist"}
          </button>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-5 text-sm text-[var(--muted-foreground)] mb-6">
          <span className="flex items-center gap-1.5">
            <Eye className="w-4 h-4" />
            {pack.watchlistCount} watchlisted
          </span>
          <span className="flex items-center gap-1.5">
            <MousePointerClick className="w-4 h-4" />
            {pack.clickCount} clicks
          </span>
          {pack.ratingAverage != null && (
            <span className="flex items-center gap-1.5 text-yellow-400">
              <Star className="w-4 h-4 fill-yellow-400" />
              {pack.ratingAverage.toFixed(1)}
              <span className="text-[var(--muted-foreground)]">({pack.ratingCount})</span>
            </span>
          )}
        </div>

        {/* Description */}
        {pack.description && (
          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed whitespace-pre-line mb-8 max-w-2xl">
            {pack.description}
          </p>
        )}

        {/* Tags */}
        {pack.tags.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-8">
            {pack.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Versions selector */}
        {hasVersions && (
          <div className="mb-8">
            <h2 className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">
              Choose your version
            </h2>

            {/* Version tabs */}
            <div className="flex gap-2 flex-wrap mb-4">
              {pack.versions.map((v) => {
                const isActive = v.id === selectedVersion;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersion(v.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                      isActive
                        ? "bg-cyan-500/15 border-cyan-500/40 text-white"
                        : "bg-[var(--secondary)] border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white hover:border-[var(--muted-foreground)]"
                    }`}
                  >
                    {isActive && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    <span>{shortName(v.name)}</span>
                    <span className={`${v.priceCents === 0 ? "text-green-400" : "text-cyan-400"}`}>
                      {formatPrice(v.priceCents, v.currency)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected version description */}
            {activeVersion?.description && (
              <div className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/80 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold">{shortName(activeVersion.name)}</h3>
                  <span className={`text-sm font-black ${activeVersion.priceCents === 0 ? "text-green-400" : "text-cyan-400"}`}>
                    {formatPrice(activeVersion.priceCents, activeVersion.currency)}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed whitespace-pre-line">
                  {activeVersion.description}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Price (no versions) */}
        {!hasVersions && (
          <div className="text-2xl font-black mb-8">
            <span className={pack.priceCents === 0 ? "text-green-400" : "text-cyan-400"}>
              {formatPrice(pack.priceCents, pack.currency)}
            </span>
          </div>
        )}

        {/* Buy buttons */}
        <div className="flex gap-3 flex-wrap">
          {pack.payhipUrl && (
            <a
              href={pack.payhipUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleClickTrack("payhip")}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-sm font-bold text-blue-400 hover:bg-blue-500/25 hover:text-blue-300 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://payhip.com/favicon.ico" alt="" className="w-5 h-5 rounded" />
              Get on Payhip
            </a>
          )}
          {pack.gumroadUrl && (
            <a
              href={pack.gumroadUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => handleClickTrack("gumroad")}
              className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-pink-500/15 border border-pink-500/30 text-sm font-bold text-pink-400 hover:bg-pink-500/25 hover:text-pink-300 transition-all"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://gumroad.com/favicon.ico" alt="" className="w-5 h-5 rounded" />
              Get on Gumroad
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
