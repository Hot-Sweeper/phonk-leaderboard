import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import { fetchPlatformStats } from "@/lib/platforms";

async function enrichLink<T extends {
  id: string;
  platform: string;
  url: string;
  handle: string | null;
  followerCount: number;
  monthlyListeners: number;
  platformId: string | null;
}>(link: T): Promise<T> {
  const needsSpotifyRefresh =
    link.platform === "SPOTIFY" &&
    (link.followerCount === 0 || link.platformId === null);
  const needsHandleRefresh =
    (link.platform === "TIKTOK" || link.platform === "INSTAGRAM") &&
    !link.handle;

  if (!needsSpotifyRefresh && !needsHandleRefresh) {
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

  return nextLink;
}

// GET artists with optional search + platform filter
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const platform = searchParams.get("platform")?.toUpperCase();

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

  const artists = await prisma.artist.findMany({
    where,
    include: {
      links: { orderBy: { platform: "asc" } },
    },
  });

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

  return NextResponse.json(enrichedArtists.slice(0, 50));
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

  const { name, imageUrl, bio, links } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  if (!Array.isArray(links) || links.length === 0) {
    return NextResponse.json(
      { error: "At least one platform link is required." },
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

  // Fetch stats from YouTube + Spotify APIs in parallel
  const linkEntries: {
    platform: Platform;
    url: string;
    handle: string | null;
    followerCount: number;
    platformId: string | null;
  }[] = [];

  let artistImageUrl = imageUrl?.trim() || null;

  await Promise.all(
    links.map(
      async (l: {
        platform: string;
        url: string;
        handle?: string;
        followerCount?: number;
        platformId?: string | null;
        imageUrl?: string | null;
      }) => {
        const stats = await fetchPlatformStats(l.platform, l.url);
        const shouldUseProvidedSpotifyStats =
          l.platform === "SPOTIFY" &&
          typeof l.followerCount === "number" &&
          Boolean(l.platformId) &&
          (!stats || stats.followerCount === 0);

        const entry = {
          platform: l.platform as Platform,
          url: l.url.trim(),
          handle: stats?.handle ?? l.handle?.trim() ?? null,
          followerCount: shouldUseProvidedSpotifyStats
            ? l.followerCount ?? 0
            : (stats?.followerCount ?? 0),
          platformId: stats?.platformId ?? l.platformId ?? null,
        };
        linkEntries.push(entry);

        // Use YouTube profile pic as artist image if none provided
        if (!artistImageUrl && stats?.imageUrl && l.platform === "YOUTUBE") {
          artistImageUrl = stats.imageUrl;
        }
        // Fallback to Spotify image
        if (!artistImageUrl && l.platform === "SPOTIFY") {
          artistImageUrl = stats?.imageUrl ?? l.imageUrl ?? artistImageUrl;
        }
      }
    )
  );

  const artist = await prisma.artist.create({
    data: {
      name: name.trim(),
      imageUrl: artistImageUrl,
      bio: bio?.trim() || null,
      addedById: session.user.id,
      links: {
        create: linkEntries,
      },
    },
    include: { links: true },
  });

  return NextResponse.json(artist, { status: 201 });
}
