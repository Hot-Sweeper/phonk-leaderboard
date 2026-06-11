"use client";

import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Megaphone, Music2, Sparkles } from "lucide-react";

export type ReleasePostData = {
  id: string;
  authorId: string;
  kind: string;
  title: string;
  body: string | null;
  externalUrl: string | null;
  imageUrl: string | null;
  tags: string[];
  createdAt: string;
  persona: {
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    type: string;
    verified: boolean;
  } | null;
  track: {
    id: string;
    name: string;
    albumImageUrl: string | null;
    spotifyUrl: string | null;
    artist: { id: string; name: string };
  } | null;
  promotion: {
    active: boolean;
    endsAt: string | null;
  } | null;
};

const KIND_LABELS: Record<string, string> = {
  RELEASE: "Release",
  UPDATE: "Update",
  COLLAB: "Collab",
  OTHER: "Post",
};

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function ReleasePostCard({
  post,
  showPromote,
  onPromote,
  promoting,
}: {
  post: ReleasePostData;
  showPromote?: boolean;
  onPromote?: (postId: string) => void;
  promoting?: boolean;
}) {
  const cover = post.imageUrl ?? post.track?.albumImageUrl;
  const isPromoted = post.promotion?.active;

  return (
    <article
      className={`rounded-2xl border bg-[var(--secondary)]/30 p-5 transition ${
        isPromoted
          ? "border-amber-400/40 shadow-[0_0_30px_rgba(251,191,36,0.08)]"
          : "border-[var(--muted)]"
      }`}
    >
      <div className="flex items-start gap-3">
        {post.persona?.avatarUrl ? (
          <Image
            src={post.persona.avatarUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover ring-1 ring-white/10"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-white/40">
            {(post.persona?.displayName ?? "?").slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {post.persona ? (
              <Link
                href={`/u/${post.persona.slug}`}
                className="font-bold text-white hover:text-[var(--accent)]"
              >
                {post.persona.displayName}
              </Link>
            ) : (
              <span className="font-bold text-white">Community member</span>
            )}
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/45">
              {KIND_LABELS[post.kind] ?? post.kind}
            </span>
            {isPromoted ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                <Sparkles className="h-3 w-3" />
                Promoted
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{fmtWhen(post.createdAt)}</p>
        </div>
      </div>

      <Link href={`/community/post/${post.id}`} className="mt-4 block group">
        <h2 className="text-lg font-black tracking-tight text-white group-hover:text-[var(--accent)]">
          {post.title}
        </h2>
        {post.body ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--muted-foreground)]">
            {post.body}
          </p>
        ) : null}
      </Link>

      {cover ? (
        <div className="relative mt-4 aspect-[2/1] overflow-hidden rounded-xl border border-white/[0.06]">
          <Image src={cover} alt="" fill sizes="(min-width: 768px) 640px, 100vw" className="object-cover" />
        </div>
      ) : null}

      {post.track ? (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--muted)]/50 bg-black/20 p-3">
          {post.track.albumImageUrl ? (
            <Image
              src={post.track.albumImageUrl}
              alt=""
              width={48}
              height={48}
              className="h-12 w-12 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/[0.06]">
              <Music2 className="h-5 w-5 text-white/30" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{post.track.name}</p>
            <p className="truncate text-xs text-[var(--muted-foreground)]">{post.track.artist.name}</p>
          </div>
        </div>
      ) : null}

      {post.tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] font-semibold text-white/50"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/community/post/${post.id}`}
          className="text-xs font-bold text-[var(--accent)] hover:underline"
        >
          View post
        </Link>
        {post.externalUrl ? (
          <a
            href={post.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white"
          >
            Listen
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {showPromote && onPromote && !isPromoted ? (
          <button
            type="button"
            disabled={promoting}
            onClick={() => onPromote(post.id)}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-amber-300/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-50"
          >
            <Megaphone className="h-3.5 w-3.5" />
            {promoting ? "Starting checkout…" : "Promote post"}
          </button>
        ) : null}
      </div>
    </article>
  );
}
