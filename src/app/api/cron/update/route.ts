import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runFullUpdate } from "@/lib/update-runner";

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

  const result = await runFullUpdate("cron");

  return NextResponse.json({
    success: true,
    ...result,
  });
}
