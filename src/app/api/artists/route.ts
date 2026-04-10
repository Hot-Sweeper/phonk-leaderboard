import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import { fetchPlatformStats } from "@/lib/platforms";

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

  // Fetch stats from YouTube + Spotify APIs in parallel
  const linkEntries: {
    platform: Platform;
    url: string;
    handle: string | null;
    followerCount: number;
    platformId: string | null;
  }[] = [];

  let artistImageUrl = imageUrl?.trim() || null;

  await Promise.all(
    links.map(
      async (l: { platform: string; url: string; handle?: string }) => {
        const stats = await fetchPlatformStats(l.platform, l.url);
        const entry = {
          platform: l.platform as Platform,
          url: l.url.trim(),
          handle: stats?.handle ?? l.handle?.trim() ?? null,
          followerCount: stats?.followerCount ?? 0,
          platformId: stats?.platformId ?? null,
        };
        linkEntries.push(entry);

        // Use YouTube profile pic as artist image if none provided
        if (!artistImageUrl && stats?.imageUrl && l.platform === "YOUTUBE") {
          artistImageUrl = stats.imageUrl;
        }
        // Fallback to Spotify image
        if (!artistImageUrl && stats?.imageUrl && l.platform === "SPOTIFY") {
          artistImageUrl = stats.imageUrl;
        }
      }
    )
  );

  const artist = await prisma.artist.create({
    data: {
      name: name.trim(),
      imageUrl: artistImageUrl,
      bio: bio?.trim() || null,
      addedById: session.user.id,
      links: {
        create: linkEntries,
      },
    },
    include: { links: true },
  });

  return NextResponse.json(artist, { status: 201 });
}
