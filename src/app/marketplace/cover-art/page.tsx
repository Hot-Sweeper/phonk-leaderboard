import Link from "next/link";
import { Brush, Sparkles } from "lucide-react";

export default function CoverArtMarketplacePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8">
      <div className="rounded-3xl border border-[var(--accent)]/20 bg-[var(--accent)]/5 p-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
          <Sparkles className="h-3.5 w-3.5" />
          Phase 2
        </div>
        <h1 className="text-3xl font-black text-white">Cover art marketplace</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Designers will list packages, buyers will order through embedded Paddle checkout, and
          order chat will stay on-site. Profiles and roles are ready — gigs ship next.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#a21caf]"
          >
            <Brush className="h-4 w-4" />
            Become a cover artist
          </Link>
          <Link
            href="/community"
            className="rounded-xl border border-[var(--muted)] px-4 py-2.5 text-sm font-semibold text-[var(--muted-foreground)] transition hover:text-white"
          >
            Back to community
          </Link>
        </div>
      </div>
    </main>
  );
}
