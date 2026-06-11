import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { refreshGigRating } from "@/lib/marketplace";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await prisma.coverArtOrder.findUnique({
    where: { id },
    include: { review: true },
  });

  if (!order || order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "COMPLETED") {
    return NextResponse.json({ error: "You can review after completing the order." }, { status: 400 });
  }
  if (order.review) {
    return NextResponse.json({ error: "Review already submitted." }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const rating = Number(body.rating);
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : null;

  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5." }, { status: 400 });
  }

  const review = await prisma.marketplaceReview.create({
    data: {
      orderId: order.id,
      reviewerId: session.user.id,
      revieweeId: order.sellerId,
      rating: Math.round(rating),
      comment,
    },
  });

  await refreshGigRating(order.gigId);

  return NextResponse.json(
    {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
    },
    { status: 201 }
  );
}
