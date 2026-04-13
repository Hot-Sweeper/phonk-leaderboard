import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAndRunScheduledUpdate } from "@/lib/update-runner";

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

  // Check if any updater is due based on the configured intervals
  const settings = await prisma.siteSetting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) map[s.key] = s.value;

  const statsIntervalMs = parseInt(map["updateIntervalHours"] ?? "1", 10) * 60 * 60 * 1000;
  const songsIntervalMs = parseInt(map["songUpdateIntervalHours"] ?? "6", 10) * 60 * 60 * 1000;
  const statsElapsed = map["lastFullUpdate"]
    ? Date.now() - new Date(map["lastFullUpdate"]).getTime()
    : Number.POSITIVE_INFINITY;
  const songsElapsed = map["lastSongUpdate"]
    ? Date.now() - new Date(map["lastSongUpdate"]).getTime()
    : Number.POSITIVE_INFINITY;

  if (statsElapsed < statsIntervalMs * 0.9 && songsElapsed < songsIntervalMs * 0.9) {
    return NextResponse.json({
      skipped: true,
      reason: "No scheduled updater is due yet.",
      statsNextUpdateIn: `${Math.max(0, Math.round((statsIntervalMs - statsElapsed) / 60000))}min`,
      songsNextUpdateIn: `${Math.max(0, Math.round((songsIntervalMs - songsElapsed) / 60000))}min`,
    });
  }

  const didRun = await checkAndRunScheduledUpdate();

  return NextResponse.json({
    success: true,
    didRun,
    ranStats: statsElapsed >= statsIntervalMs * 0.9,
    ranSongs: songsElapsed >= songsIntervalMs * 0.9,
  });
}
