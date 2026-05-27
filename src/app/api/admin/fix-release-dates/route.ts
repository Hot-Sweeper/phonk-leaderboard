import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { batchFetchSpotifyTrackDates } from "@/lib/platforms";

/**
 * POST /api/admin/fix-release-dates
 *
 * Finds tracks with missing or imprecise release dates (NULL, year-only "2024",
 * or month-only "2024-03"), fetches the correct date from Spotify, and updates
 * the DB. Returns a summary of what was fixed.
 *
 * Safe to run multiple times — only touches tracks that still need fixing.
 */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find all tracks with a spotifyId where the release date is either NULL
  // or doesn't match full YYYY-MM-DD precision (year-only or month-only from Spotify).
  const tracks = await prisma.$queryRaw<Array<{ id: string; spotifyId: string; releaseDate: string | null }>>`
    SELECT id, "spotifyId", "releaseDate"
    FROM "Track"
    WHERE "spotifyId" IS NOT NULL
      AND ("releaseDate" IS NULL OR "releaseDate" !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  `;

  if (tracks.length === 0) {
    return NextResponse.json({ fixed: 0, skipped: 0, message: "All release dates already look good." });
  }

  const spotifyIds = tracks.map((t) => t.spotifyId as string);
  const fetched = await batchFetchSpotifyTrackDates(spotifyIds);
  const fetchedMap = new Map(fetched.map((r) => [r.id, r.releaseDate]));

  let fixed = 0;
  let skipped = 0;

  // Update in parallel batches of 20
  const BATCH = 20;
  for (let i = 0; i < tracks.length; i += BATCH) {
    const batch = tracks.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (track) => {
        const newDate = fetchedMap.get(track.spotifyId as string);
        if (!newDate || newDate === track.releaseDate) {
          skipped++;
          return;
        }
        await prisma.track.update({
          where: { id: track.id },
          data: { releaseDate: newDate },
        });
        fixed++;
      })
    );
  }

  return NextResponse.json({
    fixed,
    skipped,
    total: tracks.length,
    message: `Updated ${fixed} tracks. ${skipped} unchanged or not found on Spotify.`,
  });
}
