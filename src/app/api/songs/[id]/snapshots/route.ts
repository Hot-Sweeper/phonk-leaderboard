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
  const now = new Date();

  const [track, baselineSnapshot, snapshots] = await Promise.all([
    prisma.track.findUnique({
      where: { id },
      select: { popularity: true },
    }),
    prisma.trackSnapshot.findFirst({
      where: { trackId: id, createdAt: { lte: cutoff }, popularity: { gt: 0 } },
      orderBy: { createdAt: "desc" },
      select: { popularity: true, createdAt: true },
    }),
    prisma.trackSnapshot.findMany({
      where: { trackId: id, createdAt: { gte: cutoff }, popularity: { gt: 0 } },
      orderBy: { createdAt: "asc" },
      select: { popularity: true, createdAt: true },
    }),
  ]);

  if (!track) {
    return NextResponse.json([], { status: 404 });
  }

  const series = [
    ...(baselineSnapshot ? [baselineSnapshot] : []),
    ...snapshots,
  ];

  const dedupedSeries = series.filter((point, index) => {
    if (index === 0) return true;
    const previous = series[index - 1];
    return previous.createdAt.getTime() !== point.createdAt.getTime();
  });

  const lastPoint = dedupedSeries[dedupedSeries.length - 1];
  const hasFreshEndpoint = lastPoint && now.getTime() - lastPoint.createdAt.getTime() <= 5 * 60 * 1000;
  if (track.popularity > 0 && (!lastPoint || !hasFreshEndpoint || lastPoint.popularity !== track.popularity)) {
    dedupedSeries.push({
      popularity: track.popularity,
      createdAt: now,
    });
  }

  return NextResponse.json(dedupedSeries);
}
