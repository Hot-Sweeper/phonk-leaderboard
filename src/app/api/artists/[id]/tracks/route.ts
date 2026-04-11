import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dedupeArtistTracks, dedupeNames } from "@/lib/track-dedupe";

// GET — return cached artist tracks from the database, deduplicated for display
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      tracks: { orderBy: { popularity: "desc" }, take: 10 },
      links: { where: { platform: "SPOTIFY" } },
    },
  });

  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tracks = dedupeArtistTracks(artist.tracks)
    .slice(0, 10)
    .map((track) => ({
      ...track,
      featuredArtists: dedupeNames(track.featuredArtists),
    }));

  return NextResponse.json({
    tracks,
    genres: artist.genres,
    spotifyPopularity: artist.spotifyPopularity,
  });
}
