import { prisma } from "@/lib/prisma";
import { fetchPlatformStats, fetchSpotifyFullCatalog, fetchSpotifyArtistDetails, parseSpotifyUrl, resolveArtistToDeezer, fetchDeezerFullCatalog } from "@/lib/platforms";
import { recordSnapshot, recordRankSnapshots, recordTrackSnapshots } from "@/lib/snapshots";
import { dedupeArtistTracks, dedupeNames } from "@/lib/track-dedupe";

type ArtistLinkForUpdate = {
  id: string;
  platform: string;
  url: string;
  handle: string | null;
  platformId: string | null;
  followerCount: number;
  monthlyListeners: number;
};

type ArtistForUpdate = {
  id: string;
  name: string;
  imageUrl: string | null;
  spotifyId: string | null;
  deezerId: number | null;
  links: ArtistLinkForUpdate[];
};

export type UpdateResult = {
  updated: number;
  failed: number;
  total: number;
  logId: string;
  durationMs: number;
};

const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes — anything running longer is considered stale

async function getArtistForUpdate(artistId: string): Promise<ArtistForUpdate | null> {
  return prisma.artist.findUnique({
    where: { id: artistId },
    include: { links: true },
  });
}

async function buildDeezerArtistMap() {
  const allArtists = await prisma.artist.findMany({
    select: { id: true, deezerId: true },
  });

  const deezerIdToArtistId = new Map<number, string>();
  for (const artist of allArtists) {
    if (artist.deezerId) {
      deezerIdToArtistId.set(artist.deezerId, artist.id);
    }
  }

  return deezerIdToArtistId;
}

function normTrackName(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function deduplicateStoredTracksForArtist(artistId: string) {
  const existingTracks = await prisma.track.findMany({
    where: { artistId },
    orderBy: [{ popularity: "desc" }, { updatedAt: "desc" }],
  });

  if (existingTracks.length <= 1) return;

  const keptTracks = dedupeArtistTracks(existingTracks);
  const keepIds = new Set(keptTracks.map((track) => track.id));

  // Any deezerId present in a winning track
  const keptDeezerIds = new Set(
    keptTracks.map((t) => t.deezerId).filter((id): id is string => id != null)
  );

  // Cross-link: if a losing track has a spotifyId that its duplicate winner lacks, transfer it
  for (const winner of keptTracks) {
    if (winner.spotifyId) continue;
    const winnerNorm = normTrackName(winner.name);
    for (const loser of existingTracks) {
      if (keepIds.has(loser.id)) continue;
      if (!loser.spotifyId) continue;
      if (normTrackName(loser.name) !== winnerNorm) continue;
      await prisma.track.update({
        where: { id: winner.id },
        data: {
          spotifyId: loser.spotifyId,
          ...(loser.spotifyUrl ? { spotifyUrl: loser.spotifyUrl } : {}),
        },
      }).catch(() => {});
      break;
    }
  }

  // Only delete losers whose deezerId is ALREADY represented in the winners.
  // A loser with a unique deezerId is a genuinely distinct Deezer track — keep it.
  const deleteIds = existingTracks
    .filter((track) => {
      if (keepIds.has(track.id)) return false; // winner — never delete
      if (track.deezerId && !keptDeezerIds.has(track.deezerId)) return false; // unique Deezer entry — keep
      return true; // no unique deezerId — safe to remove
    })
    .map((track) => track.id);

  if (deleteIds.length > 0) {
    await prisma.track.deleteMany({ where: { id: { in: deleteIds } } });
  }
}

async function refreshArtistStatsInternal(artist: ArtistForUpdate) {
  let newImageUrl = artist.imageUrl;
  const platformStats: { platform: string; value: number; metric: string }[] = [];

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

    if (link.platform === "SPOTIFY") {
      if (stats.monthlyListeners > 0) {
        platformStats.push({ platform: "SPOTIFY", value: stats.monthlyListeners, metric: "listeners" });
      }
      if (stats.followerCount > 0) {
        platformStats.push({ platform: "SPOTIFY_FOLLOWERS", value: stats.followerCount, metric: "followers" });
      }
    } else if (link.platform === "YOUTUBE") {
      platformStats.push({ platform: "YOUTUBE", value: stats.followerCount, metric: "subscribers" });
    } else if (link.platform === "TIKTOK") {
      platformStats.push({ platform: "TIKTOK", value: stats.followerCount, metric: "followers" });
    } else if (link.platform === "INSTAGRAM") {
      platformStats.push({ platform: "INSTAGRAM", value: stats.followerCount, metric: "followers" });
    }
  }

  if (newImageUrl !== artist.imageUrl) {
    await prisma.artist.update({
      where: { id: artist.id },
      data: { imageUrl: newImageUrl },
    });
  }

  return { platformStats };
}

async function refreshArtistCatalogInternal(
  artist: ArtistForUpdate,
  deezerIdToArtistId: Map<number, string>
) {
  const spotifyLink = artist.links.find((link) => link.platform === "SPOTIFY");
  const spotifyId = artist.spotifyId ?? spotifyLink?.platformId ?? (spotifyLink?.url ? parseSpotifyUrl(spotifyLink.url) : null);
  let deezerId = artist.deezerId;

  if (!spotifyId && !deezerId) {
    return { trackCount: 0, trackIds: [] as string[] };
  }

  if (spotifyId && !artist.spotifyId) {
    await prisma.artist.update({
      where: { id: artist.id },
      data: { spotifyId },
    }).catch(() => {});
  }

  if (!deezerId) {
    const resolved = await resolveArtistToDeezer(artist.name, spotifyId);
    deezerId = resolved.deezerId;
    if (deezerId) {
      await prisma.artist.update({
        where: { id: artist.id },
        data: { deezerId },
      }).catch(() => {});
      deezerIdToArtistId.set(deezerId, artist.id);
    }
  }

  if (spotifyId) {
    const artistDetails = await fetchSpotifyArtistDetails(spotifyId);
    if (artistDetails) {
      await prisma.artist.update({
        where: { id: artist.id },
        data: { genres: artistDetails.genres, spotifyPopularity: artistDetails.popularity },
      });
    }
  }

  const touchedTrackIds: string[] = [];
  let trackCount = 0;

  if (deezerId) {
    const deezerTracks = await fetchDeezerFullCatalog(deezerId);

    if (deezerTracks && deezerTracks.length > 0) {
      for (const track of deezerTracks) {
        const deezerTrackId = String(track.deezerId);
        const featured = dedupeNames(
          track.artists.filter((artistEntry) => artistEntry.deezerId !== deezerId).map((artistEntry) => artistEntry.name)
        );
        const contributorIds = [
          ...new Set(
            track.artists
              .filter((artistEntry) => artistEntry.deezerId !== deezerId)
              .map((artistEntry) => deezerIdToArtistId.get(artistEntry.deezerId))
              .filter((id): id is string => !!id)
          ),
        ];

        const savedTrack = await prisma.track.upsert({
          where: { deezerId: deezerTrackId },
          update: {
            name: track.name,
            albumName: track.album.name,
            albumImageUrl: track.album.imageUrl,
            previewUrl: track.previewUrl,
            durationMs: track.durationMs,
            popularity: track.popularity,
            trackNumber: track.trackNumber,
            explicit: track.explicit,
            releaseDate: track.releaseDate ?? track.album.releaseDate,
            deezerUrl: track.deezerUrl,
            bpm: track.bpm,
            gain: track.gain,
            featuredArtists: featured,
            contributorIds,
          },
          create: {
            deezerId: deezerTrackId,
            artistId: artist.id,
            name: track.name,
            albumName: track.album.name,
            albumImageUrl: track.album.imageUrl,
            previewUrl: track.previewUrl,
            durationMs: track.durationMs,
            popularity: track.popularity,
            trackNumber: track.trackNumber,
            explicit: track.explicit,
            releaseDate: track.releaseDate ?? track.album.releaseDate,
            deezerUrl: track.deezerUrl,
            bpm: track.bpm,
            gain: track.gain,
            featuredArtists: featured,
            contributorIds,
          },
          select: { id: true },
        });

        touchedTrackIds.push(savedTrack.id);
        trackCount++;
      }

      await deduplicateStoredTracksForArtist(artist.id);
    }

    // ── Supplement: also fetch Spotify catalog to catch any tracks exclusive to Spotify ──
    if (spotifyId) {
      try {
        const spotifyTracks = await fetchSpotifyFullCatalog(spotifyId);

        if (spotifyTracks && spotifyTracks.length > 0) {
          for (const track of spotifyTracks) {
            const featured = dedupeNames(
              track.artists.filter((artistEntry) => artistEntry.id !== spotifyId).map((artistEntry) => artistEntry.name)
            );

            const savedTrack = await prisma.track.upsert({
              where: { spotifyId: track.id },
              update: {
                name: track.name,
                albumName: track.album.name,
                albumImageUrl: track.album.imageUrl,
                previewUrl: track.previewUrl,
                durationMs: track.durationMs,
                ...(track.popularity > 0 ? { popularity: track.popularity } : {}),
                trackNumber: track.trackNumber,
                discNumber: track.discNumber,
                explicit: track.explicit,
                releaseDate: track.album.releaseDate,
                spotifyUrl: track.spotifyUrl,
                featuredArtists: featured,
              },
              create: {
                spotifyId: track.id,
                artistId: artist.id,
                name: track.name,
                albumName: track.album.name,
                albumImageUrl: track.album.imageUrl,
                previewUrl: track.previewUrl,
                durationMs: track.durationMs,
                ...(track.popularity > 0 ? { popularity: track.popularity } : {}),
                trackNumber: track.trackNumber,
                discNumber: track.discNumber,
                explicit: track.explicit,
                releaseDate: track.album.releaseDate,
                spotifyUrl: track.spotifyUrl,
                featuredArtists: featured,
              },
              select: { id: true },
            });

            touchedTrackIds.push(savedTrack.id);
            trackCount++;
          }

          await deduplicateStoredTracksForArtist(artist.id);
        }
      } catch (err) {
        console.error(`[Catalog] Spotify supplement failed for ${artist.name}:`, err);
      }
    }
  } else if (spotifyId) {
    const spotifyTracks = await fetchSpotifyFullCatalog(spotifyId);

    if (spotifyTracks && spotifyTracks.length > 0) {
      for (const track of spotifyTracks) {
        const featured = dedupeNames(
          track.artists.filter((artistEntry) => artistEntry.id !== spotifyId).map((artistEntry) => artistEntry.name)
        );

        const savedTrack = await prisma.track.upsert({
          where: { spotifyId: track.id },
          update: {
            name: track.name,
            albumName: track.album.name,
            albumImageUrl: track.album.imageUrl,
            previewUrl: track.previewUrl,
            durationMs: track.durationMs,
            ...(track.popularity > 0 ? { popularity: track.popularity } : {}),
            trackNumber: track.trackNumber,
            discNumber: track.discNumber,
            explicit: track.explicit,
            releaseDate: track.album.releaseDate,
            spotifyUrl: track.spotifyUrl,
            featuredArtists: featured,
          },
          create: {
            spotifyId: track.id,
            artistId: artist.id,
            name: track.name,
            albumName: track.album.name,
            albumImageUrl: track.album.imageUrl,
            previewUrl: track.previewUrl,
            durationMs: track.durationMs,
            ...(track.popularity > 0 ? { popularity: track.popularity } : {}),
            trackNumber: track.trackNumber,
            discNumber: track.discNumber,
            explicit: track.explicit,
            releaseDate: track.album.releaseDate,
            spotifyUrl: track.spotifyUrl,
            featuredArtists: featured,
          },
          select: { id: true },
        });

        touchedTrackIds.push(savedTrack.id);
        trackCount++;
      }

      await deduplicateStoredTracksForArtist(artist.id);
    }
  }

  return {
    trackCount,
    trackIds: [...new Set(touchedTrackIds)],
  };
}

export async function hydrateArtistNow(artistId: string) {
  const artist = await getArtistForUpdate(artistId);
  if (!artist) {
    throw new Error(`Artist not found: ${artistId}`);
  }

  const deezerIdToArtistId = await buildDeezerArtistMap();
  const { platformStats } = await refreshArtistStatsInternal(artist);
  const { trackCount, trackIds } = await refreshArtistCatalogInternal(artist, deezerIdToArtistId);

  await recordSnapshot(artistId);
  if (trackIds.length > 0) {
    await recordTrackSnapshots(trackIds);
  }

  return { platformStats, trackCount };
}

/** Mark stale "running" logs as failed, then check if a real one is still running */
async function isUpdateRunning(updateType: string): Promise<boolean> {
  // Mark stale entries as failed
  await prisma.updateLog.updateMany({
    where: {
      updateType,
      status: "running",
      createdAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
    data: { status: "failed", completedAt: new Date() },
  });

  const running = await prisma.updateLog.findFirst({
    where: { updateType, status: "running" },
  });
  return !!running;
}

/** Cancel all currently running update logs */
export async function cancelAllRunning(): Promise<number> {
  const result = await prisma.updateLog.updateMany({
    where: { status: "running" },
    data: { status: "cancelled", completedAt: new Date() },
  });
  return result.count;
}

/**
 * Run a full stats update for all artists.
 * Creates an UpdateLog entry, updates each artist's platform stats, records snapshots and ranks.
 */
export async function runFullUpdate(trigger: string = "manual"): Promise<UpdateResult> {
  if (await isUpdateRunning("stats")) {
    throw new Error("A stats update is already running.");
  }

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
  const details: {
    name: string;
    status: string;
    durationMs: number;
    error?: string;
    platforms?: { platform: string; value: number; metric: string }[];
  }[] = [];

  try {
    for (const artist of artists) {
      const artistStart = Date.now();
      try {
        const { platformStats } = await refreshArtistStatsInternal(artist);
        await recordSnapshot(artist.id);

        updated++;
        details.push({ name: artist.name, status: "ok", durationMs: Date.now() - artistStart, platforms: platformStats });
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
  } catch (err) {
    // Crash during update — mark log as failed so it doesn't stay stuck
    const totalDuration = Date.now() - startTime;
    await prisma.updateLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        updatedCount: updated,
        failedCount: failed,
        durationMs: totalDuration,
        error: String(err),
        details: JSON.stringify([...details, { name: "CRASH", status: "failed", durationMs: 0, error: String(err) }]),
        completedAt: new Date(),
      },
    }).catch(() => {});
    throw err;
  }
}

/**
 * Run a song/track update for all artists — fetches top tracks + genres + popularity from Spotify.
 */
export async function runSongUpdate(trigger: string = "manual"): Promise<UpdateResult> {
  if (await isUpdateRunning("songs")) {
    throw new Error("A song update is already running.");
  }

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

  const deezerIdToArtistId = await buildDeezerArtistMap();

  let updated = 0;
  let failed = 0;
  const details: { name: string; status: string; durationMs: number; tracks?: number; error?: string }[] = [];

  try {
    for (const artist of artists) {
      const artistStart = Date.now();
      try {
        const { trackCount } = await refreshArtistCatalogInternal(artist, deezerIdToArtistId);

        if (trackCount > 0) {
          updated++;
          details.push({ name: artist.name, status: "ok", durationMs: Date.now() - artistStart, tracks: trackCount });
        } else {
          details.push({ name: artist.name, status: "no-tracks", durationMs: Date.now() - artistStart, tracks: 0 });
        }
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

    await recordTrackSnapshots();

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
  } catch (err) {
    const totalDuration = Date.now() - startTime;
    await prisma.updateLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        updatedCount: updated,
        failedCount: failed,
        durationMs: totalDuration,
        error: String(err),
        details: JSON.stringify([...details, { name: "CRASH", status: "failed", durationMs: 0, error: String(err) }]),
        completedAt: new Date(),
      },
    }).catch(() => {});
    throw err;
  }
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
    try {
      const result = await runFullUpdate("cron");
      console.log(`[Scheduler] Stats update complete: ${result.updated}/${result.total} updated, ${result.failed} failed, took ${(result.durationMs / 1000).toFixed(1)}s`);
      didRun = true;
    } catch (err) {
      console.error("[Scheduler] Stats update failed:", err);
      // Still record lastFullUpdate so we don't retry every 5 minutes
      await prisma.siteSetting.upsert({
        where: { key: "lastFullUpdate" },
        update: { value: new Date().toISOString() },
        create: { key: "lastFullUpdate", value: new Date().toISOString() },
      }).catch(() => {});
    }
  }

  // Check song update
  const songInterval = parseInt(map["songUpdateIntervalHours"] ?? "6", 10);
  const lastSongs = map["lastSongUpdate"];
  const songElapsed = lastSongs ? Date.now() - new Date(lastSongs).getTime() : Infinity;
  const songIntervalMs = songInterval * 60 * 60 * 1000;

  if (songElapsed >= songIntervalMs * 0.9) {
    console.log("[Scheduler] Song update is due, starting...");
    try {
      const result = await runSongUpdate("cron");
      console.log(`[Scheduler] Song update complete: ${result.updated}/${result.total} updated, ${result.failed} failed, took ${(result.durationMs / 1000).toFixed(1)}s`);
      didRun = true;
    } catch (err) {
      console.error("[Scheduler] Song update failed:", err);
      // Still record lastSongUpdate so we don't retry every 5 minutes
      await prisma.siteSetting.upsert({
        where: { key: "lastSongUpdate" },
        update: { value: new Date().toISOString() },
        create: { key: "lastSongUpdate", value: new Date().toISOString() },
      }).catch(() => {});
    }
  }

  return didRun;
}
