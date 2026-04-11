import { prisma } from "@/lib/prisma";
import { fetchPlatformStats, fetchSpotifyTopTracks, fetchSpotifyArtistDetails, parseSpotifyUrl } from "@/lib/platforms";
import { recordSnapshot, recordRankSnapshots } from "@/lib/snapshots";

export type UpdateResult = {
  updated: number;
  failed: number;
  total: number;
  logId: string;
  durationMs: number;
};

/**
 * Run a full stats update for all artists.
 * Creates an UpdateLog entry, updates each artist, records snapshots and ranks.
 */
export async function runFullUpdate(trigger: string = "manual"): Promise<UpdateResult> {
  const startTime = Date.now();

  const artists = await prisma.artist.findMany({
    include: { links: true },
  });

  const log = await prisma.updateLog.create({
    data: {
      trigger,
      status: "running",
      totalArtists: artists.length,
    },
  });

  let updated = 0;
  let failed = 0;
  const details: { name: string; status: string; durationMs: number; error?: string }[] = [];

  for (const artist of artists) {
    const artistStart = Date.now();
    try {
      let newImageUrl = artist.imageUrl;

      for (const link of artist.links) {
        const stats = await fetchPlatformStats(link.platform, link.url);
        if (!stats) continue;

        await prisma.artistLink.update({
          where: { id: link.id },
          data: {
            followerCount: stats.followerCount,
            monthlyListeners: stats.monthlyListeners,
            handle: stats.handle ?? link.handle,
            platformId: stats.platformId ?? link.platformId,
          },
        });

        if (link.platform === "SPOTIFY" && stats.imageUrl) {
          newImageUrl = stats.imageUrl;
        }
      }

      if (newImageUrl !== artist.imageUrl) {
        await prisma.artist.update({
          where: { id: artist.id },
          data: { imageUrl: newImageUrl },
        });
      }

      // Refresh top tracks from Spotify
      const spotifyLink = artist.links.find(l => l.platform === "SPOTIFY");
      const spotifyId = artist.spotifyId ?? spotifyLink?.platformId ?? (spotifyLink?.url ? parseSpotifyUrl(spotifyLink.url) : null);
      if (spotifyId) {
        // Persist spotifyId if missing
        if (!artist.spotifyId) {
          await prisma.artist.update({ where: { id: artist.id }, data: { spotifyId } }).catch(() => {});
        }

        const [topTracks, artistDetails] = await Promise.all([
          fetchSpotifyTopTracks(spotifyId),
          fetchSpotifyArtistDetails(spotifyId),
        ]);

        if (artistDetails) {
          await prisma.artist.update({
            where: { id: artist.id },
            data: { genres: artistDetails.genres, spotifyPopularity: artistDetails.popularity },
          });
        }

        if (topTracks && topTracks.length > 0) {
          for (const t of topTracks) {
            const featured = t.artists.filter(a => a.id !== spotifyId).map(a => a.name);
            await prisma.track.upsert({
              where: { spotifyId: t.id },
              update: {
                name: t.name, albumName: t.album.name, albumImageUrl: t.album.imageUrl,
                previewUrl: t.previewUrl, durationMs: t.durationMs, popularity: t.popularity,
                trackNumber: t.trackNumber, discNumber: t.discNumber, explicit: t.explicit,
                releaseDate: t.album.releaseDate, spotifyUrl: t.spotifyUrl, featuredArtists: featured,
              },
              create: {
                spotifyId: t.id, artistId: artist.id,
                name: t.name, albumName: t.album.name, albumImageUrl: t.album.imageUrl,
                previewUrl: t.previewUrl, durationMs: t.durationMs, popularity: t.popularity,
                trackNumber: t.trackNumber, discNumber: t.discNumber, explicit: t.explicit,
                releaseDate: t.album.releaseDate, spotifyUrl: t.spotifyUrl, featuredArtists: featured,
              },
            });
          }
        }
      }

      await recordSnapshot(artist.id);

      updated++;
      details.push({ name: artist.name, status: "ok", durationMs: Date.now() - artistStart });
    } catch (err) {
      failed++;
      details.push({ name: artist.name, status: "failed", durationMs: Date.now() - artistStart, error: String(err) });
    }

    // Update progress in log so admin UI can poll it
    await prisma.updateLog.update({
      where: { id: log.id },
      data: { updatedCount: updated, failedCount: failed },
    });
  }

  await prisma.siteSetting.upsert({
    where: { key: "lastFullUpdate" },
    update: { value: new Date().toISOString() },
    create: { key: "lastFullUpdate", value: new Date().toISOString() },
  });

  await recordRankSnapshots();

  const totalDuration = Date.now() - startTime;

  await prisma.updateLog.update({
    where: { id: log.id },
    data: {
      status: "completed",
      updatedCount: updated,
      failedCount: failed,
      durationMs: totalDuration,
      details: JSON.stringify(details),
      completedAt: new Date(),
    },
  });

  return { updated, failed, total: artists.length, logId: log.id, durationMs: totalDuration };
}

/**
 * Check if an update is due based on the configured interval, and run if so.
 */
export async function checkAndRunScheduledUpdate(): Promise<boolean> {
  const settings = await prisma.siteSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const intervalHours = parseInt(map["updateIntervalHours"] ?? "1", 10);
  const lastUpdate = map["lastFullUpdate"];

  if (lastUpdate) {
    const elapsed = Date.now() - new Date(lastUpdate).getTime();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    if (elapsed < intervalMs * 0.9) {
      return false; // Not due yet
    }
  }

  console.log("[Scheduler] Update is due, starting...");
  const result = await runFullUpdate("cron");
  console.log(`[Scheduler] Update complete: ${result.updated}/${result.total} updated, ${result.failed} failed, took ${(result.durationMs / 1000).toFixed(1)}s`);
  return true;
}
