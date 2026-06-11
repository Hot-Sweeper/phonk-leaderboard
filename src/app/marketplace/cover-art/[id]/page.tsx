"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Star } from "lucide-react";
import { formatMarketplacePrice } from "@/lib/marketplace-format";

type Gig = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  imageUrls: string[];
  deliveryDays: number;
  revisions: number;
  ratingAverage: number | null;
  ratingCount: number;
  tiers: Array<{
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    deliveryDays: number | null;
    revisions: number | null;
  }>;
  seller?: { name: string | null; slug: string | null; avatarUrl: string | null };
};

export default function CoverArtGigPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [gigId, setGigId] = useState<string | null>(null);
  const [gig, setGig] = useState<Gig | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then(({ id }) => setGigId(id));
  }, [params]);

  useEffect(() => {
    if (!gigId) return;
    void fetch(`/api/marketplace/gigs/${gigId}`)
      .then((res) => res.json())
      .then((payload: Gig) => {
        setGig(payload);
        setSelectedTierId(payload.tiers[0]?.id ?? null);
      })
      .finally(() => setLoading(false));
  }, [gigId]);

  async function placeOrder() {
    if (!session) {
      router.push("/onboarding");
      return;
    }
    if (!gig || !selectedTierId || !brief.trim()) {
      setError("Pick a package and describe what you need.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const orderRes = await fetch("/api/marketplace/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gigId: gig.id, tierId: selectedTierId, brief: brief.trim() }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order.error ?? "Failed to create order.");

      const checkoutRes = await fetch(`/api/marketplace/orders/${order.id}/checkout`, { method: "POST" });
      const checkout = await checkoutRes.json();
      if (!checkoutRes.ok) throw new Error(checkout.error ?? "Failed to start checkout.");

      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
        return;
      }

      router.push(`/marketplace/orders/${order.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !gig) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="space-y-5">
        <Link href="/marketplace/cover-art" className="text-sm text-[var(--muted-foreground)] hover:text-white">
          ← Marketplace
        </Link>
        <div className="grid gap-3 sm:grid-cols-2">
          {(gig.imageUrls.length > 0 ? gig.imageUrls : [null]).map((url, index) => (
            <div key={index} className="relative aspect-square overflow-hidden rounded-2xl border border-[var(--muted)] bg-[var(--background)]">
              {url ? (
                <Image src={url} alt="" fill className="object-cover" sizes="50vw" unoptimized />
              ) : null}
            </div>
          ))}
        </div>
        <div>
          <h1 className="text-3xl font-black text-white">{gig.title}</h1>
          {gig.seller?.slug ? (
            <Link href={`/u/${gig.seller.slug}`} className="mt-1 inline-block text-sm text-[var(--accent)] hover:underline">
              by {gig.seller.name}
            </Link>
          ) : (
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">by {gig.seller?.name ?? "Designer"}</p>
          )}
          {gig.ratingCount > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1 text-sm text-amber-300">
              <Star className="h-4 w-4 fill-current" />
              {gig.ratingAverage?.toFixed(1)} · {gig.ratingCount} reviews
            </p>
          ) : null}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/80">{gig.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {gig.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-[var(--muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      <aside className="h-fit rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/40 p-5 space-y-4 sticky top-20">
        <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Order a package</h2>
        <div className="space-y-2">
          {gig.tiers.map((tier) => (
            <button
              key={tier.id}
              type="button"
              onClick={() => setSelectedTierId(tier.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                selectedTierId === tier.id
                  ? "border-[var(--accent)] bg-[var(--accent)]/10"
                  : "border-[var(--muted)] hover:border-[var(--accent)]/40"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-white">{tier.name}</span>
                <span className="text-sm font-black text-[var(--accent)]">
                  {formatMarketplacePrice(tier.priceCents, tier.currency)}
                </span>
              </div>
              {tier.description ? (
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">{tier.description}</p>
              ) : null}
            </button>
          ))}
        </div>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={5}
          placeholder="Describe your track vibe, references, text on cover, colors…"
          className="w-full rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
        />
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <button
          type="button"
          disabled={submitting}
          onClick={() => void placeOrder()}
          className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {submitting ? "Processing…" : "Continue to checkout"}
        </button>
      </aside>
    </main>
  );
}
