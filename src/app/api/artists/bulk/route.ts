import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Platform } from "@prisma/client";
import { fetchPlatformStats } from "@/lib/platforms";

type BulkArtistInput = {
  name: string;
  imageUrl?: string | null;
  links: {
    platform: string;
    url: string;
    handle?: string | null;
    followerCount?: number;
    platformId?: string | null;
  }[];
};

// POST — bulk create artists (admin/mod only)
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

  const { artists } = (await req.json()) as { artists: BulkArtistInput[] };
  if (!Array.isArray(artists) || artists.length === 0) {
    return NextResponse.json(
      { error: "No artists provided" },
      { status: 400 }
    );
  }

  if (artists.length > 50) {
    return NextResponse.json(
      { error: "Maximum 50 artists at a time" },
      { status: 400 }
    );
  }

  const created = [];
  const errors = [];

  for (const input of artists) {
    if (!input.name?.trim()) {
      errors.push({ name: input.name, error: "Name required" });
      continue;
    }
    if (!input.links?.length) {
      errors.push({ name: input.name, error: "At least one link required" });
      continue;
    }

    try {
      const linkEntries: {
        platform: Platform;
        url: string;
        handle: string | null;
        followerCount: number;
        platformId: string | null;
      }[] = [];

      let artistImageUrl = input.imageUrl || null;

      await Promise.all(
        input.links.map(async (link) => {
          const stats = await fetchPlatformStats(link.platform, link.url);
          linkEntries.push({
            platform: link.platform as Platform,
            url: link.url.trim(),
            handle: stats?.handle ?? link.handle ?? null,
            followerCount: stats?.followerCount ?? link.followerCount ?? 0,
            platformId: stats?.platformId ?? link.platformId ?? null,
          });

          if (!artistImageUrl && stats?.imageUrl && link.platform === "YOUTUBE") {
            artistImageUrl = stats.imageUrl;
          }
          if (!artistImageUrl && stats?.imageUrl && link.platform === "SPOTIFY") {
            artistImageUrl = stats.imageUrl;
          }
        })
      );

      const artist = await prisma.artist.create({
        data: {
          name: input.name.trim(),
          imageUrl: artistImageUrl,
          addedById: session.user.id,
          links: {
            create: linkEntries,
          },
        },
        include: { links: true },
      });
      created.push(artist);
    } catch (e) {
      errors.push({
        name: input.name,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ created: created.length, errors }, { status: 201 });
}
