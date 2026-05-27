import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseArtistTracks, dedupeNames, getDisplayTrackTitle } from "@/lib/track-dedupe";

// GET — return this artist's tracks from the DB, sorted by popularity (= leaderboard rank)
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const isPanelView = searchParams.get("view") === "panel-v2";

  const artist = await prisma.artist.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      genres: true,
    },
  });

  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (isPanelView) {
    const PANEL_RAW_TRACK_LIMIT = 80;
    const PANEL_OUTPUT_LIMIT = 10;

    const trackSelect = {
      id: true,
      artistId: true,
      name: true,
      albumName: true,
      albumImageUrl: true,
      previewUrl: true,
      deezerUrl: true,
      deezerId: true,
      spotifyUrl: true,
      durationMs: true,
      popularity: true,
      explicit: true,
      releaseDate: true,
      featuredArtists: true,
      contributorIds: true,
    };

    const [candidateTracks, nameMatchTracks] = await Promise.all([
      prisma.track.findMany({
        where: {
          OR: [
            { artistId: id },
            { contributorIds: { has: id } },
          ],
        },
        select: trackSelect,
        orderBy: { popularity: "desc" },
        take: PANEL_RAW_TRACK_LIMIT,
      }),
      prisma.track.findMany({
        where: {
          NOT: {
            OR: [
              { artistId: id },
              { contributorIds: { has: id } },
            ],
          },
          featuredArtists: { has: artist.name },
        },
        select: trackSelect,
        orderBy: { popularity: "desc" },
        take: PANEL_RAW_TRACK_LIMIT,
      }),
    ]);

    const dedupedTracks = collapseArtistTracks([...candidateTracks, ...nameMatchTracks])
      .map(({ track, versions, primaryVersion }) => ({
        ...track,
        displayName: getDisplayTrackTitle(track.name),
        featuredArtists: dedupeNames(track.featuredArtists),
        versions,
        primaryVersion,
      }))
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, PANEL_OUTPUT_LIMIT);

    const publicTracks = dedupedTracks.map(({ deezerId: _deezerId, deezerUrl: _deezerUrl, ...track }) => track);

    return NextResponse.json({
      tracks: publicTracks,
      genres: artist.genres,
      spotifyPopularity: 0,
    });
  }

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

  const publicTracks = dedupedTracks.map(({ deezerId: _deezerId, deezerUrl: _deezerUrl, ...track }) => track);

  return NextResponse.json({
    tracks: publicTracks,
    genres: artist.genres,
    spotifyPopularity: 0,
  });
}
