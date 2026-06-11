"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Disc3, Loader2, Music2 } from "lucide-react";

type DemoItem = {
  id: string;
  title: string;
  artists: string[];
  genre: string | null;
  artworkUrl: string | null;
  interestCount: number;
  createdAt: string;
  myStatus: string | null;
  verifiedInbox?: boolean;
};

export default function DemosInboxPage() {
  const { data: session } = useSession();
  const [demos, setDemos] = useState<DemoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifiedInbox, setVerifiedInbox] = useState(false);

  useEffect(() => {
    if (!session) {
      setLoading(false);
      return;
    }
    void fetch("/api/demos?inbox=1")
      .then((res) => res.json())
      .then((payload) => {
        if (Array.isArray(payload)) {
          setDemos(payload);
          setVerifiedInbox(Boolean(payload[0]?.verifiedInbox));
        }
      })
      .finally(() => setLoading(false));
  }, [session]);

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--accent)]">Demo inbox</p>
          <h1 className="text-3xl font-black text-white">Label scouting</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Listen to protected preview clips and signal interest on new phonk demos.
          </p>
        </div>
        <Link
          href="/demos/my"
          className="rounded-xl border border-[var(--muted)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)] hover:text-white"
        >
          My submissions
        </Link>
      </div>

      {!session ? (
        <div className="rounded-2xl border border-dashed border-[var(--muted)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          Sign in with a label profile to open your demo inbox.
        </div>
      ) : loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
        </div>
      ) : !verifiedInbox && demos.length === 0 ? (
        <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-8">
          <Disc3 className="mb-3 h-8 w-8 text-[var(--accent)]" />
          <p className="text-sm text-[var(--muted-foreground)]">
            Your label profile is pending verification. An admin must verify your label before you can mark interest on demos.
          </p>
        </div>
      ) : demos.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No demos in your inbox yet.</p>
      ) : (
        <div className="space-y-3">
          {demos.map((demo) => (
            <Link
              key={demo.id}
              href={`/demos/${demo.id}`}
              className="flex items-center gap-4 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-4 transition hover:border-[var(--accent)]/40"
            >
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
                <p className="truncate font-bold text-white">{demo.title}</p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">
                  {demo.artists.join(", ") || "Artist"} {demo.genre ? `· ${demo.genre}` : ""}
                </p>
              </div>
              <div className="text-right text-xs">
                <p className="font-bold text-[var(--accent)]">{demo.interestCount} interested</p>
                {demo.myStatus ? (
                  <p className="text-[var(--muted-foreground)]">{demo.myStatus.toLowerCase()}</p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
