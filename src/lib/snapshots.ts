import { prisma } from "@/lib/prisma";
import { getArtistInternalMetrics } from "@/lib/legal-rankings";

/**
 * Record a snapshot of an artist's internal popularity/hype indices.
 * Legalized mode avoids persisting raw platform counters here.
 */
export async function recordSnapshot(artistId: string) {
  const [artist, previousSnapshot, watchlistAggregate] = await Promise.all([
    prisma.artist.findUnique({
      where: { id: artistId },
      select: {
        id: true,
        watchlistCount: true,
        tracks: {
          select: {
            popularity: true,
            previewUrl: true,
            releaseDate: true,
          },
        },
      },
    }),
    prisma.artistSnapshot.findFirst({
      where: { artistId },
      orderBy: { createdAt: "desc" },
      select: {
        monthlyListeners: true,
        followerCount: true,
      },
    }),
    prisma.artist.aggregate({
      _max: { watchlistCount: true },
    }),
  ]);

  if (!artist) return;

  const metrics = getArtistInternalMetrics({
    tracks: artist.tracks,
    watchlistCount: artist.watchlistCount,
    maxWatchlistCount: watchlistAggregate._max.watchlistCount ?? 1,
    previousSnapshot: previousSnapshot
      && previousSnapshot.monthlyListeners <= 100
      && previousSnapshot.followerCount <= 100
      ? {
          popularityIndex: previousSnapshot.monthlyListeners,
          hypeIndex: previousSnapshot.followerCount,
        }
      : null,
  });

  await prisma.artistSnapshot.create({
    data: {
      artistId,
      monthlyListeners: metrics.popularityScore,
      followerCount: metrics.hypeScore,
      youtubeSubscribers: metrics.breakoutTrackCount,
      tiktokFollowers: metrics.recentReleaseCount,
      instagramFollowers: metrics.activeTrackCount,
    },
  });
}

/**
 * Record a popularity snapshot for tracks so song hype rankings can compare changes over time.
 */
export async function recordTrackSnapshots(trackIds?: string[]) {
  const tracks = await prisma.track.findMany({
    where: trackIds ? { id: { in: trackIds } } : undefined,
    select: {
      id: true,
      popularity: true,
      spotifyPopularity: true,
      youtubeViews: true,
    },
  });

  const tracksWithSignals = tracks.filter(
    (track) => track.popularity > 0 || track.spotifyPopularity > 0 || track.youtubeViews > 0
  );

  if (tracksWithSignals.length === 0) return;

  await prisma.trackSnapshot.createMany({
    data: tracksWithSignals.map((track) => ({
      trackId: track.id,
      popularity: track.popularity,
      spotifyPopularity: track.spotifyPopularity,
      youtubeViews: track.youtubeViews,
    })),
  });
}

/**
 * Record today's rank for all artists using the latest internal popularity index.
 * Uses upsert to avoid duplicates if called multiple times per day.
 */
export async function recordRankSnapshots() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const [artists, latestSnapshots] = await Promise.all([
    prisma.artist.findMany({
      select: {
        id: true,
        name: true,
        watchlistCount: true,
      },
    }),
    prisma.artistSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      distinct: ["artistId"],
      select: {
        artistId: true,
        monthlyListeners: true,
      },
    }),
  ]);

  const latestSnapshotMap = new Map(
    latestSnapshots.map((snapshot) => [
      snapshot.artistId,
      snapshot.monthlyListeners <= 100 ? snapshot.monthlyListeners : 0,
    ])
  );

  artists.sort((a, b) => {
    const aListeners = latestSnapshotMap.get(a.id) ?? 0;
    const bListeners = latestSnapshotMap.get(b.id) ?? 0;
    if (bListeners !== aListeners) return bListeners - aListeners;
    if (b.watchlistCount !== a.watchlistCount) return b.watchlistCount - a.watchlistCount;
    return a.name.localeCompare(b.name);
  });

  // Record each artist's rank
  for (let i = 0; i < artists.length; i++) {
    await prisma.rankSnapshot.upsert({
      where: {
        artistId_date: { artistId: artists[i].id, date: today },
      },
      create: {
        artistId: artists[i].id,
        rank: i + 1,
        date: today,
      },
      update: {
        rank: i + 1,
      },
    });
  }
}
