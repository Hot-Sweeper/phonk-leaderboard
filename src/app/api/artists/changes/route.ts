import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getArtistAudienceScore } from "@/lib/legal-rankings";

const PERIODS: Record<string, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

const PERIOD_ORDER = ["day", "week", "month", "year"];

type MetricKey = "listeners" | "followers" | "youtube" | "tiktok" | "instagram" | "audience";
type SortOrder = "desc" | "abs" | "asc";
type DisplayMode = "current" | "relative" | "absolute";

const METRIC_KEYS: MetricKey[] = ["listeners", "followers", "youtube", "tiktok", "instagram", "audience"];

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
    case "audience": return 0;
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
    case "audience": return 0;
  }
}

function getSortOrder(value: string | null): SortOrder {
  if (value === "desc" || value === "abs" || value === "asc") {
    return value;
  }

  return "abs";
}

function getDisplayMode(value: string | null): DisplayMode {
  if (value === "current" || value === "relative" || value === "absolute") {
    return value;
  }

  if (value === "change") {
    return "relative";
  }

  return "current";
}

/**
 * GET /api/artists/changes?period=day&metric=listeners&mode=change&skip=0&take=100
 *
 * metric: listeners | followers | youtube | tiktok | instagram
 * mode: relative (% change over period) | absolute (raw delta over period) | current
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "day";
  const metric = (searchParams.get("metric") ?? "listeners") as MetricKey;
  const mode = getDisplayMode(searchParams.get("mode"));
  const sort = getSortOrder(searchParams.get("sort"));
  const rankingModel = searchParams.get("rankingModel") === "legal" ? "legal" : "standard";
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "100", 10) || 100, 200);

  if (!METRIC_KEYS.includes(metric)) {
    return NextResponse.json({ error: "Invalid metric" }, { status: 400 });
  }

  if (rankingModel === "legal") {
    const cacheKey = `legal:${mode}:${sort}`;
    const cached = routeCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const full = cached.data as { artists: unknown[]; totalCount: number; availablePeriods: string[]; period: string; metric: string; mode: string };
      return NextResponse.json(
        { ...full, artists: full.artists.slice(skip, skip + take) },
        { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300", "X-Cache": "HIT" } }
      );
    }

    const artists = await prisma.artist.findMany({
      include: {
        links: {
          select: { platform: true, monthlyListeners: true, followerCount: true },
        },
        tracks: {
          select: {
            id: true,
            artistId: true,
            name: true,
            albumName: true,
            popularity: true,
            previewUrl: true,
            durationMs: true,
            releaseDate: true,
            featuredArtists: true,
            contributorIds: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const maxYoutubeSubscribers = Math.max(
      1,
      ...artists.map((artist) => artist.links.find((link) => link.platform === "YOUTUBE")?.followerCount ?? 0)
    );
    const maxWatchlistCount = Math.max(1, ...artists.map((artist) => artist.watchlistCount));

    const result = artists.map((artist) => {
      const youtubeSubscribers = artist.links.find((link) => link.platform === "YOUTUBE")?.followerCount ?? 0;
      const score = getArtistAudienceScore({
        watchlistCount: artist.watchlistCount,
        youtubeSubscribers,
        tracks: artist.tracks,
        maxYoutubeSubscribers,
        maxWatchlistCount,
      });

      return {
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
        createdAt: artist.createdAt,
        watchlistCount: artist.watchlistCount,
        currentValue: score.audienceScore,
        changeValue: 0,
        changePercent: 0,
        hasData: false,
        metric: "audience score",
      };
    });

    result.sort((a, b) => b.currentValue - a.currentValue || b.watchlistCount - a.watchlistCount || a.name.localeCompare(b.name));

    const payload = { artists: result, totalCount: result.length, availablePeriods: [], period, metric: "audience", mode: "current" };
    routeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });

    return NextResponse.json(
      { ...payload, artists: result.slice(skip, skip + take) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  }

  const periodMs = PERIODS[period];
  if (!periodMs) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }

  // Serve from cache if fresh
  const cacheKey = `${period}:${metric}:${mode}:${sort}`;
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
      if (dataAge >= PERIODS[p]) {
        availablePeriods.push(p);
      }
    }
  }

  // Platform lookup for metric → filter artists that actually have the link
  const PLATFORM_FOR_METRIC: Partial<Record<MetricKey, string>> = {
    youtube: "YOUTUBE",
    tiktok: "TIKTOK",
    instagram: "INSTAGRAM",
  };

  // Get all artists with their current stats
  const allArtists = await prisma.artist.findMany({
    include: {
      links: {
        select: { platform: true, monthlyListeners: true, followerCount: true },
      },
    },
    orderBy: { name: "asc" },
  });

  // For platform-specific metrics, only include artists that actually have that platform linked
  const filterPlatform = PLATFORM_FOR_METRIC[metric];
  const artists = filterPlatform
    ? allArtists.filter(a => a.links.some(l => l.platform === filterPlatform))
    : allArtists;

  if (mode === "current") {
    // Current mode: just sort by absolute value, no change calculation
    const result = artists.map((artist) => {
      const currentValue = getMetricFromLinks(artist.links, metric);
      return {
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
        createdAt: artist.createdAt,
        watchlistCount: artist.watchlistCount,
        currentValue,
        changeValue: 0,
        changePercent: 0,
        hasData: false,
        metric,
      };
    });

    const filteredCurrent = result;

    filteredCurrent.sort((a, b) => b.currentValue - a.currentValue);

    const payload = { artists: filteredCurrent, totalCount: filteredCurrent.length, availablePeriods, period, metric, mode };
    routeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(
      { ...payload, artists: filteredCurrent.slice(skip, skip + take) },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
    );
  }

  // Trend modes: calculate % change and raw delta over period
  const artistIds = artists.map((a) => a.id);

  const oldSnapshots = await prisma.artistSnapshot.findMany({
    where: {
      artistId: { in: artistIds },
      createdAt: { lte: cutoff },
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
    const changeValue = old ? currentValue - oldValue : 0;
    let changePercent = 0;
    if (oldValue > 0 && old) {
      changePercent = ((currentValue - oldValue) / oldValue) * 100;
    }

    return {
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
      createdAt: artist.createdAt,
      watchlistCount: artist.watchlistCount,
      currentValue,
      changeValue,
      changePercent: Math.round(changePercent * 100) / 100,
      hasData,
      metric,
      allChanges,
    };
  });

  // Artists were pre-filtered by platform link — use result directly
  const filteredResult = result;

  const getTrendMetric = (artist: (typeof filteredResult)[number]) => mode === "absolute" ? artist.changeValue : artist.changePercent;

  if (sort === "asc") {
    filteredResult.sort((a, b) => getTrendMetric(a) - getTrendMetric(b));
  } else if (sort === "desc") {
    filteredResult.sort((a, b) => getTrendMetric(b) - getTrendMetric(a));
  } else {
    filteredResult.sort((a, b) => Math.abs(getTrendMetric(b)) - Math.abs(getTrendMetric(a)));
  }

  const payload = { artists: filteredResult, totalCount: filteredResult.length, availablePeriods, period, metric, mode };
  routeCache.set(cacheKey, { data: payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return NextResponse.json(
    { ...payload, artists: filteredResult.slice(skip, skip + take) },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } }
  );
}
