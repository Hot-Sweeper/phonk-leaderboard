import { CoverArtOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatMarketplacePrice, ORDER_STATUS_LABELS as STATUS_LABELS } from "@/lib/marketplace-format";

export { formatMarketplacePrice } from "@/lib/marketplace-format";

export async function userHasCoverArtistPersona(userId: string) {
  const persona = await prisma.userPersona.findUnique({
    where: { userId_type: { userId, type: "COVER_ARTIST" } },
    select: { id: true },
  });
  return Boolean(persona);
}

export async function refreshGigRating(gigId: string) {
  const reviews = await prisma.marketplaceReview.findMany({
    where: { order: { gigId } },
    select: { rating: true },
  });
  const ratingCount = reviews.length;
  const ratingAverage =
    ratingCount > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / ratingCount : null;

  await prisma.coverArtGig.update({
    where: { id: gigId },
    data: { ratingAverage, ratingCount },
  });
}

export async function refreshSellerRating(userId: string) {
  const reviews = await prisma.marketplaceReview.findMany({
    where: { revieweeId: userId },
    select: { rating: true },
  });
  return {
    ratingCount: reviews.length,
    ratingAverage:
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : null,
  };
}

export function canAccessOrder(
  order: { buyerId: string; sellerId: string },
  userId: string,
  role?: string
) {
  return order.buyerId === userId || order.sellerId === userId || role === "ADMIN";
}

export const ORDER_STATUS_LABELS: Record<CoverArtOrderStatus, string> = STATUS_LABELS;

export function serializeGig(gig: {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  tags: string[];
  imageUrls: string[];
  deliveryDays: number;
  revisions: number;
  published: boolean;
  ratingAverage: number | null;
  ratingCount: number;
  orderCount: number;
  createdAt: Date;
  updatedAt: Date;
  tiers?: Array<{
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    deliveryDays: number | null;
    revisions: number | null;
    sortOrder: number;
  }>;
  seller?: {
    id: string;
    name: string | null;
    image: string | null;
    personas?: Array<{ slug: string; displayName: string; avatarUrl: string | null }>;
  };
}) {
  const coverPersona = gig.seller?.personas?.[0];
  return {
    id: gig.id,
    sellerId: gig.sellerId,
    title: gig.title,
    description: gig.description,
    tags: gig.tags,
    imageUrls: gig.imageUrls,
    deliveryDays: gig.deliveryDays,
    revisions: gig.revisions,
    published: gig.published,
    ratingAverage: gig.ratingAverage,
    ratingCount: gig.ratingCount,
    orderCount: gig.orderCount,
    tiers: gig.tiers ?? [],
    seller: gig.seller
      ? {
          id: gig.seller.id,
          name: coverPersona?.displayName ?? gig.seller.name,
          slug: coverPersona?.slug ?? null,
          avatarUrl: coverPersona?.avatarUrl ?? gig.seller.image,
        }
      : undefined,
    createdAt: gig.createdAt.toISOString(),
    updatedAt: gig.updatedAt.toISOString(),
  };
}

export function serializeOrder(order: {
  id: string;
  gigId: string;
  tierId: string;
  buyerId: string;
  sellerId: string;
  status: CoverArtOrderStatus;
  brief: string;
  priceCents: number;
  currency: string;
  deliveryUrls: string[];
  deliveryNote: string | null;
  paidAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  gig?: { id: string; title: string; imageUrls: string[] };
  tier?: { id: string; name: string };
  buyer?: { id: string; name: string | null; image: string | null };
  seller?: { id: string; name: string | null; image: string | null };
  review?: { id: string; rating: number; comment: string | null } | null;
}) {
  return {
    ...order,
    paidAt: order.paidAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    completedAt: order.completedAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
