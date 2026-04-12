import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseArtistTracks, dedupeNames, getDisplayTrackTitle } from "@/lib/track-dedupe";

// GET — return cached artist tracks from the database, deduplicated for display
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      links: { where: { platform: "SPOTIFY" } },
    },
  });

  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Fetch all tracks where this artist is primary OR a contributor (collabs)
  const allTracks = await prisma.track.findMany({
    where: {
      OR: [
        { artistId: id },
        { contributorIds: { has: id } },
      ],
    },
    include: {
      snapshots: {
        select: { popularity: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3, // most recent snapshots to detect growth
      },
    },
    orderBy: { popularity: "desc" },
    take: 200,
  });

  // Attach peakPopularity + recentGrowth and sort by peak
  const tracksWithPeak = allTracks.map(({ snapshots, ...track }) => {
    const snaps = [...snapshots].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const peakPopularity = snaps.length > 0
      ? Math.max(snaps[0].popularity, track.popularity)
      : track.popularity;
    // Compare most-recent vs oldest snapshot for recent trend
    const recentGrowth: number | null = snaps.length >= 2
      ? snaps[0].popularity - snaps[snaps.length - 1].popularity
      : null;
    return { ...track, peakPopularity, recentGrowth };
  });
  tracksWithPeak.sort((a, b) => b.peakPopularity - a.peakPopularity);

  const tracks = collapseArtistTracks(tracksWithPeak)
    .slice(0, 30)
    .map(({ track, versions, primaryVersion }) => {
      const full = tracksWithPeak.find(t => t.id === track.id);
      return {
        ...track,
        displayName: getDisplayTrackTitle(track.name),
        versions,
        primaryVersion,
        featuredArtists: dedupeNames(track.featuredArtists),
        recentGrowth: full?.recentGrowth ?? null,
      };
    });

  return NextResponse.json({
    tracks,
    genres: artist.genres,
    spotifyPopularity: artist.spotifyPopularity,
  });
}
