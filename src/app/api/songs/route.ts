import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/songs?skip=0&take=50&search=...
 * Returns all tracks ranked by Spotify popularity, with artist info.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "50", 10) || 50, 100);
  const search = searchParams.get("search")?.trim() || "";

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { artist: { name: { contains: search, mode: "insensitive" as const } } },
          { albumName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [tracks, totalCount] = await Promise.all([
    prisma.track.findMany({
      where,
      orderBy: { popularity: "desc" },
      skip,
      take,
      include: {
        artist: {
          select: { id: true, name: true, imageUrl: true },
        },
      },
    }),
    prisma.track.count({ where }),
  ]);

  return NextResponse.json({ tracks, totalCount });
}
