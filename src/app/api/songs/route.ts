import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseFeedTracks, dedupeNames } from "@/lib/track-dedupe";

/**
 * GET /api/songs?skip=0&take=50&search=...
 * Returns all tracks ranked by popularity, with artist info + contributor matching.
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

  const allTracks = await prisma.track.findMany({
    where,
    orderBy: { popularity: "desc" },
    include: {
      artist: {
        select: { id: true, name: true, imageUrl: true },
      },
    },
  });

  const collapsedTracks = collapseFeedTracks(allTracks);
  const tracks = collapsedTracks.slice(skip, skip + take);
  const totalCount = collapsedTracks.length;

  // Resolve contributorIds to actual artist info
  const allContributorIds = [...new Set(tracks.flatMap(({ track }) => track.contributorIds))];
  const contributors = allContributorIds.length > 0
    ? await prisma.artist.findMany({
        where: { id: { in: allContributorIds } },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const contributorMap = new Map(contributors.map(c => [c.id, c]));

  const enrichedTracks = tracks.map(({ track, versions }) => ({
    ...track,
    versions,
    featuredArtists: dedupeNames(track.featuredArtists),
    contributors: track.contributorIds
      .map(id => contributorMap.get(id))
      .filter((c): c is { id: string; name: string; imageUrl: string | null } => !!c),
  }));

  return NextResponse.json({ tracks: enrichedTracks, totalCount });
}
