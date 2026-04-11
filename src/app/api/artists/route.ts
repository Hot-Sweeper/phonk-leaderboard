import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import { fetchPlatformStats, parseSpotifyUrl, fetchSpotifyArtist } from "@/lib/platforms";

async function enrichLink<T extends {
  id: string;
  platform: string;
  url: string;
  handle: string | null;
  followerCount: number;
  monthlyListeners: number;
  platformId: string | null;
  artistId: string;
}>(link: T): Promise<T> {
  const needsSpotifyRefresh =
    link.platform === "SPOTIFY" &&
    (link.followerCount === 0 || link.platformId === null || link.monthlyListeners === 0);
  const needsSocialRefresh =
    (link.platform === "TIKTOK" || link.platform === "INSTAGRAM") &&
    (!link.handle || link.followerCount === 0);

  if (!needsSpotifyRefresh && !needsSocialRefresh) {
    return link;
  }

  const stats = await fetchPlatformStats(link.platform, link.url);
  if (!stats) {
    return link;
  }

  const nextLink = {
    ...link,
    handle: stats.handle ?? link.handle,
    followerCount: stats.followerCount || link.followerCount,
    monthlyListeners: stats.monthlyListeners || link.monthlyListeners,
    platformId: stats.platformId ?? link.platformId,
  };

  await prisma.artistLink.update({
    where: { id: link.id },
    data: {
      handle: nextLink.handle,
      followerCount: nextLink.followerCount,
      monthlyListeners: nextLink.monthlyListeners,
      platformId: nextLink.platformId,
    },
  });

  // When refreshing a Spotify link, also update the artist's image and name
  if (link.platform === "SPOTIFY" && stats.imageUrl) {
    const artistUpdate: Record<string, string> = { imageUrl: stats.imageUrl };
    if (stats.name) artistUpdate.name = stats.name;
    await prisma.artist.update({
      where: { id: link.artistId },
      data: artistUpdate,
    });
  }

  return nextLink;
}

// GET artists with optional search + platform filter + pagination
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const platform = searchParams.get("platform")?.toUpperCase();
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "50", 10) || 50, 100);

  const where: Record<string, unknown> = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { links: { some: { handle: { contains: q, mode: "insensitive" } } } },
    ];
  }

  if (platform && ["YOUTUBE", "SPOTIFY", "TIKTOK", "INSTAGRAM"].includes(platform)) {
    where.links = { some: { platform } };
  }

  const [artists, totalCount] = await Promise.all([
    prisma.artist.findMany({
      where,
      include: {
        links: { orderBy: { platform: "asc" } },
      },
    }),
    prisma.artist.count({ where }),
  ]);

  const enrichedArtists = await Promise.all(
    artists.map(async (artist) => ({
      ...artist,
      links: await Promise.all(artist.links.map((link) => enrichLink(link))),
    }))
  );

  const metricForArtist = (artist: (typeof enrichedArtists)[number]) => {
    if (platform === "YOUTUBE") {
      return artist.links.find((link) => link.platform === "YOUTUBE")?.followerCount ?? 0;
    }

    if (platform === "SPOTIFY") {
      return artist.links.find((link) => link.platform === "SPOTIFY")?.monthlyListeners ?? 0;
    }

    if (platform === "TIKTOK") {
      return artist.links.find((link) => link.platform === "TIKTOK")?.followerCount ?? 0;
    }

    if (platform === "INSTAGRAM") {
      return artist.links.find((link) => link.platform === "INSTAGRAM")?.followerCount ?? 0;
    }

    // Default: sort by Spotify monthly listeners
    return artist.links.find((link) => link.platform === "SPOTIFY")?.monthlyListeners ?? 0;
  };

  enrichedArtists.sort((a, b) => {
    const metricDelta = metricForArtist(b) - metricForArtist(a);
    if (metricDelta !== 0) return metricDelta;

    const watchlistDelta = b.watchlistCount - a.watchlistCount;
    if (watchlistDelta !== 0) return watchlistDelta;

    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({
    artists: enrichedArtists.slice(skip, skip + take),
    totalCount,
  });
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

  return NextResponse.json(artist, { status: 201 });
}
