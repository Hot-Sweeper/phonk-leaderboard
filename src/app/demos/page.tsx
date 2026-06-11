import Link from "next/link";
import { Disc3 } from "lucide-react";

export default function DemosInboxPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8">
      <div className="rounded-3xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-8">
        <Disc3 className="mb-3 h-8 w-8 text-[var(--accent)]" />
        <h1 className="text-3xl font-black text-white">Label demo inbox</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Protected audio previews, interest signals, and artist-label matching arrive in Phase 3.
          Label profiles can be created during onboarding — admin verification unlocks the inbox.
        </p>
        <Link
          href="/onboarding"
          className="mt-6 inline-flex rounded-xl border border-[var(--muted)] px-4 py-2.5 text-sm font-semibold text-[var(--muted-foreground)] transition hover:border-[var(--accent)] hover:text-white"
        >
          Set up a label profile
        </Link>
      </div>
    </main>
  );
}
