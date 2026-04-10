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

  return nextLink;
}

// GET single artist with all links
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      links: { orderBy: { platform: "asc" } },
      suggestions: {
        where: { status: "PENDING" },
        select: { id: true, platform: true, url: true, note: true, createdAt: true },
      },
    },
  });

  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const enrichedArtist = {
    ...artist,
    links: await Promise.all(artist.links.map((link) => enrichLink(link))),
  };

  return NextResponse.json(enrichedArtist);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const existingArtist = await prisma.artist.findUnique({ where: { id } });
  if (!existingArtist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { name, bio, links } = await req.json();
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

  const linkEntries: {
    platform: Platform;
    url: string;
    handle: string | null;
    followerCount: number;
    platformId: string | null;
  }[] = [];

  let artistImageUrl = existingArtist.imageUrl;

  await Promise.all(
    links.map(async (link: {
      platform: string;
      url: string;
      handle?: string;
      followerCount?: number;
      platformId?: string | null;
      imageUrl?: string | null;
    }) => {
      const trimmedUrl = link.url.trim();
      const stats = await fetchPlatformStats(link.platform, trimmedUrl);
      const shouldUseProvidedSpotifyStats =
        link.platform === "SPOTIFY" &&
        typeof link.followerCount === "number" &&
        Boolean(link.platformId) &&
        (!stats || stats.followerCount === 0);

      linkEntries.push({
        platform: link.platform as Platform,
        url: trimmedUrl,
        handle: stats?.handle ?? link.handle?.trim() ?? null,
        followerCount: shouldUseProvidedSpotifyStats
          ? link.followerCount ?? 0
          : (stats?.followerCount ?? 0),
        platformId: stats?.platformId ?? link.platformId ?? null,
      });

      if (stats?.imageUrl && link.platform === "YOUTUBE") {
        artistImageUrl = stats.imageUrl;
      } else if (!artistImageUrl && link.platform === "SPOTIFY") {
        artistImageUrl = stats?.imageUrl ?? link.imageUrl ?? artistImageUrl;
      }
    })
  );

  const updatedArtist = await prisma.artist.update({
    where: { id },
    data: {
      name: name.trim(),
      bio: bio?.trim() || null,
      imageUrl: artistImageUrl,
      links: {
        deleteMany: {},
        create: linkEntries,
      },
    },
    include: {
      links: { orderBy: { platform: "asc" } },
      suggestions: {
        where: { status: "PENDING" },
        select: { id: true, platform: true, url: true, note: true, createdAt: true },
      },
    },
  });

  return NextResponse.json(updatedArtist);
}
