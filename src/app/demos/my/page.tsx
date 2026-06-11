"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Music2, Send } from "lucide-react";

type DemoItem = {
  id: string;
  title: string;
  artists: string[];
  genre: string | null;
  artworkUrl: string | null;
  interestCount: number;
  createdAt: string;
  interests?: Array<{ label: { name: string; slug: string }; status: string }>;
};

export default function MyDemosPage() {
  const { data: session } = useSession();
  const [demos, setDemos] = useState<DemoItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    void fetch("/api/demos?mine=1")
      .then((res) => res.json())
      .then((payload) => {
        if (Array.isArray(payload)) setDemos(payload);
      })
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">My demo pitches</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Track which labels are interested in your submissions.
          </p>
        </div>
        <Link
          href="/submit"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Send className="h-4 w-4" />
          Submit new demo
        </Link>
      </div>

      {!session ? (
        <p className="text-sm text-[var(--muted-foreground)]">Sign in to view your demo pitches.</p>
      ) : loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
        </div>
      ) : demos.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No demos submitted yet.</p>
      ) : (
        <div className="space-y-4">
          {demos.map((demo) => (
            <div
              key={demo.id}
              className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-4"
            >
              <div className="flex items-start gap-4">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--background)]">
                  {demo.artworkUrl ? (
                    <Image src={demo.artworkUrl} alt="" fill className="object-cover" unoptimized />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Music2 className="h-6 w-6 text-[var(--muted-foreground)]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/demos/${demo.id}`} className="font-bold text-white hover:text-[var(--accent)]">
                    {demo.title}
                  </Link>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {demo.artists.join(", ")} · {new Date(demo.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[var(--accent)]">
                    {demo.interestCount} label{demo.interestCount === 1 ? "" : "s"} interested
                  </p>
                  {demo.interests && demo.interests.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {demo.interests.map((interest) => (
                        <Link
                          key={interest.label.slug}
                          href={`/u/${interest.label.slug}`}
                          className="rounded-full border border-[var(--muted)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-white"
                        >
                          {interest.label.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
