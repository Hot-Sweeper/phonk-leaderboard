import Link from "next/link";
import { Megaphone, Music2, Palette, Send } from "lucide-react";

const COMING_SOON = [
  {
    title: "Release announcements",
    description: "Artists post new drops with embeds, links, and optional promotion.",
    icon: Megaphone,
  },
  {
    title: "Collab board",
    description: "Find vocalists, mix engineers, and cover artists for your next track.",
    icon: Music2,
  },
  {
    title: "Cover art marketplace",
    description: "Browse designer gigs and order custom artwork without leaving the forum.",
    icon: Palette,
  },
  {
    title: "Demo pitch inbox",
    description: "Labels review protected previews and signal interest on new talent.",
    icon: Send,
  },
];

export default function CommunityPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8">
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--accent)]">Community</p>
        <h1 className="text-3xl font-black tracking-tight text-white">Phonk Forum feed</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          The unified home for phonk and Brazilian funk — releases, collabs, marketplace
          highlights, and label scouting. Phase 1 profiles are live; the feed ships next.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {COMING_SOON.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5"
          >
            <item.icon className="mb-3 h-5 w-5 text-[var(--accent)]" />
            <h2 className="font-bold text-white">{item.title}</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">{item.description}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-dashed border-[var(--muted)] px-5 py-8 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">
          New here?{" "}
          <Link href="/onboarding" className="font-semibold text-[var(--accent)] hover:underline">
            Set up your profile
          </Link>{" "}
          to join as an artist, label, cover designer, or fan.
        </p>
      </div>
    </main>
  );
}
