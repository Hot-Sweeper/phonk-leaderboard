import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  BillingConfigError,
  createPaddleMarketplaceCheckout,
  isMarketplaceCheckoutConfigured,
  marketplacePriceId,
} from "@/lib/billing/paddle";
import { prisma } from "@/lib/prisma";
import { canAccessOrder, serializeOrder } from "@/lib/marketplace";

const IS_DEV = process.env.NODE_ENV === "development";

type RouteContext = { params: Promise<{ id: string }> };

const orderInclude = {
  gig: { select: { id: true, title: true, imageUrls: true } },
  tier: { select: { id: true, name: true, paddlePriceId: true } },
  buyer: { select: { id: true, name: true, image: true } },
  seller: { select: { id: true, name: true, image: true } },
  review: { select: { id: true, rating: true, comment: true } },
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await prisma.coverArtOrder.findUnique({
    where: { id },
    include: orderInclude,
  });

  if (!order || order.buyerId !== session.user.id) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "PENDING_PAYMENT") {
    return NextResponse.json({ error: "Order is not awaiting payment." }, { status: 400 });
  }

  const priceId = order.tier.paddlePriceId ?? marketplacePriceId();
  if (!priceId && !IS_DEV) {
    return NextResponse.json(
      { error: "Marketplace checkout is not configured yet." },
      { status: 503 }
    );
  }

  if (!isMarketplaceCheckoutConfigured() && IS_DEV) {
    const paid = await prisma.coverArtOrder.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date() },
      include: orderInclude,
    });
    return NextResponse.json({
      simulated: true,
      order: serializeOrder(paid),
    });
  }

  if (!priceId) {
    return NextResponse.json({ error: "Missing Paddle price ID." }, { status: 503 });
  }

  try {
    const origin = new URL(_request.url).origin;
    const { checkoutUrl, transactionId } = await createPaddleMarketplaceCheckout({
      user: session.user,
      orderId: order.id,
      priceId,
      origin,
      successPath: `/marketplace/orders/${order.id}`,
    });

    if (transactionId) {
      await prisma.coverArtOrder.update({
        where: { id },
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
