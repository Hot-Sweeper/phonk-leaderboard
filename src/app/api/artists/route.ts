import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";

// GET artists with optional search + platform filter
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const platform = searchParams.get("platform")?.toUpperCase();

  const where: Record<string, unknown> = {};

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { links: { some: { handle: { contains: q, mode: "insensitive" } } } },
    ];
  }

  if (platform && ["YOUTUBE", "SPOTIFY", "TIKTOK", "INSTAGRAM"].includes(platform)) {
    where.links = { some: { platform } };
  }

  const artists = await prisma.artist.findMany({
    where,
    orderBy: { watchlistCount: "desc" },
    take: 50,
    include: {
      links: { orderBy: { platform: "asc" } },
    },
  });

  return NextResponse.json(artists);
}

// POST — admins/mods add an artist with links
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { name, imageUrl, bio, links } = await req.json();
  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  if (!Array.isArray(links) || links.length === 0) {
    return NextResponse.json(
      { error: "At least one platform link is required." },
      { status: 400 }
    );
  }

  const artist = await prisma.artist.create({
    data: {
      name: name.trim(),
      imageUrl: imageUrl?.trim() || null,
      bio: bio?.trim() || null,
      addedById: session.user.id,
      links: {
        create: links.map(
          (l: { platform: string; url: string; handle?: string }) => ({
            platform: l.platform as Platform,
            url: l.url.trim(),
            handle: l.handle?.trim() || null,
          })
        ),
      },
    },
    include: { links: true },
  });

  return NextResponse.json(artist, { status: 201 });
}
