import "dotenv/config";
import { prisma } from "../src/lib/prisma";

type RepairRow = {
  id: string;
  spotifyUrl: string | null;
  albumImageUrl: string | null;
  featuredArtists: string[];
  artist: {
    id: string;
    name: string;
  };
};

type CanonicalTrackMetadata = {
  name: string | null;
  albumImageUrl: string | null;
  artists: string[];
  source: "api" | "public";
};

const SPOTIFY_TRACK_BATCH_SIZE = 50;
const PUBLIC_FETCH_CONCURRENCY = 4;

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function dedupeNames(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = normalizeName(trimmed);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(trimmed);
  }

  return deduped;
}

function isSpotifyImage(url: string | null) {
  return typeof url === "string" && url.includes("i.scdn.co");
}

function hasTruncatedFeaturedArtist(featuredArtists: string[]) {
  return featuredArtists.some((artist) => artist.trim().length === 1);
}

function extractSpotifyTrackId(url: string | null) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/track\/([A-Za-z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function decodeSpotifyMeta(value: string | null) {
  if (!value) return null;

  return value
    .replace(/&#xB7;|&#183;|&middot;|&amp;#xB7;/gi, "\u00B7")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#x2F;/gi, "/")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpotifyPublicTrackMetadata(html: string): Omit<CanonicalTrackMetadata, "source"> | null {
  const name = decodeSpotifyMeta(html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1] ?? null);
  const description = decodeSpotifyMeta(html.match(/<meta property="og:description" content="([^"]+)"/i)?.[1] ?? null);
  const albumImageUrl = html.match(/<meta property="og:image" content="([^"]+)"/i)?.[1] ?? null;

  if (!name && !description && !albumImageUrl) {
    return null;
  }

  const artistBlock = description?.split(/\s*\u00B7\s*/u)[0] ?? "";
  const artists = dedupeNames(artistBlock.split(",").map((value) => value.trim()));

  return {
    name,
    albumImageUrl,
    artists,
  };
}

async function getSpotifyAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return null;
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as { access_token?: string };
  return data.access_token ?? null;
}

async function fetchSpotifyTrackBatchFromApi(trackIds: string[], accessToken: string) {
  const metadataByTrackId = new Map<string, CanonicalTrackMetadata>();
  let rateLimited = false;

  for (const group of chunk(trackIds, SPOTIFY_TRACK_BATCH_SIZE)) {
    const params = new URLSearchParams({ ids: group.join(","), market: "US" });
    const response = await fetch(`https://api.spotify.com/v1/tracks?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 429) {
      rateLimited = true;
      break;
    }

    if (!response.ok) {
      continue;
    }

    const data = await response.json() as {
      tracks?: Array<{
        id: string;
        name: string;
        album?: { images?: Array<{ url?: string | null }> };
        artists?: Array<{ name?: string | null }>;
      } | null>;
    };

    for (const track of data.tracks ?? []) {
      if (!track?.id) continue;
      metadataByTrackId.set(track.id, {
        name: track.name ?? null,
        albumImageUrl: track.album?.images?.[0]?.url ?? null,
        artists: dedupeNames((track.artists ?? []).map((artist) => artist?.name ?? "")),
        source: "api",
      });
    }
  }

  return { metadataByTrackId, rateLimited };
}

async function fetchSpotifyTrackFromPublicPage(trackId: string) {
  const response = await fetch(`https://open.spotify.com/track/${trackId}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();
  const metadata = parseSpotifyPublicTrackMetadata(html);
  if (!metadata) {
    return null;
  }

  return {
    ...metadata,
    source: "public" as const,
  };
}

async function fetchSpotifyTrackBatchFromPublicPages(trackIds: string[]) {
  const metadataByTrackId = new Map<string, CanonicalTrackMetadata>();

  for (const group of chunk(trackIds, PUBLIC_FETCH_CONCURRENCY)) {
    const results = await Promise.all(
      group.map(async (trackId) => {
        const metadata = await fetchSpotifyTrackFromPublicPage(trackId).catch(() => null);
        return { trackId, metadata };
      })
    );

    for (const result of results) {
      if (!result.metadata) continue;
      metadataByTrackId.set(result.trackId, result.metadata);
    }
  }

  return metadataByTrackId;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArgument = process.argv.find((value) => value.startsWith("--limit="));
  const groupLimit = limitArgument ? Number.parseInt(limitArgument.split("=")[1] ?? "", 10) : null;

  const artistRows = await prisma.artist.findMany({
    select: { id: true, name: true },
  });
  const artistIdsByNormalizedName = new Map<string, string[]>();
  for (const artist of artistRows) {
    const normalized = normalizeName(artist.name);
    if (!normalized) continue;
    const existing = artistIdsByNormalizedName.get(normalized) ?? [];
    existing.push(artist.id);
    artistIdsByNormalizedName.set(normalized, existing);
  }

  const rows = await prisma.track.findMany({
    where: { spotifyUrl: { not: null } },
    select: {
      id: true,
      spotifyUrl: true,
      albumImageUrl: true,
      featuredArtists: true,
      artist: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ popularity: "desc" }, { updatedAt: "desc" }],
  });

  const candidateRows = rows.filter((row) => !isSpotifyImage(row.albumImageUrl) || hasTruncatedFeaturedArtist(row.featuredArtists));
  const groupedRows = new Map<string, RepairRow[]>();

  for (const row of candidateRows) {
    const trackId = extractSpotifyTrackId(row.spotifyUrl);
    if (!trackId) continue;
    const bucket = groupedRows.get(trackId) ?? [];
    bucket.push(row);
    groupedRows.set(trackId, bucket);
  }

  const selectedGroups = [...groupedRows.entries()].slice(0, groupLimit ?? groupedRows.size);
  const selectedTrackIds = selectedGroups.map(([trackId]) => trackId);

  const accessToken = await getSpotifyAccessToken();
  const apiMetadata = accessToken
    ? await fetchSpotifyTrackBatchFromApi(selectedTrackIds, accessToken)
    : { metadataByTrackId: new Map<string, CanonicalTrackMetadata>(), rateLimited: false };

  const unresolvedTrackIds = selectedTrackIds.filter((trackId) => !apiMetadata.metadataByTrackId.has(trackId));
  const publicMetadata = unresolvedTrackIds.length > 0
    ? await fetchSpotifyTrackBatchFromPublicPages(unresolvedTrackIds)
    : new Map<string, CanonicalTrackMetadata>();

  const canonicalByTrackId = new Map<string, CanonicalTrackMetadata>(apiMetadata.metadataByTrackId);
  for (const [trackId, metadata] of publicMetadata) {
    canonicalByTrackId.set(trackId, metadata);
  }

  const plannedUpdates: Array<{
    rowId: string;
    trackId: string;
    data: {
      name?: string;
      albumImageUrl?: string;
      featuredArtists: string[];
      contributorIds: string[];
    };
    source: "api" | "public";
  }> = [];

  for (const [trackId, grouped] of selectedGroups) {
    const metadata = canonicalByTrackId.get(trackId);
    if (!metadata) continue;

    for (const row of grouped) {
      const primaryArtistName = normalizeName(row.artist.name);
      const featuredArtists = dedupeNames(
        metadata.artists.filter((artistName) => normalizeName(artistName) !== primaryArtistName)
      );
      const contributorIds = [...new Set(
        featuredArtists.flatMap((artistName) => artistIdsByNormalizedName.get(normalizeName(artistName)) ?? [])
      )];

      plannedUpdates.push({
        rowId: row.id,
        trackId,
        data: {
          ...(metadata.name ? { name: metadata.name } : {}),
          ...(metadata.albumImageUrl ? { albumImageUrl: metadata.albumImageUrl } : {}),
          featuredArtists,
          contributorIds,
        },
        source: metadata.source,
      });
    }
  }

  if (!dryRun) {
    for (const update of plannedUpdates) {
      await prisma.track.update({
        where: { id: update.rowId },
        data: update.data,
      });
    }
  }

  const sourceCounts = plannedUpdates.reduce(
    (counts, update) => {
      counts[update.source] += 1;
      return counts;
    },
    { api: 0, public: 0 }
  );

  console.log(JSON.stringify({
    dryRun,
    selectedTrackGroups: selectedGroups.length,
    selectedRows: selectedGroups.reduce((total, [, grouped]) => total + grouped.length, 0),
    candidateTrackGroups: groupedRows.size,
    candidateRows: candidateRows.length,
    rateLimitedFromApi: apiMetadata.rateLimited,
    repairedRows: plannedUpdates.length,
    repairedFromApi: sourceCounts.api,
    repairedFromPublic: sourceCounts.public,
    sample: plannedUpdates.slice(0, 10),
  }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });