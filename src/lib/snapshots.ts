import { prisma } from "@/lib/prisma";

/**
 * Record a snapshot of an artist's current Spotify stats.
 * Called after every stat refresh so we can track growth over time.
 */
export async function recordSnapshot(artistId: string) {
  const spotifyLink = await prisma.artistLink.findFirst({
    where: { artistId, platform: "SPOTIFY" },
  });
  if (!spotifyLink) return;

  await prisma.artistSnapshot.create({
    data: {
      artistId,
      monthlyListeners: spotifyLink.monthlyListeners,
      followerCount: spotifyLink.followerCount,
    },
  });
}
