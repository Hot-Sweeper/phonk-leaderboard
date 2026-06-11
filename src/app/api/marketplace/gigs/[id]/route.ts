import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeGig } from "@/lib/marketplace";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = await auth();

  const gig = await prisma.coverArtGig.findUnique({
    where: { id },
    include: gigInclude,
  });

  if (!gig || (!gig.published && gig.sellerId !== session?.user?.id && session?.user?.role !== "ADMIN")) {
    return NextResponse.json({ error: "Gig not found." }, { status: 404 });
  }

  return NextResponse.json(serializeGig(gig));
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const gig = await prisma.coverArtGig.findUnique({ where: { id } });
  if (!gig) return NextResponse.json({ error: "Gig not found." }, { status: 404 });
  if (gig.sellerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.title === "string") data.title = body.title.trim();
  if (typeof body.description === "string") data.description = body.description.trim();
  if (Array.isArray(body.tags)) {
    data.tags = body.tags
      .filter((tag: unknown): tag is string => typeof tag === "string")
      .map((tag: string) => tag.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 12);
  }
  if (Array.isArray(body.imageUrls)) {
    data.imageUrls = body.imageUrls
      .filter((url: unknown): url is string => typeof url === "string")
      .map((url: string) => url.trim())
      .filter(Boolean)
      .slice(0, 8);
  }
  if (typeof body.published === "boolean") data.published = body.published;
  if (Number.isFinite(Number(body.deliveryDays))) data.deliveryDays = Number(body.deliveryDays);
  if (Number.isFinite(Number(body.revisions))) data.revisions = Number(body.revisions);

  const updated = await prisma.coverArtGig.update({
    where: { id },
    data,
    include: gigInclude,
  });

  return NextResponse.json(serializeGig(updated));
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const gig = await prisma.coverArtGig.findUnique({ where: { id } });
  if (!gig) return NextResponse.json({ error: "Gig not found." }, { status: 404 });
  if (gig.sellerId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  await prisma.coverArtGig.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
