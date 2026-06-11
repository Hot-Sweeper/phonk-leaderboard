import { PromotedPostStatus, ReleasePostKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const PROMOTION_DURATION_DAYS = 7;

export const RELEASE_POST_KINDS: ReleasePostKind[] = ["RELEASE", "UPDATE", "COLLAB", "OTHER"];

export async function getPersonaForUser(userId: string, personaId?: string | null) {
  if (personaId) {
    return prisma.userPersona.findFirst({
      where: { id: personaId, userId },
    });
  }
  return prisma.userPersona.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
}

export function isPromotionActive(status: PromotedPostStatus, endsAt: Date | null | undefined) {
  if (status !== "ACTIVE") return false;
  if (!endsAt) return true;
  return endsAt.getTime() > Date.now();
}

export function serializeReleasePost(post: {
  id: string;
  authorId: string;
  personaId: string | null;
  kind: string;
  title: string;
  body: string | null;
  trackId: string | null;
  externalUrl: string | null;
  imageUrl: string | null;
  tags: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  author?: { id: string; name: string | null; image: string | null };
  persona?: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    type: string;
    verified: boolean;
  } | null;
  track?: {
    id: string;
    name: string;
    albumImageUrl: string | null;
    spotifyUrl: string | null;
    artist: { id: string; name: string };
  } | null;
  promotion?: {
    id: string;
    status: string;
    startsAt: Date | null;
    endsAt: Date | null;
  } | null;
}) {
  const promotion = post.promotion
    ? {
        id: post.promotion.id,
        status: post.promotion.status,
        startsAt: post.promotion.startsAt?.toISOString() ?? null,
        endsAt: post.promotion.endsAt?.toISOString() ?? null,
        active: isPromotionActive(
          post.promotion.status as PromotedPostStatus,
          post.promotion.endsAt
        ),
      }
    : null;

  return {
    id: post.id,
    authorId: post.authorId,
    personaId: post.personaId,
    kind: post.kind,
    title: post.title,
    body: post.body,
    trackId: post.trackId,
    externalUrl: post.externalUrl,
    imageUrl: post.imageUrl,
    tags: post.tags,
    active: post.active,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    author: post.author
      ? { id: post.author.id, name: post.author.name, image: post.author.image }
      : undefined,
    persona: post.persona
      ? {
          id: post.persona.id,
          slug: post.persona.slug,
          displayName: post.persona.displayName,
          avatarUrl: post.persona.avatarUrl,
          type: post.persona.type,
          verified: post.persona.verified,
        }
      : null,
    track: post.track
      ? {
          id: post.track.id,
          name: post.track.name,
          albumImageUrl: post.track.albumImageUrl,
          spotifyUrl: post.track.spotifyUrl,
          artist: post.track.artist,
        }
      : null,
    promotion,
  };
}

export const releasePostInclude = {
  author: { select: { id: true, name: true, image: true } },
  persona: {
    select: {
      id: true,
      slug: true,
      displayName: true,
      avatarUrl: true,
      type: true,
      verified: true,
    },
  },
  track: {
    select: {
      id: true,
      name: true,
      albumImageUrl: true,
      spotifyUrl: true,
      artist: { select: { id: true, name: true } },
    },
  },
  promotion: {
    select: { id: true, status: true, startsAt: true, endsAt: true },
  },
} as const;

export async function activatePromotion(promotionId: string, transactionId?: string | null) {
  const now = new Date();
  const endsAt = new Date(now.getTime() + PROMOTION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  return prisma.promotedPost.update({
    where: { id: promotionId },
    data: {
      status: "ACTIVE",
      startsAt: now,
      endsAt,
      paddleTransactionId: transactionId ?? undefined,
    },
    include: {
      post: { include: releasePostInclude },
    },
  });
}

export function clampSongRating(value: number) {
  return Math.max(1, Math.min(5, Math.round(value)));
}
