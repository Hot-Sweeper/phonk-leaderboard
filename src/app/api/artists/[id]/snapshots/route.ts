import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/artists/[id]/snapshots?period=week
 * Returns snapshots for an artist, used for growth charts.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "week";

  const periods: Record<string, number> = {
    hour: 60 * 60 * 1000,
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };

  const ms = periods[period] ?? periods.week;
  const cutoff = new Date(Date.now() - ms);

  const snapshots = await prisma.artistSnapshot.findMany({
    where: {
      artistId: id,
      createdAt: { gte: cutoff },
    },
    orderBy: { createdAt: "asc" },
    select: {
      monthlyListeners: true,
      followerCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json(snapshots);
}
