import { prisma } from "@/lib/prisma";

/**
 * Record a snapshot of an artist's current stats across all platforms.
 * Called after every stat refresh so we can track growth over time.
 */
export async function recordSnapshot(artistId: string) {
  const links = await prisma.artistLink.findMany({
    where: { artistId },
  });
  if (links.length === 0) return;

  const spotify = links.find((l) => l.platform === "SPOTIFY");
  const youtube = links.find((l) => l.platform === "YOUTUBE");
  const tiktok = links.find((l) => l.platform === "TIKTOK");
  const instagram = links.find((l) => l.platform === "INSTAGRAM");

  await prisma.artistSnapshot.create({
    data: {
      artistId,
      monthlyListeners: spotify?.monthlyListeners ?? 0,
      followerCount: spotify?.followerCount ?? 0,
      youtubeSubscribers: youtube?.followerCount ?? 0,
      tiktokFollowers: tiktok?.followerCount ?? 0,
      instagramFollowers: instagram?.followerCount ?? 0,
    },
  });
}

/**
 * Record today's rank for all artists (sorted by Spotify monthly listeners).
 * Uses upsert to avoid duplicates if called multiple times per day.
 */
export async function recordRankSnapshots() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const artists = await prisma.artist.findMany({
    include: {
      links: {
        where: { platform: "SPOTIFY" },
        select: { monthlyListeners: true },
      },
    },
  });

  // Sort the same way the leaderboard does: Spotify monthly listeners desc
  artists.sort((a, b) => {
    const aListeners = a.links[0]?.monthlyListeners ?? 0;
    const bListeners = b.links[0]?.monthlyListeners ?? 0;
    if (bListeners !== aListeners) return bListeners - aListeners;
    return a.name.localeCompare(b.name);
  });

  // Record each artist's rank
  for (let i = 0; i < artists.length; i++) {
    await prisma.rankSnapshot.upsert({
      where: {
        artistId_date: { artistId: artists[i].id, date: today },
      },
      create: {
        artistId: artists[i].id,
        rank: i + 1,
        date: today,
      },
      update: {
        rank: i + 1,
      },
    });
  }
}
