import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/songs/[id]/snapshots?period=month
 * Returns TrackSnapshot popularity history for a given track.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "month";

  const periods: Record<string, number> = {
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
    year: 365 * 24 * 60 * 60 * 1000,
  };

  const ms = periods[period] ?? periods.month;
  const cutoff = new Date(Date.now() - ms);

  const snapshots = await prisma.trackSnapshot.findMany({
    where: { trackId: id, createdAt: { gte: cutoff } },
    orderBy: { createdAt: "asc" },
    select: { popularity: true, createdAt: true },
  });

  return NextResponse.json(snapshots);
}
