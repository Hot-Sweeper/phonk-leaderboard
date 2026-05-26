import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic"; // Prevent static prerendering at build time

function stripLinkMetrics<T extends { followerCount: number; monthlyListeners: number }>(links: T[]): T[] {
  return links.map((link) => ({
    ...link,
    followerCount: 0,
    monthlyListeners: 0,
  }));
}

export async function GET() {
  const [
    topArtists,
    totalArtists,
    topTracks,
    totalTracks,
    oldestSnapshot,
  ] = await Promise.all([
    prisma.artist.findMany({
      include: {
        links: { select: { platform: true, monthlyListeners: true, followerCount: true } },
        snapshots: {
          take: 1,
          orderBy: { createdAt: "desc" },
          select: { monthlyListeners: true },
        },
      },
    }).then((artists) => {
      artists.sort((a, b) => {
        const aL = (a.snapshots[0]?.monthlyListeners ?? 0) <= 100 ? (a.snapshots[0]?.monthlyListeners ?? 0) : 0;
        const bL = (b.snapshots[0]?.monthlyListeners ?? 0) <= 100 ? (b.snapshots[0]?.monthlyListeners ?? 0) : 0;
        return bL - aL;
      });
      return artists.slice(0, 12);
    }),
    prisma.artist.count(),
    prisma.track.findMany({
      take: 10,
      where: { popularity: { gt: 0 }, previewUrl: { not: null } },
      orderBy: { popularity: "desc" },
      select: {
        id: true,
        name: true,
        albumImageUrl: true,
        previewUrl: true,
        popularity: true,
        spotifyUrl: true,
        durationMs: true,
        explicit: true,
        artist: { select: { id: true, name: true } },
      },
    }),
    prisma.track.count(),
    prisma.artistSnapshot.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
  ]);

  return NextResponse.json(
    {
      topArtists: topArtists.map((artist) => ({
        ...artist,
        links: stripLinkMetrics(artist.links),
      })),
      topTracks,
      totalArtists,
      totalTracks,
      trackingStartedAt: oldestSnapshot?.createdAt ?? null,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}
