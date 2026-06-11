import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGig, userHasCoverArtistPersona } from "@/lib/marketplace";

const gigInclude = {
  tiers: { orderBy: { sortOrder: "asc" as const } },
  seller: {
    select: {
      id: true,
      name: true,
      image: true,
      personas: {
        where: { type: "COVER_ARTIST" as const },
        select: { slug: true, displayName: true, avatarUrl: true },
        take: 1,
      },
    },
  },
};

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine") === "1";
  const tag = searchParams.get("tag")?.trim().toLowerCase();
  const q = searchParams.get("q")?.trim();

  const where = mine
    ? { sellerId: session?.user?.id ?? "__none__" }
    : { published: true };

  const gigs = await prisma.coverArtGig.findMany({
    where: {
      ...where,
      ...(tag ? { tags: { has: tag } } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ orderCount: "desc" }, { createdAt: "desc" }],
    include: gigInclude,
  });

  return NextResponse.json(gigs.map(serializeGig));
}

type TierInput = {
  name?: unknown;
  description?: unknown;
  priceCents?: unknown;
  currency?: unknown;
  deliveryDays?: unknown;
  revisions?: unknown;
  paddlePriceId?: unknown;
};

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";
  if (!isAdmin && !(await userHasCoverArtistPersona(session.user.id))) {
    return NextResponse.json(
      { error: "Cover Artist profile required to list gigs." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!title || !description) {
    return NextResponse.json({ error: "Title and description are required." }, { status: 400 });
  }

  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string").map((tag: string) => tag.trim().toLowerCase()).filter(Boolean).slice(0, 12)
    : [];
  const imageUrls = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((url: unknown): url is string => typeof url === "string").map((url: string) => url.trim()).filter(Boolean).slice(0, 8)
    : [];
  const tiersRaw = Array.isArray(body.tiers) ? (body.tiers as TierInput[]) : [];
  if (tiersRaw.length === 0) {
    return NextResponse.json({ error: "At least one pricing tier is required." }, { status: 400 });
  }

  const tiers = tiersRaw
    .map((tier, index) => {
      const name = typeof tier.name === "string" ? tier.name.trim() : "";
      const priceCents = Number(tier.priceCents);
      if (!name || !Number.isFinite(priceCents) || priceCents < 0) return null;
      return {
        name,
        description: typeof tier.description === "string" ? tier.description.trim() || null : null,
        priceCents: Math.round(priceCents),
        currency: typeof tier.currency === "string" ? tier.currency.toUpperCase() : "USD",
        deliveryDays: Number.isFinite(Number(tier.deliveryDays)) ? Number(tier.deliveryDays) : null,
        revisions: Number.isFinite(Number(tier.revisions)) ? Number(tier.revisions) : null,
        paddlePriceId:
          typeof tier.paddlePriceId === "string" ? tier.paddlePriceId.trim() || null : null,
        sortOrder: index,
      };
    })
    .filter(Boolean) as Array<{
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    deliveryDays: number | null;
    revisions: number | null;
    paddlePriceId: string | null;
    sortOrder: number;
  }>;

  if (tiers.length === 0) {
    return NextResponse.json({ error: "Invalid pricing tiers." }, { status: 400 });
  }

  const gig = await prisma.coverArtGig.create({
    data: {
      sellerId: session.user.id,
      title,
      description,
      tags,
      imageUrls,
      deliveryDays: Number.isFinite(Number(body.deliveryDays)) ? Number(body.deliveryDays) : 3,
      revisions: Number.isFinite(Number(body.revisions)) ? Number(body.revisions) : 2,
      published: isAdmin ? body.published !== false : true,
      tiers: { create: tiers },
    },
    include: gigInclude,
  });

  return NextResponse.json(serializeGig(gig), { status: 201 });
}
