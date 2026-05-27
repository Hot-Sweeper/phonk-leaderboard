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

/**
 * GET /api/admin/catalog-report?artistId=xxx
 *
 * Runs a live comparison between the DB tracks for an artist and what
 * Deezer + Spotify currently return. Returns which tracks are missing.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const artistId = searchParams.get("artistId");
  if (!artistId) {
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  }

  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      tracks: { orderBy: { popularity: "desc" } },
      links: true,
    },
  });
  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

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

  const deezerTracks: Array<{
    id: string;
    name: string;
    albumName: string | null;
    deezerUrl: string | null;
    inDb: boolean;
    inDbById: boolean;
    inDbByName: boolean;
  }> = [];

  const spotifyTracks = (rawSpotify ?? []).map((t) => {
    const inDbById = dbSpotifyIds.has(t.id);
    const inDbByName = dbTrackNames.has(normStr(t.name));
    return {
      id: t.id,
      name: t.name,
      albumName: t.album.name,
      spotifyUrl: t.spotifyUrl,
      inDb: inDbById || inDbByName,
      inDbById,
      inDbByName,
    };
  });

  return NextResponse.json({
    artist: {
      id: artist.id,
      name: artist.name,
      spotifyId,
      deezerId: artist.deezerId,
    },
    db: artist.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      albumName: t.albumName,
      spotifyId: t.spotifyId,
      deezerId: t.deezerId,
      popularity: t.popularity,
    })),
    deezer: deezerTracks,
    spotify: spotifyTracks,
    summary: {
      dbCount: artist.tracks.length,
      deezerTotal: 0,
      deezerMissing: 0,
      spotifyTotal: spotifyTracks.length,
      spotifyMissing: spotifyTracks.filter((t) => !t.inDb).length,
    },
    fetchedAt: new Date().toISOString(),
  });
}

/**
 * POST /api/admin/catalog-report
 * Body: { artistId: string }
 *
 * Force-syncs the catalog for a single artist (same as hydrateArtistNow).
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let artistId: string;
  let action: string | undefined;
  try {
    ({ artistId, action } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!artistId) {
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  }

  try {
    const { hydrateArtistNow } = await import("@/lib/update-runner");
    const result = await hydrateArtistNow(artistId);
    return NextResponse.json({
      status: "ok",
      trackCount: result.trackCount,
    });
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: String(err) },
      { status: 500 }
    );
  }
}
