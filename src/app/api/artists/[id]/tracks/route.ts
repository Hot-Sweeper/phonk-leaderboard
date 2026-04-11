import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchSpotifyTopTracks, fetchSpotifyArtistDetails } from "@/lib/platforms";

// GET — fetch and cache artist's top tracks from Spotify
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

  // If we have recent tracks (updated within last 6 hours), return cached
  const recentTrack = artist.tracks[0];
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  if (recentTrack && recentTrack.updatedAt > sixHoursAgo) {
    return NextResponse.json({
      tracks: artist.tracks,
      genres: artist.genres,
      spotifyPopularity: artist.spotifyPopularity,
    });
  }

  // Get Spotify ID
  const spotifyId = artist.spotifyId ?? artist.links[0]?.platformId;
  if (!spotifyId) {
    return NextResponse.json({
      tracks: artist.tracks,
      genres: artist.genres,
      spotifyPopularity: artist.spotifyPopularity,
    });
  }

  // Fetch fresh data from Spotify API
  const [topTracks, details] = await Promise.all([
    fetchSpotifyTopTracks(spotifyId),
    fetchSpotifyArtistDetails(spotifyId),
  ]);

  // Update artist details if available
  if (details) {
    await prisma.artist.update({
      where: { id },
      data: {
        genres: details.genres,
        spotifyPopularity: details.popularity,
      },
    });
  }

  // Upsert tracks
  if (topTracks && topTracks.length > 0) {
    for (const t of topTracks) {
      // Featured artists = all artists except the main one
      const featured = t.artists
        .filter((a) => a.id !== spotifyId)
        .map((a) => a.name);

      await prisma.track.upsert({
        where: { spotifyId: t.id },
        update: {
          name: t.name,
          albumName: t.album.name,
          albumImageUrl: t.album.imageUrl,
          previewUrl: t.previewUrl,
          durationMs: t.durationMs,
          popularity: t.popularity,
          trackNumber: t.trackNumber,
          discNumber: t.discNumber,
          explicit: t.explicit,
          releaseDate: t.album.releaseDate,
          spotifyUrl: t.spotifyUrl,
          featuredArtists: featured,
        },
        create: {
          spotifyId: t.id,
          artistId: id,
          name: t.name,
          albumName: t.album.name,
          albumImageUrl: t.album.imageUrl,
          previewUrl: t.previewUrl,
          durationMs: t.durationMs,
          popularity: t.popularity,
          trackNumber: t.trackNumber,
          discNumber: t.discNumber,
          explicit: t.explicit,
          releaseDate: t.album.releaseDate,
          spotifyUrl: t.spotifyUrl,
          featuredArtists: featured,
        },
      });
    }
  }

  // Re-fetch updated data
  const updatedArtist = await prisma.artist.findUnique({
    where: { id },
    include: { tracks: { orderBy: { popularity: "desc" }, take: 10 } },
  });

  return NextResponse.json({
    tracks: updatedArtist?.tracks ?? [],
    genres: updatedArtist?.genres ?? [],
    spotifyPopularity: updatedArtist?.spotifyPopularity ?? 0,
  });
}
