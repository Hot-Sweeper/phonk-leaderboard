import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { clampSongRating } from "@/lib/community";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id: trackId } = await context.params;
  const session = await auth();

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { id: true },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const [aggregate, userRating] = await Promise.all([
    prisma.songRating.aggregate({
      where: { trackId },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    session?.user?.id
      ? prisma.songRating.findUnique({
          where: { trackId_userId: { trackId, userId: session.user.id } },
          select: { rating: true },
        })
      : null,
  ]);

  return NextResponse.json({
    trackId,
    average: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
    count: aggregate._count.rating,
    userRating: userRating?.rating ?? null,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: trackId } = await context.params;
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    select: { id: true },
  });
  if (!track) {
    return NextResponse.json({ error: "Track not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const rawRating = typeof body?.rating === "number" ? body.rating : Number(body?.rating);
  if (!Number.isFinite(rawRating)) {
    return NextResponse.json({ error: "Rating must be a number from 1 to 5." }, { status: 400 });
  }
  const rating = clampSongRating(rawRating);

  const saved = await prisma.songRating.upsert({
    where: { trackId_userId: { trackId, userId: session.user.id } },
    create: { trackId, userId: session.user.id, rating },
    update: { rating },
    select: { rating: true },
  });

  const aggregate = await prisma.songRating.aggregate({
    where: { trackId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  return NextResponse.json({
    trackId,
    userRating: saved.rating,
    average: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
    count: aggregate._count.rating,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id: trackId } = await context.params;
  await prisma.songRating.deleteMany({
    where: { trackId, userId: session.user.id },
  });

  const aggregate = await prisma.songRating.aggregate({
    where: { trackId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  return NextResponse.json({
    trackId,
    userRating: null,
    average: aggregate._avg.rating ? Number(aggregate._avg.rating.toFixed(2)) : null,
    count: aggregate._count.rating,
  });
}
