import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const [tracks, artists, withSpotify, snapshots, samplePacks, dbSize] = await Promise.all([
    prisma.track.count(),
    prisma.artist.count(),
    prisma.artist.count({ where: { spotifyId: { not: null } } }),
    prisma.trackSnapshot.count(),
    prisma.samplePack?.count?.().catch(() => 0) ?? 0,
    prisma.$queryRaw<Array<{ size: string }>>`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
  ]);

  console.log(JSON.stringify({
    tracks,
    artists,
    artistsWithSpotify: withSpotify,
    snapshots,
    samplePacks,
    dbSize: dbSize[0]?.size,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
