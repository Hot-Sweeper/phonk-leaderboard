"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Brush, Loader2, Plus, Search, Star } from "lucide-react";
import { formatMarketplacePrice } from "@/lib/marketplace-format";

type Gig = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  imageUrls: string[];
  ratingAverage: number | null;
  ratingCount: number;
  orderCount: number;
  tiers: Array<{ id: string; name: string; priceCents: number; currency: string }>;
  seller?: { name: string | null; slug: string | null; avatarUrl: string | null };
};

export default function CoverArtMarketplacePage() {
  const { data: session } = useSession();
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const loadGigs = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const params = q ? `?q=${encodeURIComponent(q)}` : "";
      const response = await fetch(`/api/marketplace/gigs${params}`);
      if (response.ok) setGigs(await response.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadGigs();
  }, [loadGigs]);

  const lowestPrice = (gig: Gig) => {
    if (gig.tiers.length === 0) return null;
    const min = Math.min(...gig.tiers.map((tier) => tier.priceCents));
    const tier = gig.tiers.find((item) => item.priceCents === min)!;
    return formatMarketplacePrice(min, tier.currency);
  };

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--accent)]">Marketplace</p>
          <h1 className="text-3xl font-black tracking-tight text-white">Cover art gigs</h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
            Browse phonk-focused designers, pick a package, and order custom artwork.
          </p>
        </div>
        {session ? (
          <Link
            href="/marketplace/cover-art/new"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#a21caf]"
          >
            <Plus className="h-4 w-4" />
            List a gig
          </Link>
        ) : null}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void loadGigs(query.trim());
        }}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search gigs, tags, styles…"
            className="w-full rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/40 py-2.5 pl-10 pr-4 text-sm text-white outline-none focus:border-[var(--accent)]"
          />
        </div>
        <button
          type="submit"
          className="rounded-xl border border-[var(--muted)] px-4 py-2.5 text-sm font-semibold text-[var(--muted-foreground)] transition hover:text-white"
        >
          Search
        </button>
      </form>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
        </div>
      ) : gigs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--muted)] px-6 py-16 text-center">
          <Brush className="mx-auto mb-3 h-8 w-8 text-[var(--muted-foreground)]" />
          <p className="text-sm text-[var(--muted-foreground)]">No gigs yet. Be the first cover artist to list one.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {gigs.map((gig) => (
            <Link
              key={gig.id}
              href={`/marketplace/cover-art/${gig.id}`}
              className="group overflow-hidden rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/40 transition hover:border-[var(--accent)]/40"
            >
              <div className="relative aspect-square bg-[var(--background)]">
                {gig.imageUrls[0] ? (
                  <Image
                    src={gig.imageUrls[0]}
                    alt={gig.title}
                    fill
                    className="object-cover transition group-hover:scale-[1.02]"
                    sizes="(max-width: 768px) 100vw, 33vw"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Brush className="h-12 w-12 text-[var(--muted-foreground)]/30" />
                  </div>
                )}
                {lowestPrice(gig) ? (
                  <div className="absolute right-2 top-2 rounded-lg bg-black/70 px-2.5 py-1 text-xs font-black text-[var(--accent)]">
                    from {lowestPrice(gig)}
                  </div>
                ) : null}
              </div>
              <div className="space-y-2 p-4">
                <h2 className="line-clamp-1 font-bold text-white">{gig.title}</h2>
                <p className="line-clamp-2 text-xs leading-relaxed text-[var(--muted-foreground)]">
                  {gig.description}
                </p>
                <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                  <span>{gig.seller?.name ?? "Designer"}</span>
                  {gig.ratingCount > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Star className="h-3.5 w-3.5 fill-current" />
                      {gig.ratingAverage?.toFixed(1)} ({gig.ratingCount})
                    </span>
                  ) : (
                    <span>{gig.orderCount} orders</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {session ? (
        <div className="text-center">
          <Link href="/marketplace/orders" className="text-sm font-semibold text-[var(--accent)] hover:underline">
            View my orders
          </Link>
        </div>
      ) : null}
    </main>
  );
}
