import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/admin/update-progress
 * Returns the latest running or recently completed update log for progress tracking.
 */
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const log = await prisma.updateLog.findFirst({
    orderBy: { createdAt: "desc" },
  });

  if (!log) {
    return NextResponse.json({ status: "idle" });
  }

  return NextResponse.json({
    id: log.id,
    status: log.status,
    trigger: log.trigger,
    totalArtists: log.totalArtists,
    updatedCount: log.updatedCount,
    failedCount: log.failedCount,
    durationMs: log.durationMs,
    createdAt: log.createdAt,
    completedAt: log.completedAt,
  });
}
