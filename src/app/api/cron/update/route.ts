import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchPlatformStats } from "@/lib/platforms";
import { recordSnapshot, recordRankSnapshots } from "@/lib/snapshots";

/**
 * GET /api/cron/update
 * 
 * Called by an external cron service (e.g. Railway cron, cron-job.org).
 * Checks the configured update interval and skips if not enough time has passed.
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: Request) {
  // Verify cron secret
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret") ?? req.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || secret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if enough time has passed since last update
  const settings = await prisma.siteSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const intervalHours = parseInt(map["updateIntervalHours"] ?? "1", 10);
  const lastUpdate = map["lastFullUpdate"];

  if (lastUpdate) {
    const elapsed = Date.now() - new Date(lastUpdate).getTime();
    const intervalMs = intervalHours * 60 * 60 * 1000;
    if (elapsed < intervalMs * 0.9) {
      return NextResponse.json({
        skipped: true,
        reason: `Only ${Math.round(elapsed / 60000)}min since last update. Interval is ${intervalHours}h.`,
        nextUpdateIn: `${Math.round((intervalMs - elapsed) / 60000)}min`,
      });
    }
  }

  // Run the update
  const startTime = Date.now();
  const artists = await prisma.artist.findMany({
    include: { links: true },
  });

  const log = await prisma.updateLog.create({
    data: {
      trigger: "cron",
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

  return NextResponse.json({
    success: true,
    updated,
    failed,
    total: artists.length,
    durationMs: totalDuration,
    logId: log.id,
  });
}
