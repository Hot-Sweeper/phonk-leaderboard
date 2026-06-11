"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import {
  Brush,
  Check,
  Disc3,
  Loader2,
  Mic2,
  Sparkles,
  Users,
} from "lucide-react";
import { GENRE_SUGGESTIONS, PERSONA_LABELS } from "@/lib/persona-constants";
import type { PersonaType } from "@prisma/client";

const ROLE_OPTIONS: Array<{
  type: PersonaType;
  icon: typeof Mic2;
  title: string;
  description: string;
}> = [
  {
    type: "ARTIST",
    icon: Mic2,
    title: PERSONA_LABELS.ARTIST,
    description: "Submit demos, announce releases, and connect with labels.",
  },
  {
    type: "LABEL",
    icon: Disc3,
    title: PERSONA_LABELS.LABEL,
    description: "Discover demos, show interest, and scout new talent.",
  },
  {
    type: "COVER_ARTIST",
    icon: Brush,
    title: PERSONA_LABELS.COVER_ARTIST,
    description: "Sell cover art packages and build your design portfolio.",
  },
  {
    type: "CONSUMER",
    icon: Users,
    title: PERSONA_LABELS.CONSUMER,
    description: "Follow the scene, buy cover art, and join the community.",
  },
];

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<PersonaType>>(new Set(["CONSUMER"]));
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [genres, setGenres] = useState<string[]>(["phonk"]);
  const [links, setLinks] = useState({
    spotify: "",
    soundcloud: "",
    instagram: "",
    behance: "",
    website: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.name && !displayName) {
      setDisplayName(session.user.name);
    }
  }, [session, displayName]);

  useEffect(() => {
    if (status !== "authenticated") return;
    void fetch("/api/me/personas")
      .then((res) => res.json())
      .then((payload: { needsOnboarding?: boolean; primarySlug?: string | null }) => {
        if (!payload.needsOnboarding && payload.primarySlug) {
          router.replace(`/u/${payload.primarySlug}`);
        }
      })
      .catch(() => null);
  }, [router, status]);

  function toggleRole(type: PersonaType) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        if (next.size === 1) return next;
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  function toggleGenre(genre: string) {
    setGenres((current) =>
      current.includes(genre) ? current.filter((item) => item !== genre) : [...current, genre].slice(0, 12)
    );
  }

  async function submit() {
    if (!session) {
      await signIn("google");
      return;
    }
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    if (selected.size === 0) {
      setError("Pick at least one role.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/me/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          genres,
          personas: Array.from(selected),
          links,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        personas?: Array<{ slug: string }>;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to complete onboarding.");
      }
      const slug = payload.personas?.[0]?.slug;
      router.push(slug ? `/u/${slug}` : "/community");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-5 py-10">
      <div className="space-y-3 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
          <Sparkles className="h-3.5 w-3.5" />
          Welcome to Phonk Forum
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
          Set up your profile
        </h1>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)] sm:text-base">
          Choose how you participate in the phonk and Brazilian funk community. You can pick more
          than one role.
        </p>
      </div>

      {!session ? (
        <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-8 text-center">
          <p className="mb-4 text-sm text-[var(--muted-foreground)]">
            Sign in with Google to create your forum profile.
          </p>
          <button
            onClick={() => signIn("google")}
            className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#a21caf]"
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2">
            {ROLE_OPTIONS.map((role) => {
              const active = selected.has(role.type);
              const Icon = role.icon;
              return (
                <button
                  key={role.type}
                  type="button"
                  onClick={() => toggleRole(role.type)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_24px_var(--accent-glow)]"
                      : "border-[var(--muted)] bg-[var(--secondary)]/40 hover:border-[var(--accent)]/40"
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--muted)]/60">
                      <Icon className="h-5 w-5 text-[var(--accent)]" />
                    </div>
                    {active ? <Check className="h-5 w-5 text-[var(--accent)]" /> : null}
                  </div>
                  <div className="font-bold text-white">{role.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                    {role.description}
                  </p>
                </button>
              );
            })}
          </section>

          <section className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/40 p-5 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Display name
              </label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-xl border border-[var(--muted)] bg-[var(--background)] px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                placeholder="Your artist or brand name"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-[var(--muted)] bg-[var(--background)] px-4 py-2.5 text-sm text-white outline-none focus:border-[var(--accent)]"
                placeholder="Tell the community what you do in phonk / funk…"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Genres
              </label>
              <div className="flex flex-wrap gap-2">
                {GENRE_SUGGESTIONS.map((genre) => {
                  const active = genres.includes(genre);
                  return (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => toggleGenre(genre)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        active
                          ? "bg-[var(--accent)] text-white"
                          : "border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
                      }`}
                    >
                      {genre}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["spotify", "Spotify URL"],
                  ["soundcloud", "SoundCloud URL"],
                  ["instagram", "Instagram URL"],
                  ["behance", "Behance / portfolio URL"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                    {label}
                  </label>
                  <input
                    value={links[key]}
                    onChange={(event) => setLinks((current) => ({ ...current, [key]: event.target.value }))}
                    className="w-full rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                  />
                </div>
              ))}
            </div>
          </section>

          {error ? (
            <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {session.user.image ? (
                <Image
                  src={session.user.image}
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full border border-[var(--muted)]"
                />
              ) : null}
              <div className="text-sm text-[var(--muted-foreground)]">
                Signed in as <span className="font-semibold text-white">{session.user.email}</span>
              </div>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submit()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#a21caf] disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Enter Phonk Forum
            </button>
          </div>
        </>
      )}

      <p className="text-center text-xs text-[var(--muted-foreground)]">
        By continuing you agree to our{" "}
        <Link href="/legal/terms" className="text-[var(--accent)] hover:underline">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/legal/marketplace" className="text-[var(--accent)] hover:underline">
          Marketplace Policy
        </Link>
        .
      </p>
    </main>
  );
}
