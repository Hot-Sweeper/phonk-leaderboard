import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlatformStats } from "@/lib/platforms";

// POST — suggest a link change for an artist
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: artistId } = await params;
  const { platform, url, note } = await req.json();

  if (!platform || !url?.trim()) {
    return NextResponse.json(
      { error: "Platform and URL are required." },
      { status: 400 }
    );
  }

  if (!["YOUTUBE", "SPOTIFY", "TIKTOK", "INSTAGRAM"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";

  // Admins/mods: apply directly without review
  if (isPrivileged) {
    const stats = await fetchPlatformStats(platform, url.trim());

    await prisma.artistLink.upsert({
      where: {
        artistId_platform: { artistId, platform },
      },
      update: {
        url: url.trim(),
        handle: stats?.handle ?? null,
        followerCount: stats?.followerCount ?? 0,
        monthlyListeners: stats?.monthlyListeners ?? 0,
        platformId: stats?.platformId ?? null,
      },
      create: {
        artistId,
        platform,
        url: url.trim(),
        handle: stats?.handle ?? null,
        followerCount: stats?.followerCount ?? 0,
        monthlyListeners: stats?.monthlyListeners ?? 0,
        platformId: stats?.platformId ?? null,
      },
    });

    const updated = await prisma.artist.findUnique({
      where: { id: artistId },
      include: {
        links: { orderBy: { platform: "asc" } },
        suggestions: {
          where: { status: "PENDING" },
          select: { id: true, platform: true, url: true, note: true, createdAt: true },
        },
      },
    });

    return NextResponse.json(updated);
  }

  // Regular users: create a suggestion for review
  const existing = await prisma.linkSuggestion.findFirst({
    where: { artistId, platform, userId: session.user.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending suggestion for this platform." },
      { status: 409 }
    );
  }

  const suggestion = await prisma.linkSuggestion.create({
    data: {
      artistId,
      platform,
      url: url.trim(),
      note: note?.trim() || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(suggestion, { status: 201 });
}
