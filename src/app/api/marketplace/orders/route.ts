import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeOrder } from "@/lib/marketplace";

const orderInclude = {
  gig: { select: { id: true, title: true, imageUrls: true } },
  tier: { select: { id: true, name: true } },
  buyer: { select: { id: true, name: true, image: true } },
  seller: { select: { id: true, name: true, image: true } },
  review: { select: { id: true, rating: true, comment: true } },
};

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const role = new URL(request.url).searchParams.get("role");
  const where =
    role === "seller"
      ? { sellerId: session.user.id }
      : role === "buyer"
        ? { buyerId: session.user.id }
        : {
            OR: [{ buyerId: session.user.id }, { sellerId: session.user.id }],
          };

  const orders = await prisma.coverArtOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: orderInclude,
  });

  return NextResponse.json(orders.map(serializeOrder));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const gigId = typeof body.gigId === "string" ? body.gigId : "";
  const tierId = typeof body.tierId === "string" ? body.tierId : "";
  const brief = typeof body.brief === "string" ? body.brief.trim() : "";

  if (!gigId || !tierId || !brief) {
    return NextResponse.json({ error: "Gig, tier, and brief are required." }, { status: 400 });
  }

  const gig = await prisma.coverArtGig.findUnique({
    where: { id: gigId },
    include: { tiers: true },
  });
  if (!gig || !gig.published) {
    return NextResponse.json({ error: "Gig not found." }, { status: 404 });
  }
  if (gig.sellerId === session.user.id) {
    return NextResponse.json({ error: "You cannot order your own gig." }, { status: 400 });
  }

  const tier = gig.tiers.find((item) => item.id === tierId);
  if (!tier) {
    return NextResponse.json({ error: "Tier not found." }, { status: 404 });
  }

  const order = await prisma.coverArtOrder.create({
    data: {
      gigId: gig.id,
      tierId: tier.id,
      buyerId: session.user.id,
      sellerId: gig.sellerId,
      brief,
      priceCents: tier.priceCents,
      currency: tier.currency,
      status: "PENDING_PAYMENT",
    },
    include: orderInclude,
  });

  return NextResponse.json(serializeOrder(order), { status: 201 });
}
