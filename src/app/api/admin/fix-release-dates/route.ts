import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { batchFetchSpotifyTrackDates } from "@/lib/platforms";

/**
 * POST /api/admin/fix-release-dates
 *
 * Fetches the current release date for every Spotify-backed track and updates
 * any rows that differ from Spotify's /tracks response. Returns a summary of
 * what changed.
 *
 * Safe to run multiple times — unchanged rows are skipped.
 */
export async function POST() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Compare every Spotify-backed track against Spotify's current /tracks data.
  const tracks = await prisma.$queryRaw<Array<{ id: string; spotifyId: string; releaseDate: string | null }>>`
    SELECT id, "spotifyId", "releaseDate"
    FROM "Track"
    WHERE "spotifyId" IS NOT NULL
  `;

  if (tracks.length === 0) {
    return NextResponse.json({ fixed: 0, skipped: 0, message: "No Spotify-backed tracks found." });
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
