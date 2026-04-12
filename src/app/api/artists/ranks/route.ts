import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/artists/ranks
 * Returns a map of artistId -> { currentRank, previousRank, rankChange }
 * for the leaderboard position change arrows.
 */
export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [todayRanks, yesterdayRanks] = await Promise.all([
    prisma.rankSnapshot.findMany({
      where: { date: today },
      select: { artistId: true, rank: true },
    }),
    prisma.rankSnapshot.findMany({
      where: { date: yesterday },
      select: { artistId: true, rank: true },
    }),
  ]);

  const yesterdayMap = new Map(yesterdayRanks.map((r) => [r.artistId, r.rank]));

  const result: Record<string, { currentRank: number; previousRank: number | null; rankChange: number }> = {};

  for (const r of todayRanks) {
    const prev = yesterdayMap.get(r.artistId) ?? null;
    result[r.artistId] = {
      currentRank: r.rank,
      previousRank: prev,
      rankChange: prev != null ? prev - r.rank : 0,
    };
  }

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
