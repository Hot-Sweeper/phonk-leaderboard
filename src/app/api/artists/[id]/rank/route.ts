import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/artists/[id]/rank
 *
 * Returns:
 * - currentRank: today's rank (or null)
 * - previousRank: yesterday's rank (or null)
 * - rankChange: difference (positive = moved up, negative = moved down)
 * - podiumStreak: { current: number, best: number }
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Get all rank snapshots for this artist, ordered by date desc
  const ranks = await prisma.rankSnapshot.findMany({
    where: { artistId: id },
    orderBy: { date: "desc" },
    select: { rank: true, date: true },
  });

  if (ranks.length === 0) {
    return NextResponse.json({
      currentRank: null,
      previousRank: null,
      rankChange: 0,
      podiumStreak: { current: 0, best: 0 },
    });
  }

  const currentRank = ranks[0]?.rank ?? null;
  const previousRank = ranks[1]?.rank ?? null;
  const rankChange = previousRank != null && currentRank != null
    ? previousRank - currentRank  // positive = moved up
    : 0;

  // Compute podium streaks (top 3)
  let currentStreak = 0;
  let bestStreak = 0;
  let streak = 0;
  let prevDate: string | null = null;

  for (const r of ranks) {
    const isOnPodium = r.rank <= 3;

    if (prevDate) {
      // Check if dates are consecutive
      const prev = new Date(prevDate);
      const curr = new Date(r.date);
      const diffDays = Math.round((prev.getTime() - curr.getTime()) / (24 * 60 * 60 * 1000));

      if (isOnPodium && diffDays === 1) {
        streak++;
      } else if (isOnPodium && diffDays > 1) {
        // Gap in data — break streak
        bestStreak = Math.max(bestStreak, streak);
        streak = 1;
      } else {
        bestStreak = Math.max(bestStreak, streak);
        streak = 0;
      }
    } else {
      // First entry
      streak = isOnPodium ? 1 : 0;
    }

    // Set current streak only from the most recent consecutive podium entries
    if (prevDate === null && isOnPodium) {
      currentStreak = -1; // marker: still counting
    }

    prevDate = r.date;
  }
  bestStreak = Math.max(bestStreak, streak);

  // Compute current streak properly: count from the most recent date
  currentStreak = 0;
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i].rank > 3) break;
    if (i > 0) {
      const prev = new Date(ranks[i - 1].date);
      const curr = new Date(ranks[i].date);
      const diffDays = Math.round((prev.getTime() - curr.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays !== 1) break;
    }
    currentStreak++;
  }

  return NextResponse.json({
    currentRank,
    previousRank,
    rankChange,
    podiumStreak: { current: currentStreak, best: bestStreak },
  });
}
