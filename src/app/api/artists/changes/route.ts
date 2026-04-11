import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PERIODS: Record<string, number> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

const PERIOD_ORDER = ["hour", "day", "week", "month", "year"];

/**
 * GET /api/artists/changes?period=hour&skip=0&take=100
 *
 * Returns:
 * - artists with % change in monthly listeners over the given period
 * - availablePeriods: which periods actually have data
 * - totalCount for pagination
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "hour";
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "100", 10) || 100, 200);

  const periodMs = PERIODS[period];
  if (!periodMs) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  const cutoff = new Date(Date.now() - periodMs);

  // Determine which periods have data
  const oldestSnapshot = await prisma.artistSnapshot.findFirst({
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  const availablePeriods: string[] = [];
  if (oldestSnapshot) {
    const dataAge = Date.now() - oldestSnapshot.createdAt.getTime();
    for (const p of PERIOD_ORDER) {
      // Period is available if we have data spanning at least 50% of it
      // (for "hour" we just need any data)
      if (p === "hour" || dataAge >= PERIODS[p] * 0.5) {
        availablePeriods.push(p);
      }
    }
  }

  // Get all artists with their current Spotify stats
  const artists = await prisma.artist.findMany({
    include: {
      links: {
        where: { platform: "SPOTIFY" },
        select: { monthlyListeners: true, followerCount: true },
      },
    },
  });

  const totalCount = artists.length;

  // Get oldest snapshots within the period for each artist (batch query)
  const artistIds = artists.map((a) => a.id);

  // For each artist, find the snapshot closest to the cutoff time
  // We get all snapshots before or near the cutoff and pick the closest
  const oldSnapshots = await prisma.artistSnapshot.findMany({
    where: {
      artistId: { in: artistIds },
      createdAt: { lte: new Date(cutoff.getTime() + periodMs * 0.3) },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["artistId"],
    select: {
      artistId: true,
      monthlyListeners: true,
      followerCount: true,
      createdAt: true,
    },
  });

  const oldMap = new Map(oldSnapshots.map((s) => [s.artistId, s]));

  // Build result with % changes
  const result = artists.map((artist) => {
    const spotify = artist.links[0];
    const currentListeners = spotify?.monthlyListeners ?? 0;
    const currentFollowers = spotify?.followerCount ?? 0;
    const old = oldMap.get(artist.id);
    const oldListeners = old?.monthlyListeners ?? currentListeners;

    let changePercent = 0;
    if (oldListeners > 0 && old) {
      changePercent = ((currentListeners - oldListeners) / oldListeners) * 100;
    }

    return {
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
      monthlyListeners: currentListeners,
      followerCount: currentFollowers,
      changePercent: Math.round(changePercent * 100) / 100,
      hasData: !!old,
    };
  });

  // Sort by absolute change (biggest movers first)
  result.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return NextResponse.json({
    artists: result.slice(skip, skip + take),
    totalCount,
    availablePeriods,
    period,
  });
}
