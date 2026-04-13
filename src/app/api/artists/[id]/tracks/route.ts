import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDeezerTrackDetail } from "@/lib/platforms";
import { collapseArtistTracks, collapseFeedTrackVersions, dedupeNames, getDisplayTrackTitle } from "@/lib/track-dedupe";

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chooseTrackByLeaderboardRank<
  T extends {
    leaderboardRank: number;
    popularity: number;
    previewUrl?: string | null;
    featuredArtists?: string[];
    contributorIds?: string[];
    durationMs?: number;
    releaseDate?: string | null;
    recentGrowth?: number | null;
  },
>(left: T, right: T) {
  if (left.leaderboardRank !== right.leaderboardRank) {
    return left.leaderboardRank < right.leaderboardRank ? left : right;
  }

  const leftGrowth = left.recentGrowth ?? Number.NEGATIVE_INFINITY;
  const rightGrowth = right.recentGrowth ?? Number.NEGATIVE_INFINITY;
  if (leftGrowth !== rightGrowth) {
    return leftGrowth > rightGrowth ? left : right;
  }

  if (left.popularity !== right.popularity) {
    return left.popularity > right.popularity ? left : right;
  }

  const leftPreview = left.previewUrl ? 1 : 0;
  const rightPreview = right.previewUrl ? 1 : 0;
  if (leftPreview !== rightPreview) {
    return leftPreview > rightPreview ? left : right;
  }

  const leftArtistCount = (left.featuredArtists?.length ?? 0) + (left.contributorIds?.length ?? 0);
  const rightArtistCount = (right.featuredArtists?.length ?? 0) + (right.contributorIds?.length ?? 0);
  if (leftArtistCount !== rightArtistCount) {
    return leftArtistCount > rightArtistCount ? left : right;
  }

  const leftDuration = left.durationMs ?? 0;
  const rightDuration = right.durationMs ?? 0;
  if (leftDuration !== rightDuration) {
    return leftDuration > rightDuration ? left : right;
  }

  const leftRelease = left.releaseDate ?? "";
  const rightRelease = right.releaseDate ?? "";
  if (leftRelease !== rightRelease) {
    return leftRelease > rightRelease ? left : right;
  }

  return left;
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

  const leaderboardTracks = collapseFeedTrackVersions(tracksWithPeak).map(({ track, versions, primaryVersion }, index) => ({
    track: {
      ...track,
      leaderboardRank: index + 1,
    },
    versions,
    primaryVersion,
  }));

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

  const matchingTracks = leaderboardTracks
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
    .map(({ track }) => ({
      ...track,
      displayName: getDisplayTrackTitle(track.name),
      featuredArtists: dedupeNames(track.featuredArtists),
      recentGrowth: track.recentGrowth ?? null,
    }));

  const dedupedTracks = collapseArtistTracks(matchingTracks, chooseTrackByLeaderboardRank)
    .map(({ track, versions, primaryVersion }) => ({
      ...track,
      versions,
      primaryVersion,
    }))
    .sort((left, right) => {
      if (left.leaderboardRank !== right.leaderboardRank) {
        return left.leaderboardRank - right.leaderboardRank;
      }

      if (right.popularity !== left.popularity) {
        return right.popularity - left.popularity;
      }

      return (right.recentGrowth ?? Number.NEGATIVE_INFINITY) - (left.recentGrowth ?? Number.NEGATIVE_INFINITY);
    })
    .map(({ leaderboardRank: _leaderboardRank, ...track }) => track);

  return NextResponse.json({
    tracks: dedupedTracks,
    genres: artist.genres,
    spotifyPopularity: artist.spotifyPopularity,
  });
}
