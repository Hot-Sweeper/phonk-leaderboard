import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  BillingConfigError,
  createPaddlePromotedPostCheckout,
  isPromotedPostCheckoutConfigured,
  promotedPostPriceId,
} from "@/lib/billing/paddle";
import { prisma } from "@/lib/prisma";
import { releasePostInclude, serializeReleasePost } from "@/lib/community";

const IS_DEV = process.env.NODE_ENV === "development";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: postId } = await context.params;
  const post = await prisma.releasePost.findFirst({
    where: { id: postId, active: true, authorId: session.user.id },
    include: releasePostInclude,
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  const existing = await prisma.promotedPost.findUnique({ where: { postId } });
  if (existing?.status === "ACTIVE" && existing.endsAt && existing.endsAt.getTime() > Date.now()) {
    return NextResponse.json({ error: "This post is already promoted." }, { status: 400 });
  }

  const promotion =
    existing ??
    (await prisma.promotedPost.create({
      data: {
        postId,
        userId: session.user.id,
        status: "PENDING_PAYMENT",
      },
    }));

  if (promotion.status === "ACTIVE") {
    return NextResponse.json({
      promotion: {
        id: promotion.id,
        status: promotion.status,
        startsAt: promotion.startsAt?.toISOString() ?? null,
        endsAt: promotion.endsAt?.toISOString() ?? null,
      },
    });
  }

  const priceId = promotedPostPriceId();
  if (!priceId && !IS_DEV) {
    return NextResponse.json(
      { error: "Promoted post checkout is not configured yet." },
      { status: 503 }
    );
  }

  if (!isPromotedPostCheckoutConfigured() && IS_DEV) {
    const now = new Date();
    const endsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const activated = await prisma.promotedPost.update({
      where: { id: promotion.id },
      data: { status: "ACTIVE", startsAt: now, endsAt },
      include: { post: { include: releasePostInclude } },
    });
    return NextResponse.json({
      simulated: true,
      post: serializeReleasePost(activated.post),
    });
  }

  if (!priceId) {
    return NextResponse.json({ error: "Missing Paddle price ID." }, { status: 503 });
  }

  try {
    const origin = new URL(request.url).origin;
    const { checkoutUrl, transactionId } = await createPaddlePromotedPostCheckout({
      user: session.user,
      promotionId: promotion.id,
      priceId,
      origin,
      successPath: `/community/post/${postId}`,
    });

    if (transactionId) {
      await prisma.promotedPost.update({
        where: { id: promotion.id },
        data: { paddleTransactionId: transactionId },
      });
    }

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    const status = error instanceof BillingConfigError ? 503 : 500;
    const message = error instanceof Error ? error.message : "Failed to create checkout.";
    return NextResponse.json({ error: message }, { status });
  }
}
