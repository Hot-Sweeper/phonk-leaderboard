import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Brush,
  Disc3,
  ExternalLink,
  Mic2,
  Users,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PERSONA_LABELS } from "@/lib/persona-constants";
import { parsePersonaLinks } from "@/lib/personas";
import type { PersonaType } from "@prisma/client";

type PageProps = { params: Promise<{ slug: string }> };

const PERSONA_ICONS: Record<PersonaType, typeof Mic2> = {
  ARTIST: Mic2,
  LABEL: Disc3,
  COVER_ARTIST: Brush,
  CONSUMER: Users,
};

export default async function UserProfilePage({ params }: PageProps) {
  const { slug } = await params;

  const persona = await prisma.userPersona.findUnique({
    where: { slug },
    include: {
      user: { select: { createdAt: true } },
      artist: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  if (!persona) notFound();

  const labelProfile =
    persona.type === "LABEL"
      ? await prisma.labelProfile.findFirst({
          where: { userId: persona.userId },
          select: { verified: true, guidelines: true, active: true },
        })
      : null;

  const links = parsePersonaLinks(persona.links);
  const Icon = PERSONA_ICONS[persona.type];
  const avatar = persona.avatarUrl;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-8">
      <section className="overflow-hidden rounded-3xl border border-[var(--muted)] bg-[var(--secondary)]/40">
        <div className="h-28 bg-gradient-to-r from-[var(--accent)]/30 via-purple-900/20 to-[var(--background)]" />
        <div className="px-6 pb-6">
          <div className="-mt-10 mb-4 flex items-end gap-4">
            {avatar ? (
              <Image
                src={avatar}
                alt={persona.displayName}
                width={80}
                height={80}
                className="h-20 w-20 rounded-2xl border-4 border-[var(--background)] object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-[var(--background)] bg-[var(--muted)]">
                <Icon className="h-8 w-8 text-[var(--accent)]" />
              </div>
            )}
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black text-white">{persona.displayName}</h1>
                {persona.verified || labelProfile?.verified ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Verified
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                {PERSONA_LABELS[persona.type]} · joined{" "}
                {persona.user.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
              </p>
            </div>
          </div>

          {persona.bio ? (
            <p className="mb-4 text-sm leading-relaxed text-white/80">{persona.bio}</p>
          ) : null}

          {persona.genres.length > 0 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {persona.genres.map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-[var(--muted)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]"
                >
                  {genre}
                </span>
              ))}
            </div>
          ) : null}

          {Object.keys(links).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(links).map(([key, url]) => (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--muted)] px-3 py-1 text-xs font-semibold text-[var(--muted-foreground)] transition hover:border-[var(--accent)] hover:text-white"
                >
                  {key}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {persona.artist ? (
        <section className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            Catalog artist
          </h2>
          <Link
            href={`/artist/${persona.artist.id}`}
            className="inline-flex items-center gap-3 rounded-xl border border-[var(--muted)] px-3 py-2 transition hover:border-[var(--accent)]"
          >
            {persona.artist.imageUrl ? (
              <Image
                src={persona.artist.imageUrl}
                alt=""
                width={40}
                height={40}
                className="rounded-full object-cover"
              />
            ) : null}
            <span className="font-semibold text-white">{persona.artist.name}</span>
          </Link>
        </section>
      ) : null}

      {labelProfile?.guidelines ? (
        <section className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5">
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
            Demo submission guidelines
          </h2>
          <p className="text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
            {labelProfile.guidelines}
          </p>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        {persona.type === "COVER_ARTIST" ? (
          <Link
            href="/marketplace/cover-art"
            className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-5 transition hover:bg-[var(--accent)]/15"
          >
            <h2 className="font-bold text-white">Cover art marketplace</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Gig listings and orders are coming in Phase 2.
            </p>
          </Link>
        ) : null}
        {persona.type === "ARTIST" ? (
          <Link
            href="/demos/my"
            className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5 transition hover:border-[var(--accent)]"
          >
            <h2 className="font-bold text-white">My demo pitches</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              See which labels are interested in your tracks.
            </p>
          </Link>
        ) : null}
        {persona.type === "LABEL" ? (
          <Link
            href="/demos"
            className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5 transition hover:border-[var(--accent)]"
          >
            <h2 className="font-bold text-white">Demo inbox</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">
              Review protected previews and signal interest.
            </p>
          </Link>
        ) : null}
        <Link
          href="/community"
          className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5 transition hover:border-[var(--accent)]"
        >
          <h2 className="font-bold text-white">Community feed</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Release announcements and scene updates.
          </p>
        </Link>
      </section>
    </main>
  );
}
