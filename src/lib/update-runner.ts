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
 * Creates an UpdateLog entry, updates each artist's platform stats, records snapshots and ranks.
 */
export async function runFullUpdate(trigger: string = "manual"): Promise<UpdateResult> {
  const startTime = Date.now();

  const artists = await prisma.artist.findMany({
    include: { links: true },
  });

  const log = await prisma.updateLog.create({
    data: {
      trigger,
      updateType: "stats",
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

      await recordSnapshot(artist.id);

      updated++;
      details.push({ name: artist.name, status: "ok", durationMs: Date.now() - artistStart });
    } catch (err) {
      failed++;
      details.push({ name: artist.name, status: "failed", durationMs: Date.now() - artistStart, error: String(err) });
    }

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
 * Run a song/track update for all artists — fetches top tracks + genres + popularity from Spotify.
 */
export async function runSongUpdate(trigger: string = "manual"): Promise<UpdateResult> {
  const startTime = Date.now();

  const artists = await prisma.artist.findMany({
    include: { links: { where: { platform: "SPOTIFY" } } },
  });

  const log = await prisma.updateLog.create({
    data: {
      trigger,
      updateType: "songs",
      status: "running",
      totalArtists: artists.length,
    },
  });

  let updated = 0;
  let failed = 0;
  const details: { name: string; status: string; durationMs: number; tracks?: number; error?: string }[] = [];

  for (const artist of artists) {
    const artistStart = Date.now();
    try {
      const spotifyLink = artist.links[0];
      const spotifyId = artist.spotifyId ?? spotifyLink?.platformId ?? (spotifyLink?.url ? parseSpotifyUrl(spotifyLink.url) : null);

      if (!spotifyId) {
        details.push({ name: artist.name, status: "skipped", durationMs: Date.now() - artistStart });
        continue;
      }

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

      let trackCount = 0;
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
          trackCount++;
        }
      }

      updated++;
      details.push({ name: artist.name, status: "ok", durationMs: Date.now() - artistStart, tracks: trackCount });
    } catch (err) {
      failed++;
      details.push({ name: artist.name, status: "failed", durationMs: Date.now() - artistStart, error: String(err) });
    }

    await prisma.updateLog.update({
      where: { id: log.id },
      data: { updatedCount: updated, failedCount: failed },
    });
  }

  await prisma.siteSetting.upsert({
    where: { key: "lastSongUpdate" },
    update: { value: new Date().toISOString() },
    create: { key: "lastSongUpdate", value: new Date().toISOString() },
  });

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
 * Check if a stats update is due based on the configured interval, and run if so.
 */
export async function checkAndRunScheduledUpdate(): Promise<boolean> {
  const settings = await prisma.siteSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  let didRun = false;

  // Check stats update
  const statsInterval = parseInt(map["updateIntervalHours"] ?? "1", 10);
  const lastStats = map["lastFullUpdate"];
  const statsElapsed = lastStats ? Date.now() - new Date(lastStats).getTime() : Infinity;
  const statsIntervalMs = statsInterval * 60 * 60 * 1000;

  if (statsElapsed >= statsIntervalMs * 0.9) {
    console.log("[Scheduler] Stats update is due, starting...");
    const result = await runFullUpdate("cron");
    console.log(`[Scheduler] Stats update complete: ${result.updated}/${result.total} updated, ${result.failed} failed, took ${(result.durationMs / 1000).toFixed(1)}s`);
    didRun = true;
  }

  // Check song update
  const songInterval = parseInt(map["songUpdateIntervalHours"] ?? "6", 10);
  const lastSongs = map["lastSongUpdate"];
  const songElapsed = lastSongs ? Date.now() - new Date(lastSongs).getTime() : Infinity;
  const songIntervalMs = songInterval * 60 * 60 * 1000;

  if (songElapsed >= songIntervalMs * 0.9) {
    console.log("[Scheduler] Song update is due, starting...");
    const result = await runSongUpdate("cron");
    console.log(`[Scheduler] Song update complete: ${result.updated}/${result.total} updated, ${result.failed} failed, took ${(result.durationMs / 1000).toFixed(1)}s`);
    didRun = true;
  }

  return didRun;
}
