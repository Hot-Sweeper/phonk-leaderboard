import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessOrder } from "@/lib/marketplace";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await prisma.coverArtOrder.findUnique({ where: { id } });
  if (!order || !canAccessOrder(order, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const messages = await prisma.orderMessage.findMany({
    where: { orderId: id },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, name: true, image: true } },
    },
  });

  return NextResponse.json(
    messages.map((message) => ({
      id: message.id,
      orderId: message.orderId,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      sender: message.sender,
    }))
  );
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const order = await prisma.coverArtOrder.findUnique({ where: { id } });
  if (!order || !canAccessOrder(order, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status)) {
    return NextResponse.json({ error: "Chat opens after payment." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message cannot be empty." }, { status: 400 });
  }

  const message = await prisma.orderMessage.create({
    data: {
      orderId: id,
      senderId: session.user.id,
      body: text.slice(0, 4000),
    },
    include: {
      sender: { select: { id: true, name: true, image: true } },
    },
  });

  if (order.status === "PAID") {
    await prisma.coverArtOrder.update({
      where: { id },
      data: { status: "IN_PROGRESS" },
    });
  }

  return NextResponse.json(
    {
      id: message.id,
      orderId: message.orderId,
      senderId: message.senderId,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      sender: message.sender,
    },
    { status: 201 }
  );
}
