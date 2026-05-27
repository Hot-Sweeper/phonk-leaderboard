import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { batchFetchSpotifyTrackDates } from "../src/lib/platforms";

// Extract Spotify track ID from a spotifyUrl
function extractSpotifyId(url: string): string | null {
  const m = url.match(/\/track\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Find all tracks where spotifyId is null but spotifyUrl contains a track ID
  const tracks = await prisma.track.findMany({
    where: {
      spotifyId: null,
      spotifyUrl: { contains: "/track/" },
    },
    select: { id: true, name: true, releaseDate: true, spotifyUrl: true },
  });

  console.log(`Found ${tracks.length} tracks with null spotifyId but valid spotifyUrl`);

  // Build map: spotifyTrackId -> list of DB record IDs
  const idToRecords = new Map<string, { id: string; name: string; releaseDate: string | null }[]>();
  for (const t of tracks) {
    const sid = extractSpotifyId(t.spotifyUrl!);
    if (!sid) continue;
    if (!idToRecords.has(sid)) idToRecords.set(sid, []);
    idToRecords.get(sid)!.push({ id: t.id, name: t.name, releaseDate: t.releaseDate });
  }

  const allSpotifyIds = [...idToRecords.keys()];
  console.log(`Unique Spotify track IDs to fetch: ${allSpotifyIds.length}`);

  // Fetch dates in batches
  const BATCH = 200;
  let fixed = 0, skipped = 0, errors = 0;

  for (let i = 0; i < allSpotifyIds.length; i += BATCH) {
    const batch = allSpotifyIds.slice(i, i + BATCH);
    let dateMap: Record<string, string>;
    try {
      dateMap = await batchFetchSpotifyTrackDates(batch);
    } catch (e) {
      console.error(`Batch ${i}-${i + BATCH} failed:`, e);
      errors += batch.length;
      continue;
    }

    for (const sid of batch) {
      const spotifyDate = dateMap[sid];
      const records = idToRecords.get(sid)!;
      const currentDate = records[0].releaseDate;

      if (!spotifyDate) {
        skipped++;
        continue;
      }

      if (spotifyDate === currentDate) {
        skipped++;
        continue;
      }

      console.log(`  "${records[0].name}": ${currentDate} → ${spotifyDate} (${records.length} row(s))`);

      if (!dryRun) {
        await prisma.track.updateMany({
          where: { spotifyUrl: { contains: sid } },
          data: { releaseDate: spotifyDate },
        });
      }

      fixed++;
    }
  }

  console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}, Errors: ${errors}`);
  await prisma.$disconnect();
}

main().catch(console.error);
