import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPlatformStats } from "@/lib/platforms";

async function enrichLink<T extends {
  id: string;
  platform: string;
  url: string;
  handle: string | null;
  followerCount: number;
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
    platformId: stats.platformId ?? link.platformId,
  };

  await prisma.artistLink.update({
    where: { id: link.id },
    data: {
      handle: nextLink.handle,
      followerCount: nextLink.followerCount,
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
