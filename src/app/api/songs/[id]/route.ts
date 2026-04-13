import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchDeezerTrackDetail } from "@/lib/platforms";
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
 * Uses the same Deezer-enriched artist resolution as the leaderboard.
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

  // Fetch Deezer detail for enriched credits (same as leaderboard)
  const numericDeezerId = track.deezerId ? Number(track.deezerId) : null;
  const deezerDetail = numericDeezerId
    ? await fetchDeezerTrackDetail(numericDeezerId)
    : null;

  // Resolve contributorIds to actual artist objects
  const contributors = track.contributorIds.length > 0
    ? await prisma.artist.findMany({
        where: { id: { in: track.contributorIds } },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const contributorMap = new Map(contributors.map(c => [c.id, c]));

  // Collect all credited names from featured + Deezer
  const allCreditedNames = [
    ...track.featuredArtists,
    ...(deezerDetail?.artists.map(a => a.name) ?? []),
  ];
  const uniqueNames = [...new Set(allCreditedNames.map(n => normalizeName(n)))]
    .map(norm => allCreditedNames.find(n => normalizeName(n) === norm)!)
    .filter(Boolean);

  const deezerArtistIds = deezerDetail?.artists.map(a => a.deezerId) ?? [];

  // Resolve credited names + Deezer IDs against the DB (same as leaderboard)
  const matchedArtists = (uniqueNames.length > 0 || deezerArtistIds.length > 0)
    ? await prisma.artist.findMany({
        where: {
          OR: [
            ...uniqueNames.map(name => ({
              name: { equals: name, mode: "insensitive" as const },
            })),
            ...(deezerArtistIds.length > 0 ? [{ deezerId: { in: deezerArtistIds } }] : []),
          ],
        },
        select: { id: true, name: true, imageUrl: true, deezerId: true },
      })
    : [];

  const matchByName = new Map(matchedArtists.map(a => [normalizeName(a.name), a]));
  const matchByDeezerId = new Map(
    matchedArtists
      .filter(a => typeof a.deezerId === "number")
      .map(a => [a.deezerId as number, a])
  );

  // Build allArtists: primary artist first, then all resolved credits
  type ArtistInfo = { id: string; name: string; imageUrl: string | null };
  const allArtists: ArtistInfo[] = [];
  const seenNames = new Set<string>();

  // If Deezer has credits, use those as the authoritative order
  if (deezerDetail && deezerDetail.artists.length > 0) {
    for (const credit of deezerDetail.artists) {
      const norm = normalizeName(credit.name);
      if (seenNames.has(norm)) continue;
      seenNames.add(norm);

      const resolved = matchByDeezerId.get(credit.deezerId) ?? matchByName.get(norm);
      if (resolved) {
        allArtists.push({ id: resolved.id, name: resolved.name, imageUrl: resolved.imageUrl });
      }
    }
  }

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
  for (const name of [...track.featuredArtists, ...(deezerDetail?.artists.map(a => a.name) ?? [])]) {
    const norm = normalizeName(name);
    if (seenNames.has(norm)) continue;
    unresolvedFeatured.push(name);
    seenNames.add(norm);
  }

  // Enrich display title + versions from Deezer
  const displayTitle = getDisplayTrackTitle(deezerDetail?.fullTitle ?? track.name);
  const versions = deezerDetail?.fullTitle
    ? extractTrackVersions(deezerDetail.fullTitle)
    : extractTrackVersions(track.name);

  return NextResponse.json({
    id: track.id,
    name: displayTitle,
    albumName: deezerDetail?.album.name ?? track.albumName,
    albumImageUrl: deezerDetail?.album.imageUrl ?? track.albumImageUrl,
    previewUrl: track.previewUrl,
    spotifyUrl: track.spotifyId
      ? `https://open.spotify.com/track/${track.spotifyId}`
      : null,
    durationMs: track.durationMs,
    popularity: track.popularity,
    explicit: track.explicit,
    releaseDate: deezerDetail?.releaseDate ?? track.releaseDate,
    featuredArtists: unresolvedFeatured,
    artist: allArtists[0] ?? track.artist,
    allArtists,
    versions,
    primaryVersion: versions[0] ?? null,
  });
}
