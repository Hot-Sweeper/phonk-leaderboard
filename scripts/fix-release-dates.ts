/**
 * Repair script: compare every stored Spotify-backed track against Spotify's
 * /tracks API and update any releaseDate rows that differ.
 *
 * This is intentionally lighter than a full catalog rebuild so it can finish
 * in a single maintenance run without waiting on the shared song-update lock.
 * The code-side dedupe fixes ensure future catalog refreshes stop preferring
 * newer reissues when versions compete.
 *
 * Run: npx tsx scripts/fix-release-dates.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { batchFetchSpotifyTrackDates } from "../src/lib/platforms";

const BATCH_SIZE = 200;

async function main() {
  console.log("Finding Spotify-backed tracks for release-date repair...");

  const tracks = await prisma.track.findMany({
    where: { spotifyId: { not: null } },
    select: {
      id: true,
      spotifyId: true,
      releaseDate: true,
    },
    orderBy: { id: "asc" },
  });

  console.log(`Found ${tracks.length} tracks to compare.\n`);
  if (tracks.length === 0) {
    console.log("Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  let fixed = 0;
  let skipped = 0;

  for (let index = 0; index < tracks.length; index += BATCH_SIZE) {
    const batch = tracks.slice(index, index + BATCH_SIZE);
    const spotifyIds = batch.map((track) => track.spotifyId).filter((value): value is string => !!value);
    process.stdout.write(`  [${Math.floor(index / BATCH_SIZE) + 1}/${Math.ceil(tracks.length / BATCH_SIZE)}] ${spotifyIds.length} tracks...`);

    try {
      const fetchedDates = await batchFetchSpotifyTrackDates(spotifyIds);
      const fetchedById = new Map(fetchedDates.map((item) => [item.id, item.releaseDate]));

      for (const track of batch) {
        const spotifyId = track.spotifyId;
        if (!spotifyId) {
          skipped += 1;
          continue;
        }

        const nextReleaseDate = fetchedById.get(spotifyId) ?? null;
        if (!nextReleaseDate || nextReleaseDate === track.releaseDate) {
          skipped += 1;
          continue;
        }

        await prisma.track.update({
          where: { id: track.id },
          data: { releaseDate: nextReleaseDate },
        });
        fixed += 1;
      }

      console.log(` ok (fixed=${fixed}, skipped=${skipped})`);
    } catch (error) {
      console.log(` failed (${String(error)})`);
    }
  }

  console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}, Total tracks: ${tracks.length}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  prisma.$disconnect().finally(() => process.exit(1));
});
