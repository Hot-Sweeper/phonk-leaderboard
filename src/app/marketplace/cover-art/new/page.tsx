"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

type TierDraft = {
  name: string;
  description: string;
  price: string;
  deliveryDays: string;
  revisions: string;
};

const EMPTY_TIER: TierDraft = {
  name: "Basic",
  description: "",
  price: "30",
  deliveryDays: "3",
  revisions: "1",
};

export default function NewCoverArtGigPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("phonk, cover-art");
  const [imageUrls, setImageUrls] = useState("");
  const [tiers, setTiers] = useState<TierDraft[]>([{ ...EMPTY_TIER }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/marketplace/gigs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          imageUrls: imageUrls.split("\n").map((url) => url.trim()).filter(Boolean),
          tiers: tiers.map((tier) => ({
            name: tier.name,
            description: tier.description,
            priceCents: Math.round(Number(tier.price) * 100),
            deliveryDays: Number(tier.deliveryDays),
            revisions: Number(tier.revisions),
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to create gig.");
      router.push(`/marketplace/cover-art/${payload.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create gig.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-8">
      <Link href="/marketplace/cover-art" className="text-sm text-[var(--muted-foreground)] hover:text-white">
        ← Back to marketplace
      </Link>
      <h1 className="mt-4 text-3xl font-black text-white">List a cover art gig</h1>

      <div className="mt-6 space-y-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Gig title"
          className="w-full rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/40 px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Describe your style, process, and what buyers get…"
          className="w-full rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/40 px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma separated)"
          className="w-full rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/40 px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
        />
        <textarea
          value={imageUrls}
          onChange={(e) => setImageUrls(e.target.value)}
          rows={3}
          placeholder="Portfolio image URLs (one per line)"
          className="w-full rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/40 px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
        />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Packages</h2>
            <button
              type="button"
              onClick={() => setTiers((current) => [...current, { ...EMPTY_TIER, name: `Tier ${current.length + 1}` }])}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]"
            >
              <Plus className="h-3.5 w-3.5" /> Add tier
            </button>
          </div>
          {tiers.map((tier, index) => (
            <div key={index} className="rounded-2xl border border-[var(--muted)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                  Tier {index + 1}
                </span>
                {tiers.length > 1 ? (
                  <button type="button" onClick={() => setTiers((current) => current.filter((_, i) => i !== index))}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={tier.name}
                  onChange={(e) =>
                    setTiers((current) =>
                      current.map((item, i) => (i === index ? { ...item, name: e.target.value } : item))
                    )
                  }
                  placeholder="Package name"
                  className="rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none"
                />
                <input
                  value={tier.price}
                  onChange={(e) =>
                    setTiers((current) =>
                      current.map((item, i) => (i === index ? { ...item, price: e.target.value } : item))
                    )
                  }
                  placeholder="Price USD"
                  className="rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none"
                />
              </div>
              <textarea
                value={tier.description}
                onChange={(e) =>
                  setTiers((current) =>
                    current.map((item, i) => (i === index ? { ...item, description: e.target.value } : item))
                  )
                }
                rows={2}
                placeholder="What's included in this package?"
                className="w-full rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          ))}
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="button"
          disabled={submitting}
          onClick={() => void submit()}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Publish gig
        </button>
      </div>
    </main>
  );
}
