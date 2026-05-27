import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const name = process.argv[2] ?? "AURA";

  const tracks = await prisma.track.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      albumName: true,
      releaseDate: true,
      spotifyId: true,
      spotifyUrl: true,
      popularity: true,
      spotifyPopularity: true,
    },
    take: 20,
  });

  for (const t of tracks) {
    console.log(JSON.stringify(t));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
