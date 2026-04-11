import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchSpotifyArtist, parseSpotifyUrl } from "@/lib/platforms";
import { runFullUpdate, runSongUpdate, cancelAllRunning } from "@/lib/update-runner";

const SCHEDULED_UPDATERS = [
  {
    key: "updateIntervalHours",
    lastRunKey: "lastFullUpdate",
    label: "Stats Updater",
    description: "Refreshes artist platform stats, rank history, and profile metadata.",
    defaultHours: 1,
    updateType: "stats",
  },
  {
    key: "songUpdateIntervalHours",
    lastRunKey: "lastSongUpdate",
    label: "Song Updater",
    description: "Refreshes track popularity, credits, and song hype snapshot history.",
    defaultHours: 6,
    updateType: "songs",
  },
] as const;

// GET — fetch site settings + recent update logs
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.siteSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const logs = await prisma.updateLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({
    updateIntervalHours: parseInt(map["updateIntervalHours"] ?? "1", 10),
    lastFullUpdate: map["lastFullUpdate"] ?? null,
    songUpdateIntervalHours: parseInt(map["songUpdateIntervalHours"] ?? "6", 10),
    lastSongUpdate: map["lastSongUpdate"] ?? null,
    updaters: SCHEDULED_UPDATERS.map((updater) => ({
      key: updater.key,
      label: updater.label,
      description: updater.description,
      updateType: updater.updateType,
      intervalHours: parseInt(map[updater.key] ?? String(updater.defaultHours), 10),
      lastRun: map[updater.lastRunKey] ?? null,
    })),
    logs,
  });
}

// PATCH — update a setting
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { key, value } = await req.json();
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  const allowed = SCHEDULED_UPDATERS.map((updater) => updater.key);
  if (!allowed.includes(key)) {
    return NextResponse.json({ error: "Invalid setting key" }, { status: 400 });
  }

  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });

  return NextResponse.json({ success: true });
}

// POST — trigger actions: updateAll or migrateToSpotify
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action } = await req.json();

  if (action === "updateAll") {
    try {
      return await handleUpdateAll();
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 409 });
    }
  }

  if (action === "updateSongs") {
    try {
      const result = await runSongUpdate("manual");
      return NextResponse.json(result);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 409 });
    }
  }

  if (action === "cancelAll") {
    const count = await cancelAllRunning();
    return NextResponse.json({ cancelled: count });
  }

  if (action === "migrateToSpotify") {
    return handleMigrateToSpotify();
  }

  if (action === "deduplicate") {
    return handleDeduplicate();
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function handleUpdateAll() {
  const result = await runFullUpdate("manual");
  return NextResponse.json(result);
}

async function handleMigrateToSpotify() {
  // Find all artists that have a Spotify link
  const artists = await prisma.artist.findMany({
    include: { links: true },
  });

  let migrated = 0;
  let failed = 0;

  for (const artist of artists) {
    const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
    if (!spotifyLink) continue;

    try {
      const spotifyData = await fetchSpotifyArtist(spotifyLink.url);
      if (!spotifyData) continue;

      const spotifyId = parseSpotifyUrl(spotifyLink.url);

      const updateData: Record<string, unknown> = {};
      if (spotifyData.name) updateData.name = spotifyData.name;
      if (spotifyData.imageUrl) updateData.imageUrl = spotifyData.imageUrl;
      if (spotifyId && !artist.spotifyId) updateData.spotifyId = spotifyId;

      if (Object.keys(updateData).length > 0) {
        await prisma.artist.update({
          where: { id: artist.id },
          data: updateData,
        });
      }

      // Also update stats while we're at it
      await prisma.artistLink.update({
        where: { id: spotifyLink.id },
        data: {
          followerCount: spotifyData.followerCount,
          monthlyListeners: spotifyData.monthlyListeners,
          platformId: spotifyId ?? spotifyLink.platformId,
        },
      });

      migrated++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ migrated, failed, total: artists.length });
}

async function handleDeduplicate() {
  // Find artists grouped by name (case-insensitive) to detect duplicates
  const artists = await prisma.artist.findMany({
    include: { links: true, _count: { select: { watchlistedBy: true } } },
    orderBy: { name: "asc" },
  });

  // Group by lowercase name
  const groups = new Map<string, typeof artists>();
  for (const a of artists) {
    const key = a.name.toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  let deleted = 0;

  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    // Sort: most links first, then most watchlist, then oldest (keep first created)
    group.sort((a, b) => {
      const linkDiff = b.links.length - a.links.length;
      if (linkDiff !== 0) return linkDiff;
      const watchDiff = b._count.watchlistedBy - a._count.watchlistedBy;
      if (watchDiff !== 0) return watchDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    // Keep the first, delete the rest
    const keep = group[0];
    for (let i = 1; i < group.length; i++) {
      const dupe = group[i];

      // Move any unique platform links to the keeper before deleting
      for (const link of dupe.links) {
        const keeperHasPlatform = keep.links.some(
          (kl) => kl.platform === link.platform
        );
        if (!keeperHasPlatform) {
          await prisma.artistLink.update({
            where: { id: link.id },
            data: { artistId: keep.id },
          });
        }
      }

      await prisma.artist.delete({ where: { id: dupe.id } });
      deleted++;
    }
  }

  return NextResponse.json({ deleted, totalGroups: groups.size });
}
