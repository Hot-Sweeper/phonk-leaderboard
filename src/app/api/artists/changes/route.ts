import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PERIODS: Record<string, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

const PERIOD_ORDER = ["day", "week", "month", "year"];

type MetricKey = "listeners" | "followers" | "youtube" | "tiktok" | "instagram";

const METRIC_KEYS: MetricKey[] = ["listeners", "followers", "youtube", "tiktok", "instagram"];

function getMetricFromSnapshot(
  snapshot: { monthlyListeners: number; followerCount: number; youtubeSubscribers: number; tiktokFollowers: number; instagramFollowers: number },
  metric: MetricKey
): number {
  switch (metric) {
    case "listeners": return snapshot.monthlyListeners;
    case "followers": return snapshot.followerCount;
    case "youtube": return snapshot.youtubeSubscribers;
    case "tiktok": return snapshot.tiktokFollowers;
    case "instagram": return snapshot.instagramFollowers;
  }
}

function getMetricFromLinks(
  links: { platform: string; monthlyListeners: number; followerCount: number }[],
  metric: MetricKey
): number {
  switch (metric) {
    case "listeners": return links.find((l) => l.platform === "SPOTIFY")?.monthlyListeners ?? 0;
    case "followers": return links.find((l) => l.platform === "SPOTIFY")?.followerCount ?? 0;
    case "youtube": return links.find((l) => l.platform === "YOUTUBE")?.followerCount ?? 0;
    case "tiktok": return links.find((l) => l.platform === "TIKTOK")?.followerCount ?? 0;
    case "instagram": return links.find((l) => l.platform === "INSTAGRAM")?.followerCount ?? 0;
  }
}

/**
 * GET /api/artists/changes?period=day&metric=listeners&mode=change&skip=0&take=100
 *
 * metric: listeners | followers | youtube | tiktok | instagram
 * mode: change (% change over period) | current (absolute value, no change calc)
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "day";
  const metric = (searchParams.get("metric") ?? "listeners") as MetricKey;
  const mode = searchParams.get("mode") ?? "change";
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "100", 10) || 100, 200);

  if (!METRIC_KEYS.includes(metric)) {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }

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
      if (p === "day" || dataAge >= PERIODS[p] * 0.5) {
        availablePeriods.push(p);
      }
    }
  }

  // Get all artists with their current stats
  const artists = await prisma.artist.findMany({
    include: {
      links: {
        select: { platform: true, monthlyListeners: true, followerCount: true },
      },
    },
  });

  const totalCount = artists.length;

  if (mode === "current") {
    // Current mode: just sort by absolute value, no change calculation
    const result = artists.map((artist) => {
      const currentValue = getMetricFromLinks(artist.links, metric);
      return {
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
        currentValue,
        changePercent: 0,
        hasData: false,
        metric,
      };
    });

    result.sort((a, b) => b.currentValue - a.currentValue);

    return NextResponse.json({
      artists: result.slice(skip, skip + take),
      totalCount,
      availablePeriods,
      period,
      metric,
      mode,
    });
  }

  // Change mode: calculate % change over period
  const artistIds = artists.map((a) => a.id);

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
      youtubeSubscribers: true,
      tiktokFollowers: true,
      instagramFollowers: true,
      createdAt: true,
    },
  });

  const oldMap = new Map(oldSnapshots.map((s) => [s.artistId, s]));

  const result = artists.map((artist) => {
    const currentValue = getMetricFromLinks(artist.links, metric);
    const old = oldMap.get(artist.id);
    const oldValue = old ? getMetricFromSnapshot(old, metric) : currentValue;

    let changePercent = 0;
    if (oldValue > 0 && old) {
      changePercent = ((currentValue - oldValue) / oldValue) * 100;
    }

    return {
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
      currentValue,
      changePercent: Math.round(changePercent * 100) / 100,
      hasData: !!old,
      metric,
    };
  });

  // Sort by absolute change (biggest movers first)
  result.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  return NextResponse.json({
    artists: result.slice(skip, skip + take),
    totalCount,
    availablePeriods,
    period,
    metric,
    mode,
  });
}
