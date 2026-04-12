import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const revalidate = 120; // ISR-style in Next 14+

export async function GET() {
  const [
    topArtists,
    totalArtists,
    topTracks,
    totalTracks,
    oldestSnapshot,
  ] = await Promise.all([
    prisma.artist.findMany({
      where: { links: { some: { platform: "SPOTIFY" } } },
      include: {
        links: { select: { platform: true, monthlyListeners: true, followerCount: true } },
      },
    }).then((artists) => {
      artists.sort((a, b) => {
        const aL = a.links.find((l) => l.platform === "SPOTIFY")?.monthlyListeners ?? 0;
        const bL = b.links.find((l) => l.platform === "SPOTIFY")?.monthlyListeners ?? 0;
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
      topArtists,
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
