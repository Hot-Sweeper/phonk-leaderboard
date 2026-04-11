import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseArtistTracks, dedupeNames } from "@/lib/track-dedupe";

// GET — return cached artist tracks from the database, deduplicated for display
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      tracks: { orderBy: { popularity: "desc" }, take: 50 },
      links: { where: { platform: "SPOTIFY" } },
    },
  });

  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tracks = collapseArtistTracks(artist.tracks)
    .slice(0, 10)
    .map(({ track, versions, primaryVersion }) => ({
      ...track,
      versions,
      primaryVersion,
      featuredArtists: dedupeNames(track.featuredArtists),
    }));

  return NextResponse.json({
    tracks,
    genres: artist.genres,
    spotifyPopularity: artist.spotifyPopularity,
  });
}
