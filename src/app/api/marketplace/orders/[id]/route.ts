import { NextResponse } from "next/server";
import { CoverArtOrderStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessOrder, serializeOrder } from "@/lib/marketplace";

type RouteContext = { params: Promise<{ id: string }> };

const orderInclude = {
  gig: { select: { id: true, title: true, imageUrls: true } },
  tier: { select: { id: true, name: true } },
  buyer: { select: { id: true, name: true, image: true } },
  seller: { select: { id: true, name: true, image: true } },
  review: { select: { id: true, rating: true, comment: true } },
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await prisma.coverArtOrder.findUnique({
    where: { id },
    include: orderInclude,
  });

  if (!order || !canAccessOrder(order, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  return NextResponse.json(serializeOrder(order));
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await prisma.coverArtOrder.findUnique({ where: { id } });
  if (!order || !canAccessOrder(order, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "start") {
    if (order.sellerId !== session.user.id) {
      return NextResponse.json({ error: "Only the seller can start work." }, { status: 403 });
    }
    if (!["PAID", "IN_PROGRESS"].includes(order.status)) {
      return NextResponse.json({ error: "Order is not ready to start." }, { status: 400 });
    }
    const updated = await prisma.coverArtOrder.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
      include: orderInclude,
    });
    return NextResponse.json(serializeOrder(updated));
  }

  if (action === "deliver") {
    if (order.sellerId !== session.user.id) {
      return NextResponse.json({ error: "Only the seller can deliver." }, { status: 403 });
    }
    const deliveryUrls = Array.isArray(body.deliveryUrls)
      ? body.deliveryUrls.filter((url: unknown): url is string => typeof url === "string").map((url: string) => url.trim()).filter(Boolean)
      : [];
    if (deliveryUrls.length === 0) {
      return NextResponse.json({ error: "At least one delivery URL is required." }, { status: 400 });
    }
    const updated = await prisma.coverArtOrder.update({
      where: { id },
      data: {
        status: "DELIVERED",
        deliveryUrls,
        deliveryNote: typeof body.deliveryNote === "string" ? body.deliveryNote.trim() || null : null,
        deliveredAt: new Date(),
      },
      include: orderInclude,
    });
    return NextResponse.json(serializeOrder(updated));
  }

  if (action === "complete") {
    if (order.buyerId !== session.user.id) {
      return NextResponse.json({ error: "Only the buyer can complete the order." }, { status: 403 });
    }
    if (order.status !== "DELIVERED") {
      return NextResponse.json({ error: "Order must be delivered first." }, { status: 400 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.coverArtOrder.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
        include: orderInclude,
      });
      await tx.coverArtGig.update({
        where: { id: order.gigId },
        data: { orderCount: { increment: 1 } },
      });
      return saved;
    });
    return NextResponse.json(serializeOrder(updated));
  }

  if (action === "cancel") {
    const allowed =
      order.buyerId === session.user.id &&
      (order.status === "PENDING_PAYMENT" || order.status === "PAID");
    if (!allowed && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "This order cannot be cancelled." }, { status: 403 });
    }
    const updated = await prisma.coverArtOrder.update({
      where: { id },
      data: { status: "CANCELLED" satisfies CoverArtOrderStatus },
      include: orderInclude,
    });
    return NextResponse.json(serializeOrder(updated));
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
