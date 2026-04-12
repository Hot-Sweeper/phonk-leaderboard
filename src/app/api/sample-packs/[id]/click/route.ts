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
 * POST /api/sample-packs/[id]/click
 * Track a click on Payhip/Gumroad link. 1 per user (logged in) or 1 per IP (anon).
 * Body: { platform: "payhip" | "gumroad" }
 */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const platform = body.platform === "gumroad" ? "gumroad" : "payhip";

  const session = await auth();
  const userId = session?.user?.id ?? null;

  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  const realIp = hdrs.get("x-real-ip");
  const raw = forwarded?.split(",")[0]?.trim() ?? realIp ?? "unknown";
  const ipHash = hashIp(raw);

  // Check if already clicked (by user or IP)
  if (userId) {
    const existing = await prisma.packClick.findUnique({
      where: { packId_userId: { packId: id, userId } },
    });
    if (existing) {
      return NextResponse.json({ already: true, clickCount: -1 });
    }
  } else {
    const existing = await prisma.packClick.findUnique({
      where: { packId_ipHash: { packId: id, ipHash } },
    });
    if (existing) {
      return NextResponse.json({ already: true, clickCount: -1 });
    }
  }

  try {
    await prisma.packClick.create({
      data: { packId: id, platform, userId, ipHash },
    });

    const pack = await prisma.samplePack.update({
      where: { id },
      data: { clickCount: { increment: 1 } },
      select: { clickCount: true },
    });

    return NextResponse.json({ already: false, clickCount: pack.clickCount });
  } catch {
    // Race condition / unique constraint — already tracked
    return NextResponse.json({ already: true, clickCount: -1 });
  }
}
