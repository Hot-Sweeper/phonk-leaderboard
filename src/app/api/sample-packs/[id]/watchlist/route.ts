import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { createHash } from "crypto";

type Params = { params: Promise<{ id: string }> };

function hashIp(ip: string): string {
  return createHash("sha256").update(ip + (process.env.IP_SALT ?? "phonk-salt")).digest("hex").slice(0, 32);
}

/**
 * POST /api/sample-packs/[id]/watchlist — toggle watchlist (add/remove)
 * 1 per user (logged in) or 1 per IP (anon).
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  const realIp = hdrs.get("x-real-ip");
  const raw = forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";
  const ipHash = hashIp(raw);

  // Check existing
  let existing;
  if (userId) {
    existing = await prisma.packWatchlist.findUnique({
      where: { packId_userId: { packId: id, userId } },
    });
  } else {
    existing = await prisma.packWatchlist.findUnique({
      where: { packId_ipHash: { packId: id, ipHash } },
    });
  }

  if (existing) {
    // Remove from watchlist
    await prisma.packWatchlist.delete({ where: { id: existing.id } });
    const pack = await prisma.samplePack.update({
      where: { id },
      data: { watchlistCount: { decrement: 1 } },
      select: { watchlistCount: true },
    });
    return NextResponse.json({ watched: false, watchlistCount: Math.max(0, pack.watchlistCount) });
  }

  try {
    await prisma.packWatchlist.create({
      data: { packId: id, userId, ipHash },
    });
    const pack = await prisma.samplePack.update({
      where: { id },
      data: { watchlistCount: { increment: 1 } },
      select: { watchlistCount: true },
    });
    return NextResponse.json({ watched: true, watchlistCount: pack.watchlistCount });
  } catch {
    return NextResponse.json({ watched: false, watchlistCount: -1 });
  }
}
