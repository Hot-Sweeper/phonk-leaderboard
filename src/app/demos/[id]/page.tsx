"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Music2 } from "lucide-react";
import ProtectedDemoPlayer from "@/components/demos/ProtectedDemoPlayer";

type DemoDetail = {
  id: string;
  artistId: string;
  title: string;
  artists: string[];
  genre: string | null;
  artworkUrl: string | null;
  soundcloudUrl: string;
  previewStartMs: number;
  previewDurationMs: number;
  message: string | null;
  samplePackUrl: string | null;
  interestCount: number;
  interests?: Array<{ label: { name: string; slug: string }; status: string }>;
};

export default function DemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = useSession();
  const [demoId, setDemoId] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoDetail | null>(null);
  const [peerInterestCount, setPeerInterestCount] = useState(0);
  const [peerInterestVisible, setPeerInterestVisible] = useState(false);
  const [myStatus, setMyStatus] = useState<string | null>(null);
  const [canActAsLabel, setCanActAsLabel] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void params.then(({ id }) => setDemoId(id));
  }, [params]);

  async function reload() {
    if (!demoId) return;
    const response = await fetch(`/api/demos/${demoId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Failed to load demo.");
    setDemo(payload.demo);
    setPeerInterestCount(payload.peerInterestCount ?? 0);
    setPeerInterestVisible(Boolean(payload.peerInterestVisible));
    setMyStatus(payload.myStatus ?? null);
    setCanActAsLabel(Boolean(payload.canActAsLabel));
  }

  useEffect(() => {
    if (!demoId) return;
    setLoading(true);
    void reload()
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load demo."))
      .finally(() => setLoading(false));
  }, [demoId]);

  async function setInterest(status: "INTERESTED" | "PASSED" | "SHORTLISTED") {
    if (!demoId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/demos/${demoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !demo) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        {error ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
        )}
      </main>
    );
  }

  const isArtist = session?.user?.id === demo.artistId;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 space-y-6">
      <Link href={isArtist ? "/demos/my" : "/demos"} className="text-sm text-[var(--muted-foreground)] hover:text-white">
        ← Back
      </Link>

      <section className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-[var(--secondary)]">
          {demo.artworkUrl ? (
            <Image src={demo.artworkUrl} alt="" fill className="object-cover" unoptimized />
          ) : (
            <div className="flex h-full items-center justify-center">
              <Music2 className="h-8 w-8 text-[var(--muted-foreground)]" />
            </div>
          )}
        </div>
        <div>
          <h1 className="text-2xl font-black text-white">{demo.title}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {demo.artists.join(", ")} {demo.genre ? `· ${demo.genre}` : ""}
          </p>
          {peerInterestVisible ? (
            <p className="mt-2 text-sm font-semibold text-[var(--accent)]">
              {peerInterestCount} label{peerInterestCount === 1 ? "" : "s"} interested
            </p>
          ) : null}
        </div>
      </section>

      {demo.soundcloudUrl ? (
        <ProtectedDemoPlayer
          soundcloudUrl={demo.soundcloudUrl}
          previewStartMs={demo.previewStartMs}
          previewDurationMs={demo.previewDurationMs}
          title={demo.title}
        />
      ) : null}

      {demo.message ? (
        <section className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Artist note</p>
          <p className="mt-2 text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{demo.message}</p>
        </section>
      ) : null}

      {demo.interests && demo.interests.length > 0 ? (
        <section className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Interested labels</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {demo.interests.map((interest) => (
              <Link
                key={interest.label.slug}
                href={`/u/${interest.label.slug}`}
                className="rounded-full border border-[var(--muted)] px-3 py-1 text-xs font-semibold text-white"
              >
                {interest.label.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {canActAsLabel ? (
        <section className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || myStatus === "INTERESTED"}
            onClick={() => void setInterest("INTERESTED")}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Interested
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setInterest("SHORTLISTED")}
            className="rounded-xl border border-[var(--muted)] px-4 py-2 text-sm font-semibold text-white"
          >
            Shortlist
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void setInterest("PASSED")}
            className="rounded-xl border border-red-500/30 px-4 py-2 text-sm font-semibold text-red-300"
          >
            Pass
          </button>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </main>
  );
}
