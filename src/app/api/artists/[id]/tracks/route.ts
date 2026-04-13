import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseArtistTracks, dedupeNames, getDisplayTrackTitle } from "@/lib/track-dedupe";

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// GET — return this artist's tracks from the DB, sorted by popularity (= leaderboard rank)
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

  const normalizedArtistName = normalizeName(artist.name);

  // Query only tracks where this artist is primary, a contributor, or credited by name.
  // This is a single indexed DB query — no Deezer HTTP calls needed.
  const candidateTracks = await prisma.track.findMany({
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
        take: 3,
      },
    },
    orderBy: { popularity: "desc" },
  });

  // Also find tracks that credit the artist by name but not by id
  const nameMatchTracks = await prisma.track.findMany({
    where: {
      NOT: {
        OR: [
          { artistId: id },
          { contributorIds: { has: id } },
        ],
      },
      featuredArtists: { has: artist.name },
    },
    include: {
      snapshots: {
        select: { popularity: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
    orderBy: { popularity: "desc" },
  });

  const allMatches = [...candidateTracks, ...nameMatchTracks];

  // Attach recentGrowth for the "rising" card in the panel
  const tracksWithGrowth = allMatches.map(({ snapshots, ...track }) => {
    const snaps = [...snapshots].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const recentGrowth: number | null =
      snaps.length >= 2
        ? snaps[0].popularity - snaps[snaps.length - 1].popularity
        : null;
    return {
      ...track,
      displayName: getDisplayTrackTitle(track.name),
      featuredArtists: dedupeNames(track.featuredArtists),
      recentGrowth,
    };
  });

  // Collapse versions of the same song, keeping the most popular variant
  const dedupedTracks = collapseArtistTracks(tracksWithGrowth)
    .map(({ track, versions, primaryVersion }) => ({
      ...track,
      versions,
      primaryVersion,
    }))
    .sort((a, b) => b.popularity - a.popularity);

  return NextResponse.json({
    tracks: dedupedTracks,
    genres: artist.genres,
    spotifyPopularity: artist.spotifyPopularity,
  });
}
