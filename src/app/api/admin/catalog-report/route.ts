import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  fetchDeezerTrackDetail,
  fetchDeezerFullCatalog,
  fetchSpotifyFullCatalog,
  parseSpotifyUrl,
} from "@/lib/platforms";
import { recordTrackSnapshots } from "@/lib/snapshots";
import { dedupeNames } from "@/lib/track-dedupe";
import { deduplicateStoredTracksForArtist } from "@/lib/update-runner";

function normStr(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDeezerResourceUrl(url: string) {
  const match = url.match(/deezer\.com\/(?:[a-z]{2}\/)?(track|album)\/(\d+)/i);
  if (!match) return null;
  return {
    kind: match[1] as "track" | "album",
    id: Number(match[2]),
  };
}

async function fetchDeezerAlbumTrackIds(albumId: number) {
  const trackIds: number[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(`https://api.deezer.com/album/${albumId}/tracks?limit=${limit}&index=${offset}`);
    if (!res.ok) break;

    const data = await res.json();
    const items = Array.isArray(data.data) ? data.data : [];
    if (items.length === 0) break;

    for (const item of items) {
      if (typeof item?.id === "number") {
        trackIds.push(item.id);
      }
    }

    if (items.length < limit) break;
    offset += limit;
  }

  return [...new Set(trackIds)];
}

async function importDeezerTracksForArtist(artistId: string, deezerTrackIds: number[]) {
  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    select: { id: true, name: true, deezerId: true },
  });

  if (!artist) {
    throw new Error("Artist not found");
  }

  const artists = await prisma.artist.findMany({
    select: { id: true, deezerId: true },
  });
  const deezerIdToArtistId = new Map<number, string>();
  for (const item of artists) {
    if (item.deezerId) {
      deezerIdToArtistId.set(item.deezerId, item.id);
    }
  }

  const touchedTrackIds: string[] = [];
  const importedTracks: Array<{ id: string; name: string; albumName: string | null }> = [];
  const skipped: string[] = [];

  for (const deezerTrackId of [...new Set(deezerTrackIds)]) {
    const track = await fetchDeezerTrackDetail(deezerTrackId);
    if (!track) {
      skipped.push(`Track ${deezerTrackId}: unable to fetch Deezer details`);
      continue;
    }

    const ownerCredits = track.artists.filter((artistEntry) => {
      if (artist.deezerId && artistEntry.deezerId === artist.deezerId) {
        return true;
      }
      return normStr(artistEntry.name) === normStr(artist.name);
    });

    if (ownerCredits.length === 0) {
      skipped.push(`${track.fullTitle}: selected artist is not credited on Deezer`);
      continue;
    }

    const ownerCreditIds = new Set(ownerCredits.map((entry) => entry.deezerId));
    const featured = dedupeNames(
      track.artists
        .filter((artistEntry) => !ownerCreditIds.has(artistEntry.deezerId))
        .map((artistEntry) => artistEntry.name)
    );
    const contributorIds = [
      ...new Set(
        track.artists
          .filter((artistEntry) => !ownerCreditIds.has(artistEntry.deezerId))
          .map((artistEntry) => deezerIdToArtistId.get(artistEntry.deezerId))
          .filter((id): id is string => !!id)
      ),
    ];

    const savedTrack = await prisma.track.upsert({
      where: { deezerId: String(track.deezerId) },
      update: {
        name: track.name,
        albumName: track.album.name,
        albumImageUrl: track.album.imageUrl,
        previewUrl: track.previewUrl,
        durationMs: track.durationMs,
        popularity: track.popularity,
        trackNumber: track.trackNumber,
        explicit: track.explicit,
        releaseDate: track.releaseDate ?? track.album.releaseDate,
        deezerUrl: track.deezerUrl,
        bpm: track.bpm,
        gain: track.gain,
        featuredArtists: featured,
        contributorIds,
      },
      create: {
        deezerId: String(track.deezerId),
        artistId: artist.id,
        name: track.name,
        albumName: track.album.name,
        albumImageUrl: track.album.imageUrl,
        previewUrl: track.previewUrl,
        durationMs: track.durationMs,
        popularity: track.popularity,
        trackNumber: track.trackNumber,
        explicit: track.explicit,
        releaseDate: track.releaseDate ?? track.album.releaseDate,
        deezerUrl: track.deezerUrl,
        bpm: track.bpm,
        gain: track.gain,
        featuredArtists: featured,
        contributorIds,
      },
      select: {
        id: true,
        name: true,
        albumName: true,
      },
    });

    touchedTrackIds.push(savedTrack.id);
    importedTracks.push(savedTrack);
  }

  if (touchedTrackIds.length > 0) {
    await deduplicateStoredTracksForArtist(artist.id);
    await recordTrackSnapshots([...new Set(touchedTrackIds)]);
  }

  return {
    importedCount: importedTracks.length,
    importedTracks,
    skipped,
  };
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

  const dbDeezerIds = new Set(
    artist.tracks.map((t) => t.deezerId).filter(Boolean) as string[]
  );
  const dbSpotifyIds = new Set(
    artist.tracks.map((t) => t.spotifyId).filter(Boolean) as string[]
  );
  const dbTrackNames = new Set(artist.tracks.map((t) => normStr(t.name)));

  const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
  const spotifyId =
    artist.spotifyId ??
    spotifyLink?.platformId ??
    (spotifyLink?.url ? parseSpotifyUrl(spotifyLink.url) : null);

  // Fetch both catalogs in parallel
  const [rawDeezer, rawSpotify] = await Promise.all([
    artist.deezerId
      ? fetchDeezerFullCatalog(artist.deezerId)
      : Promise.resolve(null),
    spotifyId
      ? fetchSpotifyFullCatalog(spotifyId)
      : Promise.resolve(null),
  ]);

  const deezerTracks = (rawDeezer ?? []).map((t) => {
    const id = String(t.deezerId);
    const inDbById = dbDeezerIds.has(id);
    const inDbByName = dbTrackNames.has(normStr(t.name));
    return {
      id,
      name: t.name,
      albumName: t.album.name,
      deezerUrl: t.deezerUrl ?? null,
      inDb: inDbById || inDbByName,
      inDbById,
      inDbByName,
    };
  });

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
      deezerTotal: deezerTracks.length,
      deezerMissing: deezerTracks.filter((t) => !t.inDb).length,
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
  let url: string | undefined;
  try {
    ({ artistId, action, url } = await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!artistId) {
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  }

  if (action === "importDeezerUrl") {
    if (!url) {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }

    const resource = parseDeezerResourceUrl(url);
    if (!resource) {
      return NextResponse.json({ error: "Paste a valid Deezer album or track URL" }, { status: 400 });
    }

    try {
      const deezerTrackIds = resource.kind === "track"
        ? [resource.id]
        : await fetchDeezerAlbumTrackIds(resource.id);

      if (deezerTrackIds.length === 0) {
        return NextResponse.json({ error: "No tracks found for that Deezer URL" }, { status: 404 });
      }

      const result = await importDeezerTracksForArtist(artistId, deezerTrackIds);
      return NextResponse.json({
        status: "ok",
        importedCount: result.importedCount,
        importedTracks: result.importedTracks,
        skipped: result.skipped,
      });
    } catch (err) {
      return NextResponse.json(
        { status: "error", error: String(err) },
        { status: 500 }
      );
    }
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
