import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extractTrackVersions, getDisplayTrackTitle } from "@/lib/track-dedupe";

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * GET /api/songs/[id]
 * Returns full track data for the song detail panel.
 * Uses stored track metadata as the source of truth.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const track = await prisma.track.findUnique({
    where: { id },
    include: {
      artist: { select: { id: true, name: true, imageUrl: true } },
    },
  });

  if (!track) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Resolve contributorIds to actual artist objects
  const contributors = track.contributorIds.length > 0
    ? await prisma.artist.findMany({
        where: { id: { in: track.contributorIds } },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const contributorMap = new Map(contributors.map(c => [c.id, c]));

  // Collect all credited names from stored featured artists only.
  const allCreditedNames = [...track.featuredArtists];
  const uniqueNames = [...new Set(allCreditedNames.map(n => normalizeName(n)))]
    .map(norm => allCreditedNames.find(n => normalizeName(n) === norm)!)
    .filter(Boolean);

  // Resolve credited names against the DB.
  const matchedArtists = uniqueNames.length > 0
    ? await prisma.artist.findMany({
        where: {
          OR: uniqueNames.map(name => ({
            name: { equals: name, mode: "insensitive" as const },
          })),
        },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];

  const matchByName = new Map(matchedArtists.map(a => [normalizeName(a.name), a]));

  // Build allArtists: primary artist first, then all resolved credits
  type ArtistInfo = { id: string; name: string; imageUrl: string | null };
  const allArtists: ArtistInfo[] = [];
  const seenNames = new Set<string>();

  // Ensure primary artist is always first
  const primaryNorm = normalizeName(track.artist.name);
  if (!seenNames.has(primaryNorm)) {
    allArtists.unshift(track.artist);
    seenNames.add(primaryNorm);
  } else {
    // Move primary to front if already present
    const idx = allArtists.findIndex(a => a.id === track.artist.id);
    if (idx > 0) {
      const [primary] = allArtists.splice(idx, 1);
      allArtists.unshift(primary);
    }
  }

  // Add resolved contributorIds
  for (const cid of track.contributorIds) {
    const c = contributorMap.get(cid);
    if (c) {
      const norm = normalizeName(c.name);
      if (!seenNames.has(norm)) { allArtists.push(c); seenNames.add(norm); }
    }
  }

  // Add resolved featured artist names
  for (const name of track.featuredArtists) {
    const norm = normalizeName(name);
    if (seenNames.has(norm)) continue;
    const resolved = matchByName.get(norm);
    if (resolved) {
      allArtists.push({ id: resolved.id, name: resolved.name, imageUrl: resolved.imageUrl });
      seenNames.add(norm);
    }
  }

  // Remaining unresolved featured names
  const unresolvedFeatured: string[] = [];
  for (const name of track.featuredArtists) {
    const norm = normalizeName(name);
    if (seenNames.has(norm)) continue;
    unresolvedFeatured.push(name);
    seenNames.add(norm);
  }

  const displayTitle = getDisplayTrackTitle(track.name);
  const versions = extractTrackVersions(track.name);

  return NextResponse.json({
    id: track.id,
    name: displayTitle,
    albumName: track.albumName,
    albumImageUrl: track.albumImageUrl,
    previewUrl: track.previewUrl,
    spotifyUrl: track.spotifyId
      ? `https://open.spotify.com/track/${track.spotifyId}`
      : null,
    durationMs: track.durationMs,
    popularity: track.popularity,
    explicit: track.explicit,
    releaseDate: track.releaseDate,
    featuredArtists: unresolvedFeatured,
    artist: allArtists[0] ?? track.artist,
    allArtists,
    versions,
    primaryVersion: versions[0] ?? null,
  });
}
