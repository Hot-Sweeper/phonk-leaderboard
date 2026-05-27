import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchSpotifyFullCatalog,
  parseSpotifyUrl,
} from "@/lib/platforms";

function normStr(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function syncArtistCatalog(artistId: string): Promise<{ artistId: string; name: string; added: number; errors: string[] }> {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      tracks: { orderBy: { popularity: "desc" } },
      links: true,
    },
  });
  if (!artist) return { artistId, name: "(not found)", added: 0, errors: ["Artist not found"] };

  const dbSpotifyIds = new Set(
    artist.tracks.map((t) => t.spotifyId).filter(Boolean) as string[]
  );
  const dbTrackNames = new Set(artist.tracks.map((t) => normStr(t.name)));

  const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
  const spotifyId =
    artist.spotifyId ??
    spotifyLink?.platformId ??
    (spotifyLink?.url ? parseSpotifyUrl(spotifyLink.url) : null);

  const rawSpotify = spotifyId
    ? await fetchSpotifyFullCatalog(spotifyId)
    : null;

  const errors: string[] = [];
  let added = 0;

  if (rawSpotify) {
    for (const track of rawSpotify) {
      if (dbSpotifyIds.has(track.id)) continue;
      if (dbTrackNames.has(normStr(track.name))) continue;
      try {
        await prisma.song.create({
          data: {
            name: track.name,
            spotifyId: track.id,
            artistId: artist.id,
            releaseDate: track.releaseDate ? new Date(track.releaseDate) : null,
            spotifyPopularity: track.popularity,
            durationMs: track.durationMs ?? null,
            isrc: track.isrc ?? null,
          },
        });
        added++;
        dbSpotifyIds.add(track.id);
        dbTrackNames.add(normStr(track.name));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`Failed to add "${track.name}": ${msg}`);
      }
    }
  }

  return { artistId, name: artist.name, added, errors };
}

/**
 * GET /api/admin/catalog-report/batch?secret=xxx
 *
 * Triggers a full catalog sync for ALL artists. Only accessible by ADMIN.
 * Returns a summary of what was added per artist.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  const artists = await prisma.artist.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const results: Array<{ artistId: string; name: string; added: number; errors: string[] }> = [];
  const errors: string[] = [];

  for (const artist of artists) {
    try {
      const result = await syncArtistCatalog(artist.id);
      results.push(result);
      if (result.errors.length > 0) {
        errors.push(...result.errors.map(e => `[${artist.name}] ${e}`));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`[${artist.name}] Unexpected error: ${msg}`);
    }
  }

  const totalAdded = results.reduce((sum, r) => sum + r.added, 0);

  return NextResponse.json({
    totalArtists: artists.length,
    totalAdded,
    errors: errors.length > 0 ? errors : undefined,
    results,
  });
}