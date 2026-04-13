import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDeezerTrackDetail } from "@/lib/platforms";
import { collapseFeedTrackVersions, dedupeNames, getDisplayTrackTitle } from "@/lib/track-dedupe";

const PUBLIC_SONG_LEADERBOARD_LIMIT = 50;

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

  // Build from the same grouped global songs leaderboard the public page uses,
  // then keep only the entries this artist appears on.
  const allTracks = await prisma.track.findMany({
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

  const leaderboardTracks = collapseFeedTrackVersions(tracksWithPeak)
    .slice(0, PUBLIC_SONG_LEADERBOARD_LIMIT);

  const deezerDetailEntries = await Promise.all(
    leaderboardTracks.map(async ({ track }) => {
      const deezerId = Number(track.deezerId);
      if (!track.deezerId || Number.isNaN(deezerId)) return null;

      const detail = await fetchDeezerTrackDetail(deezerId);
      return detail ? [track.id, detail] as const : null;
    })
  );
  const deezerDetails = new Map(
    deezerDetailEntries.filter(
      (entry): entry is readonly [string, NonNullable<Awaited<ReturnType<typeof fetchDeezerTrackDetail>>>] => entry !== null
    )
  );
  const normalizedArtistName = normalizeName(artist.name);

  const tracks = leaderboardTracks
    .filter(({ track }) => {
      if (track.artistId === id || track.contributorIds.includes(id)) return true;

      if (dedupeNames(track.featuredArtists).some((name) => normalizeName(name) === normalizedArtistName)) {
        return true;
      }

      const detail = deezerDetails.get(track.id);
      if (!detail) return false;

      return detail.artists.some((credit) => (
        (artist.deezerId != null && credit.deezerId === artist.deezerId)
        || normalizeName(credit.name) === normalizedArtistName
      ));
    })
    .map(({ track, versions, primaryVersion }) => {
      return {
        ...track,
        displayName: getDisplayTrackTitle(track.name),
        versions,
        primaryVersion,
        featuredArtists: dedupeNames(track.featuredArtists),
        recentGrowth: track.recentGrowth ?? null,
      };
    });

  return NextResponse.json({
    tracks,
    genres: artist.genres,
    spotifyPopularity: artist.spotifyPopularity,
  });
}
