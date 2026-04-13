import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/songs/[id]
 * Returns full track data for the song detail panel.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const track = await prisma.track.findUnique({
    where: { id },
    include: {
      artist: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  if (!track) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve contributorIds to actual artist objects
  const contributors = track.contributorIds.length > 0
    ? await prisma.artist.findMany({
        where: { id: { in: track.contributorIds } },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const contributorMap = new Map(contributors.map(c => [c.id, c]));

  // Build full artists list: primary + resolved contributors + remaining featured names
  const allArtists: { id: string; name: string; imageUrl: string | null }[] = [
    track.artist,
  ];
  const seenIds = new Set([track.artist.id]);
  for (const cid of track.contributorIds) {
    const c = contributorMap.get(cid);
    if (c && !seenIds.has(c.id)) { allArtists.push(c); seenIds.add(c.id); }
  }
  // Try to match featured artist names to known artists
  const seenNames = new Set(allArtists.map(a => a.name.toLowerCase()));
  const unresolvedFeatured: string[] = [];
  for (const name of track.featuredArtists) {
    if (!seenNames.has(name.toLowerCase())) {
      unresolvedFeatured.push(name);
      seenNames.add(name.toLowerCase());
    }
  }

  return NextResponse.json({
    id: track.id,
    name: track.name,
    albumName: track.albumName,
    albumImageUrl: track.albumImageUrl,
    previewUrl: track.previewUrl,
    deezerUrl: track.deezerId
      ? `https://www.deezer.com/track/${track.deezerId}`
      : null,
    deezerId: track.deezerId,
    spotifyUrl: track.spotifyId
      ? `https://open.spotify.com/track/${track.spotifyId}`
      : null,
    durationMs: track.durationMs,
    popularity: track.popularity,
    explicit: track.explicit,
    releaseDate: track.releaseDate,
    featuredArtists: unresolvedFeatured,
    artist: track.artist,
    allArtists,
  });
}
