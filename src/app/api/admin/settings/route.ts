import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlatformStats, fetchSpotifyArtist, parseSpotifyUrl } from "@/lib/platforms";

// GET — fetch site settings
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await prisma.siteSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  return NextResponse.json({
    updateIntervalHours: parseInt(map["updateIntervalHours"] ?? "24", 10),
    lastFullUpdate: map["lastFullUpdate"] ?? null,
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

  const allowed = ["updateIntervalHours"];
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
    return handleUpdateAll();
  }

  if (action === "migrateToSpotify") {
    return handleMigrateToSpotify();
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function handleUpdateAll() {
  const artists = await prisma.artist.findMany({
    include: { links: true },
  });

  let updated = 0;
  let failed = 0;

  for (const artist of artists) {
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

      updated++;
    } catch {
      failed++;
    }
  }

  // Record the time of last update
  await prisma.siteSetting.upsert({
    where: { key: "lastFullUpdate" },
    update: { value: new Date().toISOString() },
    create: { key: "lastFullUpdate", value: new Date().toISOString() },
  });

  return NextResponse.json({ updated, failed, total: artists.length });
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
