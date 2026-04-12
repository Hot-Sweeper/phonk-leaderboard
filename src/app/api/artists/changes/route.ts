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

// Server-side in-memory cache — cleared on deploy/restart
const routeCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 90_000; // 90 seconds

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

  // Serve from cache if fresh
  const cacheKey = `${period}:${metric}:${mode}`;
  const cached = routeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    const full = cached.data as { artists: unknown[]; totalCount: number; availablePeriods: string[]; period: string; metric: string; mode: string };
    return NextResponse.json(
      { ...full, artists: full.artists.slice(skip, skip + take) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Cache": "HIT" } }
    );
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
    orderBy: { name: "asc" },
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
        watchlistCount: artist.watchlistCount,
        currentValue,
        changePercent: 0,
        hasData: false,
        metric,
      };
    });

    const filteredCurrent = metric === "listeners" || metric === "followers"
      ? result
      : result.filter((a) => a.currentValue > 0);

    filteredCurrent.sort((a, b) => b.currentValue - a.currentValue);

    const payload = { artists: filteredCurrent, totalCount: filteredCurrent.length, availablePeriods, period, metric, mode };
    routeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(
      { ...payload, artists: filteredCurrent.slice(skip, skip + take) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
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

  function calcChange(cur: number, old: number | undefined): number | null {
    if (old == null || old === 0) return null;
    return Math.round(((cur - old) / old) * 10000) / 100; // 2 decimal places
  }

  const result = artists.map((artist) => {
    const old = oldMap.get(artist.id);
    const hasData = !!old;

    // Current values for each metric
    const listeners = getMetricFromLinks(artist.links, "listeners");
    const followers = getMetricFromLinks(artist.links, "followers");
    const youtube = getMetricFromLinks(artist.links, "youtube");
    const tiktok = getMetricFromLinks(artist.links, "tiktok");
    const instagram = getMetricFromLinks(artist.links, "instagram");

    // All-platform changes
    const allChanges = {
      listeners: hasData ? calcChange(listeners, old!.monthlyListeners) : null,
      followers: hasData ? calcChange(followers, old!.followerCount) : null,
      youtube: youtube > 0 && hasData ? calcChange(youtube, old!.youtubeSubscribers) : null,
      tiktok: tiktok > 0 && hasData ? calcChange(tiktok, old!.tiktokFollowers) : null,
      instagram: instagram > 0 && hasData ? calcChange(instagram, old!.instagramFollowers) : null,
      // current values for display
      listenersCurrent: listeners,
      followersCurrent: followers,
      youtubeCurrent: youtube,
      tiktokCurrent: tiktok,
      instagramCurrent: instagram,
    };

    const currentValue = getMetricFromLinks(artist.links, metric);
    const oldValue = old ? getMetricFromSnapshot(old, metric) : currentValue;
    let changePercent = 0;
    if (oldValue > 0 && old) {
      changePercent = ((currentValue - oldValue) / oldValue) * 100;
    }

    return {
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
      watchlistCount: artist.watchlistCount,
      currentValue,
      changePercent: Math.round(changePercent * 100) / 100,
      hasData,
      metric,
      allChanges,
    };
  });

  // For non-Spotify metrics, only include artists that actually have that platform
  const filteredResult = metric === "listeners" || metric === "followers"
    ? result
    : result.filter((a) => a.currentValue > 0);

  // Sort by absolute change of selected metric (biggest movers first)
  filteredResult.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  const payload = { artists: filteredResult, totalCount: filteredResult.length, availablePeriods, period, metric, mode };
  routeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(
    { ...payload, artists: filteredResult.slice(skip, skip + take) },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
