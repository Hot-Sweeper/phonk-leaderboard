import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/update-progress
 * Returns the latest running or recently completed update log for progress tracking.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const requestedType = searchParams.get("updateType");
  const updateType = requestedType === "stats" || requestedType === "songs"
    ? requestedType
    : null;

  const log = await prisma.updateLog.findFirst({
    where: updateType ? { updateType } : undefined,
    orderBy: { createdAt: "desc" },
  });

  if (!log) {
    return NextResponse.json({ status: "idle" });
  }

  const processedArtists = log.updatedCount + log.failedCount;
  const progressPercent = log.totalArtists > 0
    ? Math.round((processedArtists / log.totalArtists) * 100)
    : 0;

  let coverage = null;
  if (log.updateType === "songs") {
    const [tracksWithSpotifyPopularity, tracksWithYouTube, snapshotsWithSpotifyPopularity] = await Promise.all([
      prisma.track.count({ where: { spotifyPopularity: { gt: 0 } } }),
      prisma.track.count({ where: { youtubeViews: { gt: 0 } } }),
      prisma.trackSnapshot.count({ where: { spotifyPopularity: { gt: 0 } } }),
    ]);

    coverage = {
      tracksWithSpotifyPopularity,
      tracksWithYouTube,
      snapshotsWithSpotifyPopularity,
    };
  }

  return NextResponse.json({
    id: log.id,
    status: log.status,
    trigger: log.trigger,
    updateType: log.updateType,
    totalArtists: log.totalArtists,
    updatedCount: log.updatedCount,
    failedCount: log.failedCount,
    processedArtists,
    progressPercent,
    durationMs: log.durationMs,
    createdAt: log.createdAt,
    completedAt: log.completedAt,
    coverage,
  });
}
