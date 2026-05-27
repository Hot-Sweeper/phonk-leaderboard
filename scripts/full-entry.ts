/**
 * scripts/full-entry.ts
 * Dumps one complete artist record from the DB — all fields, links, and top tracks.
 *
 * Usage:
 *   npx tsx scripts/full-entry.ts                    # first artist alphabetically
 *   npx tsx scripts/full-entry.ts "Night Lovell"     # by name (partial match)
 *   npx tsx scripts/full-entry.ts --tracks 20        # show more tracks (default 10)
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);
  const nameArg = args.find((a) => !a.startsWith("--"));
  const tracksArg = args.find((a) => a.startsWith("--tracks="))?.split("=")[1]
    ?? (args.indexOf("--tracks") !== -1 ? args[args.indexOf("--tracks") + 1] : null);
  const trackLimit = tracksArg ? parseInt(tracksArg, 10) : 10;

  const artist = await prisma.artist.findFirst({
    where: nameArg
      ? { name: { contains: nameArg, mode: "insensitive" } }
      : undefined,
    orderBy: { name: "asc" },
    include: {
      links: {
        orderBy: { platform: "asc" },
      },
      tracks: {
        orderBy: [{ popularity: "desc" }, { spotifyPopularity: "desc" }],
        take: trackLimit,
      },
      _count: {
        select: { tracks: true },
      },
    },
  });

  if (!artist) {
    console.error("No artist found" + (nameArg ? ` matching "${nameArg}"` : ""));
    process.exit(1);
  }

  // --- Artist record ---
  console.log("\n========== ARTIST ==========");
  console.log({
    id: artist.id,
    name: artist.name,
    spotifyId: artist.spotifyId,
    deezerId: artist.deezerId,
    imageUrl: artist.imageUrl,
    genres: artist.genres,
    totalTracks: artist._count.tracks,
    createdAt: artist.createdAt,
    updatedAt: artist.updatedAt,
  });

  // --- Links ---
  console.log("\n========== PLATFORM LINKS ==========");
  for (const link of artist.links) {
    console.log({
      platform: link.platform,
      url: link.url,
      handle: link.handle,
      platformId: link.platformId,
      followerCount: link.followerCount,
      monthlyListeners: link.monthlyListeners,
      updatedAt: link.updatedAt,
    });
  }

  // --- Latest snapshot ---
  const snapshot = await prisma.artistSnapshot.findFirst({
    where: { artistId: artist.id },
    orderBy: { createdAt: "desc" },
  });
  if (snapshot) {
    console.log("\n========== LATEST SNAPSHOT ==========");
    console.log(snapshot);
  }

  // --- Top tracks ---
  console.log(`\n========== TOP ${trackLimit} TRACKS (of ${artist._count.tracks} total) ==========`);
  for (const track of artist.tracks) {
    console.log({
      id: track.id,
      name: track.name,
      albumName: track.albumName,
      releaseDate: track.releaseDate,
      spotifyId: track.spotifyId,
      spotifyUrl: track.spotifyUrl,
      spotifyPopularity: track.spotifyPopularity,
      popularity: track.popularity,
      previewUrl: track.previewUrl ? "[set]" : null,
      durationMs: track.durationMs,
      explicit: track.explicit,
      featuredArtists: track.featuredArtists,
      youtubeVideoId: track.youtubeVideoId,
      youtubeViews: track.youtubeViews,
      trackNumber: track.trackNumber,
      discNumber: track.discNumber,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt,
    });
  }

  // --- Summary ---
  const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
  console.log("\n========== SUMMARY ==========");
  console.log(`Artist:            ${artist.name}`);
  console.log(`Spotify listeners: ${spotifyLink?.monthlyListeners?.toLocaleString() ?? "N/A"}`);
  console.log(`Spotify followers: ${spotifyLink?.followerCount?.toLocaleString() ?? "N/A"}`);
  console.log(`Total tracks in DB: ${artist._count.tracks}`);
  console.log(`Genres:            ${artist.genres?.join(", ") ?? "none"}`);
  console.log(`Last snapshot:     ${snapshot?.createdAt?.toISOString() ?? "none"}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
