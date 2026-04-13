import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import { fetchPlatformStats, parseSpotifyUrl, fetchSpotifyArtist } from "@/lib/platforms";
import { hydrateArtistNow } from "@/lib/update-runner";

// Server-side in-memory cache for artist list
type ArtistCacheEntry = {
  artists: Awaited<ReturnType<typeof prisma.artist.findMany<{ include: { links: { orderBy: { platform: "asc" } } } }>>>;
  timestamp: number;
};
const artistListCache = new Map<string, ArtistCacheEntry>();
const ARTIST_CACHE_TTL = 120_000; // 2 minutes

// GET artists with optional search + platform filter + pagination
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const platform = searchParams.get("platform")?.toUpperCase();
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "50", 10) || 50, 100);

  const metricForArtist = (artist: ArtistCacheEntry["artists"][number], plat?: string) => {
    if (plat === "YOUTUBE") return artist.links.find((l) => l.platform === "YOUTUBE")?.followerCount ?? 0;
    if (plat === "SPOTIFY") return artist.links.find((l) => l.platform === "SPOTIFY")?.monthlyListeners ?? 0;
    if (plat === "TIKTOK") return artist.links.find((l) => l.platform === "TIKTOK")?.followerCount ?? 0;
    if (plat === "INSTAGRAM") return artist.links.find((l) => l.platform === "INSTAGRAM")?.followerCount ?? 0;
    return artist.links.find((l) => l.platform === "SPOTIFY")?.monthlyListeners ?? 0;
  };

  const sortArtists = (list: ArtistCacheEntry["artists"], plat?: string) => {
    list.sort((a, b) => {
      const metricDelta = metricForArtist(b, plat) - metricForArtist(a, plat);
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
    globalList = await prisma.artist.findMany({
      where: globalWhere,
      include: { links: { orderBy: { platform: "asc" } } },
    });
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
