import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import { fetchPlatformStats, parseSpotifyUrl, fetchSpotifyArtist } from "@/lib/platforms";
import { hydrateArtistNow } from "@/lib/update-runner";
import { getArtistInternalMetrics } from "@/lib/legal-rankings";

// Server-side in-memory cache for artist list
type CachedArtist = {
  id: string;
  name: string;
  imageUrl: string | null;
  watchlistCount: number;
  createdAt: Date;
  links: Array<{
    platform: string;
    handle: string | null;
    monthlyListeners: number;
    followerCount: number;
  }>;
  snapshots?: Array<{
    monthlyListeners: number;
  }>;
};

type ArtistCacheEntry = {
  artists: CachedArtist[];
  timestamp: number;
};
const artistListCache = new Map<string, ArtistCacheEntry>();
const ARTIST_CACHE_TTL = 600_000; // 10 minutes
const legalArtistCache = new Map<string, { artists: Array<Record<string, unknown>>; timestamp: number }>();
const legalArtistCacheInFlight = new Map<string, Promise<Array<Record<string, unknown>>>>();
const LEGAL_ARTIST_HYPE_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

type LegalArtistMode = "popularity" | "hype";

function stripLinkMetrics<T extends { followerCount: number; monthlyListeners: number }>(links: T[]): T[] {
  return links.map((link) => ({
    ...link,
    followerCount: 0,
    monthlyListeners: 0,
  }));
}

async function buildLegalArtistList(mode: LegalArtistMode) {
  const hypeCutoff = new Date(Date.now() - LEGAL_ARTIST_HYPE_PERIOD_MS);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const [artists, oldSnapshots, watchlistAggregate, yesterdayRanks] = await Promise.all([
    prisma.artist.findMany({
      include: {
        links: { orderBy: { platform: "asc" } },
        tracks: {
          select: {
            popularity: true,
            spotifyPopularity: true,
            previewUrl: true,
            releaseDate: true,
          },
        },
      },
    }),
    // Use DISTINCT ON for index-backed dedup instead of app-level dedup
    prisma.$queryRaw<Array<{ artistId: string; monthlyListeners: number; followerCount: number }>>`
      SELECT DISTINCT ON ("artistId") "artistId", "monthlyListeners", "followerCount"
      FROM "ArtistSnapshot"
      WHERE "createdAt" <= ${hypeCutoff}
      ORDER BY "artistId", "createdAt" DESC
    `,
    prisma.artist.aggregate({
      _max: { watchlistCount: true },
    }),
    prisma.rankSnapshot.findMany({
      where: { date: yesterday },
      select: { artistId: true, rank: true },
    }),
  ]);

  const oldSnapshotMap = new Map(oldSnapshots.map((snapshot) => [snapshot.artistId, snapshot]));
  const maxWatchlistCount = Math.max(1, watchlistAggregate._max.watchlistCount ?? 0);
  const yesterdayRankMap = new Map(yesterdayRanks.map((r) => [r.artistId, r.rank]));

  const fullList = artists.map((artist) => {
    const oldSnapshot = oldSnapshotMap.get(artist.id);
    const metrics = getArtistInternalMetrics({
      tracks: artist.tracks,
      watchlistCount: artist.watchlistCount,
      maxWatchlistCount,
      previousSnapshot: oldSnapshot
        && oldSnapshot.monthlyListeners <= 100
        && oldSnapshot.followerCount <= 100
        ? {
            popularityIndex: oldSnapshot.monthlyListeners,
            hypeIndex: oldSnapshot.followerCount,
          }
        : null,
    });

    return {
      id: artist.id,
      name: artist.name,
      imageUrl: artist.imageUrl,
      watchlistCount: artist.watchlistCount,
      createdAt: artist.createdAt,
      links: stripLinkMetrics(artist.links),
      audienceScore: metrics.popularityScore,
      popularityScore: metrics.popularityScore,
      hypeScore: metrics.hypeScore,
      hasHypeData: metrics.hasHypeData,
      hypeChangePercent: metrics.hypeChangePercent,
      previousRank: yesterdayRankMap.get(artist.id) ?? null,
    };
  });

  fullList.sort((a, b) => {
    const scoreDelta = mode === "hype"
      ? Number((b.hypeScore as number | undefined) ?? 0) - Number((a.hypeScore as number | undefined) ?? 0)
      : Number((b.popularityScore as number | undefined) ?? 0) - Number((a.popularityScore as number | undefined) ?? 0);
    if (scoreDelta !== 0) return scoreDelta;
    const watchlistDelta = Number((b.watchlistCount as number | undefined) ?? 0) - Number((a.watchlistCount as number | undefined) ?? 0);
    if (watchlistDelta !== 0) return watchlistDelta;
    return String(a.name ?? "").localeCompare(String(b.name ?? ""));
  });

  return fullList;
}

// GET artists with optional search + platform filter + pagination
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const platform = searchParams.get("platform")?.toUpperCase();
  const rankingModel = "legal";
  const legalMode: LegalArtistMode = searchParams.get("mode") === "hype" ? "hype" : "popularity";
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "50", 10) || 50, 100);

  if (rankingModel === "legal") {
    const cacheKey = `legal:${legalMode}:all`;
    const now = Date.now();
    const cached = legalArtistCache.get(cacheKey);

    let fullList: Array<Record<string, unknown>>;

    if (cached && now - cached.timestamp < ARTIST_CACHE_TTL) {
      fullList = cached.artists;
    } else {
      const inFlight = legalArtistCacheInFlight.get(cacheKey);
      if (inFlight) {
        fullList = await inFlight;
      } else {
        const request = buildLegalArtistList(legalMode);
        legalArtistCacheInFlight.set(cacheKey, request);
        try {
          fullList = await request;
          legalArtistCache.set(cacheKey, { artists: fullList, timestamp: now });
        } finally {
          if (legalArtistCacheInFlight.get(cacheKey) === request) {
            legalArtistCacheInFlight.delete(cacheKey);
          }
        }
      }
    }

    const globalRankMap = new Map<string, number>();
    fullList.forEach((artist, index) => globalRankMap.set(String(artist.id), index + 1));

    const filtered = q
      ? fullList.filter((artist) => {
          const lowerQ = q.toLowerCase();
          if (String(artist.name ?? "").toLowerCase().includes(lowerQ)) return true;
          const links = (artist.links as Array<{ handle: string | null }> | undefined) ?? [];
          return links.some((link) => link.handle?.toLowerCase().includes(lowerQ));
        })
      : fullList;

    return NextResponse.json(
      {
        artists: filtered.slice(skip, skip + take).map((artist) => {
          const currentRank = globalRankMap.get(String(artist.id)) ?? 0;
          const previousRank = (artist.previousRank as number | null) ?? null;
          return {
            ...artist,
            globalRank: currentRank,
            currentRank,
            previousRank,
            rankChange: previousRank != null ? previousRank - currentRank : 0,
          };
        }),
        totalCount: filtered.length,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  }

  const metricForArtist = (artist: ArtistCacheEntry["artists"][number]) => {
    const latestSnapshotValue = artist.snapshots?.[0]?.monthlyListeners ?? 0;
    return latestSnapshotValue <= 100 ? latestSnapshotValue : 0;
  };

  const sortArtists = (list: ArtistCacheEntry["artists"], plat?: string) => {
    list.sort((a, b) => {
      void plat;
      const metricDelta = metricForArtist(b) - metricForArtist(a);
      if (metricDelta !== 0) return metricDelta;
      const watchlistDelta = b.watchlistCount - a.watchlistCount;
      if (watchlistDelta !== 0) return watchlistDelta;
      return a.name.localeCompare(b.name);
    });
  };

  // Always have the full global leaderboard available for true rank lookup
  const globalKey = `:${platform ?? ""}`;
  const now = Date.now();
  const cachedGlobal = artistListCache.get(globalKey);
  let globalList: ArtistCacheEntry["artists"];

  if (cachedGlobal && now - cachedGlobal.timestamp < ARTIST_CACHE_TTL) {
    globalList = cachedGlobal.artists;
  } else {
    const globalWhere: Record<string, unknown> = {};
    if (platform && ["YOUTUBE", "SPOTIFY", "TIKTOK", "INSTAGRAM"].includes(platform)) {
      globalWhere.links = { some: { platform } };
    }
    const rawGlobalList = await prisma.artist.findMany({
      where: globalWhere,
      include: {
        links: { orderBy: { platform: "asc" } },
        snapshots: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { monthlyListeners: true },
        },
      },
    });
    globalList = rawGlobalList.map((artist) => ({
      ...artist,
      links: stripLinkMetrics(artist.links),
    }));
    sortArtists(globalList, platform ?? undefined);
    artistListCache.set(globalKey, { artists: globalList, timestamp: now });
  }

  // Build a rank lookup from the global list (1-based)
  const globalRankMap = new Map<string, number>();
  globalList.forEach((a, i) => globalRankMap.set(a.id, i + 1));

  let resultList: ArtistCacheEntry["artists"];
  let totalCount: number;

  if (q) {
    // Filter the global list by search query to preserve global rank ordering
    const lowerQ = q.toLowerCase();
    resultList = globalList.filter((a) => {
      if (a.name.toLowerCase().includes(lowerQ)) return true;
      if (a.links.some((l) => l.handle?.toLowerCase().includes(lowerQ))) return true;
      return false;
    });
    totalCount = resultList.length;
  } else {
    resultList = globalList;
    totalCount = resultList.length;
  }

  return NextResponse.json(
    {
      artists: resultList.slice(skip, skip + take).map((a) => ({ ...a, globalRank: globalRankMap.get(a.id) ?? 0 })),
      totalCount,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
      },
    }
  );
}

// POST — admins/mods add an artist with links
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { links } = await req.json();

  if (!Array.isArray(links) || links.length === 0) {
    return NextResponse.json(
      { error: "At least one platform link is required." },
      { status: 400 }
    );
  }

  // Spotify link is REQUIRED
  const spotifyLink = links.find(
    (l: { platform: string }) => l.platform === "SPOTIFY"
  );
  if (!spotifyLink) {
    return NextResponse.json(
      { error: "A Spotify link is required." },
      { status: 400 }
    );
  }

  const uniquePlatforms = new Set(
    links.map((link: { platform: string }) => link.platform)
  );
  if (uniquePlatforms.size !== links.length) {
    return NextResponse.json(
      { error: "Each platform can only be added once per artist." },
      { status: 400 }
    );
  }

  // Extract Spotify artist ID and check for duplicates
  const spotifyId = parseSpotifyUrl(spotifyLink.url);
  if (!spotifyId) {
    return NextResponse.json(
      { error: "Invalid Spotify artist URL." },
      { status: 400 }
    );
  }

  const existing = await prisma.artist.findUnique({
    where: { spotifyId },
  });
  if (existing) {
    return NextResponse.json(
      { error: `Artist already exists: ${existing.name}` },
      { status: 409 }
    );
  }

  // Get artist name and image from Spotify
  const spotifyData = await fetchSpotifyArtist(spotifyLink.url);
  const artistName = spotifyData?.name ?? "Unknown Artist";
  const artistImageUrl = spotifyData?.imageUrl ?? null;

  // Fetch stats for all links in parallel
  const linkEntries: {
    platform: Platform;
    url: string;
    handle: string | null;
    followerCount: number;
    monthlyListeners: number;
    platformId: string | null;
  }[] = [];

  await Promise.all(
    links.map(
      async (l: {
        platform: string;
        url: string;
        handle?: string;
      }) => {
        const stats = await fetchPlatformStats(l.platform, l.url);
        linkEntries.push({
          platform: l.platform as Platform,
          url: l.url.trim(),
          handle: stats?.handle ?? l.handle?.trim() ?? null,
          followerCount: stats?.followerCount ?? 0,
          monthlyListeners: stats?.monthlyListeners ?? 0,
          platformId: stats?.platformId ?? null,
        });
      }
    )
  );

  const artist = await prisma.artist.create({
    data: {
      spotifyId,
      name: artistName,
      imageUrl: artistImageUrl,
      addedById: session.user.id,
      links: {
        create: linkEntries,
      },
    },
    include: { links: true },
  });

  await hydrateArtistNow(artist.id);

  return NextResponse.json(artist, { status: 201 });
}
