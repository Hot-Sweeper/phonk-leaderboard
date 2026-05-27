import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseFeedTracks, collapseFeedTrackVersions, dedupeNames, extractTrackVersions, getDisplayTrackTitle } from "@/lib/track-dedupe";
import {
  getEmergingTrackHypeScore,
  getTrackAudienceScore,
  getTrackHypeScore,
  getTrackSignalScore,
  TRACK_BREAKOUT_FIRST_SEEN_MAX_DAYS,
} from "@/lib/legal-rankings";

const TREND_PERIODS = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
} as const;

const MIN_BASELINE_DISTANCE_MS: Record<keyof typeof TREND_PERIODS, number> = {
  day: 12 * 60 * 60 * 1000,
  week: 24 * 60 * 60 * 1000,
  month: 48 * 60 * 60 * 1000,
};

// Server-side in-memory caches
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rankedTracksCache = new Map<string, { rankedTracks: any[]; timestamp: number }>();
const RANKED_CACHE_TTL = 600_000; // 10 minutes

type SongsLeaderboardMode = "popularity" | "spotify" | "youtube" | keyof typeof TREND_PERIODS;
type TrendSortOrder = "desc" | "abs" | "asc";
type TrendValueMode = "absolute" | "relative";
type BasicArtistInfo = { id: string; name: string; imageUrl: string | null };
type FastCollapsedPopularitySongRow = {
  id: string;
  artistId: string;
  deezerId: string | null;
  name: string;
  albumName: string | null;
  albumImageUrl: string | null;
  previewUrl: string | null;
  durationMs: number;
  popularity: number;
  explicit: boolean;
  releaseDate: string | null;
  spotifyUrl: string | null;
  deezerUrl: string | null;
  featuredArtists: string[];
  contributorIds: string[];
  createdAt: Date;
  audienceScore: number;
  totalCount: number;
};

type FastCollapsedTrendSongRow = {
  id: string;
  artistId: string;
  deezerId: string | null;
  name: string;
  albumName: string | null;
  albumImageUrl: string | null;
  previewUrl: string | null;
  durationMs: number;
  popularity: number;
  explicit: boolean;
  releaseDate: string | null;
  spotifyUrl: string | null;
  deezerUrl: string | null;
  featuredArtists: string[];
  contributorIds: string[];
  createdAt: Date;
  trendDelta: number;
  trendPercent: number;
  hasTrendData: boolean;
  hypeScore: number;
  isEmergingHype: boolean;
  totalCount: number;
};

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesSearch(value: string | null | undefined, search: string) {
  if (!value) return false;
  return normalizeName(value).includes(search);
}

function getLeaderboardMode(value: string | null): SongsLeaderboardMode {
  if (value === "day" || value === "week" || value === "month") {
    return value;
  }
  if (value === "spotify" || value === "youtube") {
    return value;
  }
  return "popularity";
}

function getTrendSortOrder(value: string | null): TrendSortOrder {
  if (value === "asc" || value === "abs" || value === "desc") {
    return value;
  }

  return "desc";
}

function getTrendValueMode(value: string | null): TrendValueMode {
  if (value === "relative" || value === "change") {
    return "relative";
  }

  return "absolute";
}

function hasReliableTrendBaseline(trackCreatedAt: Date | string, baselineCreatedAt: Date | string, mode: keyof typeof TREND_PERIODS) {
  const trackCreatedMs = new Date(trackCreatedAt).getTime();
  const baselineCreatedMs = new Date(baselineCreatedAt).getTime();

  if (Number.isNaN(trackCreatedMs) || Number.isNaN(baselineCreatedMs)) {
    return false;
  }

  return baselineCreatedMs - trackCreatedMs >= MIN_BASELINE_DISTANCE_MS[mode];
}

function chooseTrackByMetric<T extends {
  metricValue: number;
  trendDelta: number;
  popularity: number;
  previewUrl?: string | null;
  featuredArtists?: string[];
  contributorIds?: string[];
  durationMs?: number;
  releaseDate?: string | null;
}>(left: T, right: T) {
  if (left.metricValue !== right.metricValue) {
    return left.metricValue > right.metricValue ? left : right;
  }

  if (left.trendDelta !== right.trendDelta) {
    return left.trendDelta > right.trendDelta ? left : right;
  }

  if (left.popularity !== right.popularity) {
    return left.popularity > right.popularity ? left : right;
  }

  const leftPreview = left.previewUrl ? 1 : 0;
  const rightPreview = right.previewUrl ? 1 : 0;
  if (leftPreview !== rightPreview) {
    return leftPreview > rightPreview ? left : right;
  }

  const leftArtistCount = (left.featuredArtists?.length ?? 0) + (left.contributorIds?.length ?? 0);
  const rightArtistCount = (right.featuredArtists?.length ?? 0) + (right.contributorIds?.length ?? 0);
  if (leftArtistCount !== rightArtistCount) {
    return leftArtistCount > rightArtistCount ? left : right;
  }

  const leftDuration = left.durationMs ?? 0;
  const rightDuration = right.durationMs ?? 0;
  if (leftDuration !== rightDuration) {
    return leftDuration > rightDuration ? left : right;
  }

  const leftRelease = left.releaseDate ?? "";
  const rightRelease = right.releaseDate ?? "";
  if (leftRelease !== rightRelease) {
    return leftRelease > rightRelease ? left : right;
  }

  return left;
}

function sortTrendTracks<T extends {
  track: {
    hasTrendData: boolean;
    metricValue: number;
    trendDelta: number;
    trendPercent: number;
    popularity: number;
  };
}>(tracks: T[], sortOrder: TrendSortOrder, valueMode: TrendValueMode) {
  tracks.sort((left, right) => {
    const leftHasData = left.track.hasTrendData ? 1 : 0;
    const rightHasData = right.track.hasTrendData ? 1 : 0;
    if (rightHasData !== leftHasData) {
      return rightHasData - leftHasData;
    }

    const leftPrimary = valueMode === "relative" ? left.track.trendPercent : left.track.metricValue;
    const rightPrimary = valueMode === "relative" ? right.track.trendPercent : right.track.metricValue;

    if (sortOrder === "abs") {
      const absoluteDiff = Math.abs(rightPrimary) - Math.abs(leftPrimary);
      if (absoluteDiff !== 0) {
        return absoluteDiff;
      }
    } else if (sortOrder === "asc") {
      if (leftPrimary !== rightPrimary) {
        return leftPrimary - rightPrimary;
      }
    } else if (leftPrimary !== rightPrimary) {
      return rightPrimary - leftPrimary;
    }

    if (right.track.metricValue !== left.track.metricValue) {
      return right.track.metricValue - left.track.metricValue;
    }

    if (right.track.trendDelta !== left.track.trendDelta) {
      return right.track.trendDelta - left.track.trendDelta;
    }

    return right.track.popularity - left.track.popularity;
  });
}

function chooseTrackByAudience<T extends {
  metricValue: number;
  popularity: number;
  previewUrl?: string | null;
  durationMs?: number;
  releaseDate?: string | null;
}>(left: T, right: T) {
  if (left.metricValue !== right.metricValue) {
    return left.metricValue > right.metricValue ? left : right;
  }

  if (left.popularity !== right.popularity) {
    return left.popularity > right.popularity ? left : right;
  }

  const leftPreview = left.previewUrl ? 1 : 0;
  const rightPreview = right.previewUrl ? 1 : 0;
  if (leftPreview !== rightPreview) {
    return leftPreview > rightPreview ? left : right;
  }

  const leftDuration = left.durationMs ?? 0;
  const rightDuration = right.durationMs ?? 0;
  if (leftDuration !== rightDuration) {
    return leftDuration > rightDuration ? left : right;
  }

  const leftRelease = left.releaseDate ?? "";
  const rightRelease = right.releaseDate ?? "";
  if (leftRelease !== rightRelease) {
    return leftRelease > rightRelease ? left : right;
  }

  return left;
}

/**
 * GET /api/songs?skip=0&take=50&search=...
 * Returns all tracks ranked by popularity, with artist info + contributor matching.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const skip = parseInt(searchParams.get("skip") ?? "0", 10) || 0;
  const take = Math.min(parseInt(searchParams.get("take") ?? "50", 10) || 50, 100);
  const search = normalizeName(searchParams.get("search")?.trim() || "");
  const rankingModel: "legal" | "standard" = "legal";
  const collapseVersions = searchParams.get("collapseVersions") !== "false";
  const mode = getLeaderboardMode(searchParams.get("mode"));
  const sortOrder = getTrendSortOrder(searchParams.get("sort"));
  const valueMode = getTrendValueMode(searchParams.get("valueMode"));
  const legalPopularityMode = rankingModel === "legal" && (mode === "popularity" || mode === "spotify");
  const legalHypeCandidateCutoff = new Date(Date.now() - (TRACK_BREAKOUT_FIRST_SEEN_MAX_DAYS * 24 * 60 * 60 * 1000));
  const canUseFastCollapsedTrendPath =
    rankingModel !== "legal"
    &&
    collapseVersions
    && sortOrder === "desc"
    && valueMode === "absolute"
    && search.length === 0
    && mode === "day";

  if (canUseFastCollapsedTrendPath) {
    const trendCutoff = new Date(Date.now() - TREND_PERIODS.day);
    const minBaselineDistanceMs = MIN_BASELINE_DISTANCE_MS.day;
    const fastRows = await prisma.$queryRaw<FastCollapsedTrendSongRow[]>`
      WITH latest_snapshots AS (
        SELECT DISTINCT ON (ts."trackId")
          ts."trackId",
          ts.popularity AS baseline_popularity,
          ts."createdAt" AS baseline_created_at
        FROM "TrackSnapshot" ts
        WHERE ts."createdAt" <= ${trendCutoff}
          AND ts.popularity > 0
          AND ts.popularity <= 100
        ORDER BY ts."trackId", ts."createdAt" DESC
      ),
      typed_tracks AS (
        SELECT
          t.id,
          t."artistId",
          t."deezerId",
          t.name,
          t."albumName",
          t."albumImageUrl",
          t."previewUrl",
          t."durationMs",
          t.popularity,
          t.explicit,
          t."releaseDate",
          t."spotifyUrl",
          t."deezerUrl",
          t."featuredArtists",
          t."contributorIds",
          t."createdAt",
          CASE
            WHEN t."releaseDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN t."releaseDate"::date
            ELSE NULL
          END AS release_date_value,
          CASE
            WHEN t.popularity > 100 THEN LEAST(100.0, t.popularity / 10000.0)
            ELSE LEAST(100.0, GREATEST(0.0, t.popularity::double precision))
          END AS popularity_score,
          CASE
            WHEN ls."trackId" IS NOT NULL
              AND t.popularity > 0
              AND ls.baseline_popularity > 0
              AND (EXTRACT(EPOCH FROM (ls.baseline_created_at - t."createdAt")) * 1000.0) >= ${minBaselineDistanceMs}
            THEN true
            ELSE false
          END AS has_trend_data,
          CASE
            WHEN ls."trackId" IS NOT NULL
              AND t.popularity > 0
              AND ls.baseline_popularity > 0
              AND (EXTRACT(EPOCH FROM (ls.baseline_created_at - t."createdAt")) * 1000.0) >= ${minBaselineDistanceMs}
            THEN t.popularity - ls.baseline_popularity
            ELSE 0
          END AS trend_delta,
          CASE
            WHEN ls."trackId" IS NOT NULL
              AND t.popularity > 0
              AND ls.baseline_popularity > 0
              AND (EXTRACT(EPOCH FROM (ls.baseline_created_at - t."createdAt")) * 1000.0) >= ${minBaselineDistanceMs}
            THEN ROUND((((t.popularity - ls.baseline_popularity)::numeric / ls.baseline_popularity::numeric) * 100.0), 2)::double precision
            ELSE 0.0
          END AS trend_percent,
          COALESCE(
            NULLIF(
              BTRIM(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        LOWER(t.name),
                        '\\[[^\\]]*(slowed|speed up|sped up|nightcore|super slowed|ultra slowed|reverb|remix|edit|extended|instrumental|phonk version|version)[^\\]]*\\]',
                        ' ',
                        'gi'
                      ),
                      '\\([^\\)]*(slowed|speed up|sped up|nightcore|super slowed|ultra slowed|reverb|remix|edit|extended|instrumental|phonk version|version)[^\\)]*\\)',
                      ' ',
                      'gi'
                    ),
                    '\\s+-\\s+((slowed|speed up|sped up|nightcore|super slowed|ultra slowed|reverb|remix|edit|extended|instrumental|phonk version|version).*)$',
                    ' ',
                    'gi'
                  ),
                  '[^a-z0-9]+',
                  ' ',
                  'g'
                )
              ),
              ''
            ),
            LOWER(t.name)
          ) AS canonical_title
        FROM "Track" t
        LEFT JOIN latest_snapshots ls ON ls."trackId" = t.id
      ),
      scored_tracks AS (
        SELECT
          *,
          CASE
            WHEN release_date_value IS NULL THEN 0
            WHEN CURRENT_DATE - release_date_value <= 7 THEN 100
            WHEN CURRENT_DATE - release_date_value <= 14 THEN 96
            WHEN CURRENT_DATE - release_date_value <= 30 THEN 90
            WHEN CURRENT_DATE - release_date_value <= 45 THEN 84
            WHEN CURRENT_DATE - release_date_value <= 60 THEN 72
            WHEN CURRENT_DATE - release_date_value <= 90 THEN 56
            WHEN CURRENT_DATE - release_date_value <= 180 THEN 34
            WHEN CURRENT_DATE - release_date_value <= 365 THEN 18
            ELSE 8
          END AS freshness_score,
          CASE
            WHEN has_trend_data = false OR trend_delta <= 0 THEN 0
            WHEN release_date_value IS NULL THEN 18
            WHEN CURRENT_DATE - release_date_value <= 14 THEN 100
            WHEN CURRENT_DATE - release_date_value <= 30 THEN 100
            WHEN CURRENT_DATE - release_date_value <= 60 THEN 92
            WHEN CURRENT_DATE - release_date_value <= 90 THEN 72
            WHEN CURRENT_DATE - release_date_value <= 180 THEN 46
            WHEN CURRENT_DATE - release_date_value <= 365 THEN 24
            ELSE 12
          END AS trend_score,
          CASE
            WHEN release_date_value IS NULL OR popularity_score < 50 THEN 0
            WHEN CURRENT_DATE - release_date_value <= 60 THEN ROUND((popularity_score * 0.4) + (
              CASE
                WHEN CURRENT_DATE - release_date_value <= 7 THEN 100
                WHEN CURRENT_DATE - release_date_value <= 14 THEN 96
                WHEN CURRENT_DATE - release_date_value <= 30 THEN 90
                WHEN CURRENT_DATE - release_date_value <= 45 THEN 84
                WHEN CURRENT_DATE - release_date_value <= 60 THEN 72
                WHEN CURRENT_DATE - release_date_value <= 90 THEN 56
                WHEN CURRENT_DATE - release_date_value <= 180 THEN 34
                WHEN CURRENT_DATE - release_date_value <= 365 THEN 18
                ELSE 8
              END * 0.6
            ))::int
            WHEN CURRENT_DATE - release_date_value <= 90 AND popularity_score >= 70 THEN ROUND((popularity_score * 0.45) + (
              CASE
                WHEN CURRENT_DATE - release_date_value <= 7 THEN 100
                WHEN CURRENT_DATE - release_date_value <= 14 THEN 96
                WHEN CURRENT_DATE - release_date_value <= 30 THEN 90
                WHEN CURRENT_DATE - release_date_value <= 45 THEN 84
                WHEN CURRENT_DATE - release_date_value <= 60 THEN 72
                WHEN CURRENT_DATE - release_date_value <= 90 THEN 56
                WHEN CURRENT_DATE - release_date_value <= 180 THEN 34
                WHEN CURRENT_DATE - release_date_value <= 365 THEN 18
                ELSE 8
              END * 0.55
            ))::int
            ELSE 0
          END AS breakout_score
        FROM typed_tracks
      ),
      ranked_tracks AS (
        SELECT
          *,
          GREATEST(trend_score, breakout_score) AS hype_score,
          (breakout_score > 0 AND breakout_score >= trend_score) AS is_emerging_hype,
          ROW_NUMBER() OVER (
            PARTITION BY canonical_title
            ORDER BY
              CASE WHEN ${rankingModel} = 'legal' THEN GREATEST(trend_score, breakout_score)::double precision ELSE CASE WHEN has_trend_data THEN 1 ELSE 0 END::double precision END DESC,
              CASE WHEN ${rankingModel} = 'legal' THEN popularity_score ELSE trend_delta END DESC,
              trend_delta DESC,
              popularity DESC,
              CASE WHEN COALESCE("previewUrl", '') <> '' THEN 1 ELSE 0 END DESC,
              (COALESCE(array_length("featuredArtists", 1), 0) + COALESCE(array_length("contributorIds", 1), 0)) DESC,
              "durationMs" DESC,
              COALESCE("releaseDate", '') DESC,
              id ASC
          ) AS version_rank
        FROM scored_tracks
      ),
      collapsed_tracks AS (
        SELECT *
        FROM ranked_tracks
        WHERE version_rank = 1
      )
      SELECT
        id,
        "artistId",
        "deezerId",
        name,
        "albumName",
        "albumImageUrl",
        "previewUrl",
        "durationMs",
        popularity,
        explicit,
        "releaseDate",
        "spotifyUrl",
        "deezerUrl",
        "featuredArtists",
        "contributorIds",
        "createdAt",
        trend_delta AS "trendDelta",
        trend_percent AS "trendPercent",
        has_trend_data AS "hasTrendData",
        hype_score AS "hypeScore",
        is_emerging_hype AS "isEmergingHype",
        COUNT(*) OVER()::int AS "totalCount"
      FROM collapsed_tracks
      WHERE ${rankingModel} <> 'legal' OR is_emerging_hype = true
      ORDER BY
        CASE WHEN ${rankingModel} = 'legal' THEN hype_score::double precision ELSE CASE WHEN has_trend_data THEN 1 ELSE 0 END::double precision END DESC,
        CASE WHEN ${rankingModel} = 'legal' THEN popularity_score ELSE trend_delta END DESC,
        trend_delta DESC,
        popularity DESC,
        id ASC
      OFFSET ${skip}
      LIMIT ${take}
    `;

    const totalCount = fastRows[0]?.totalCount ?? 0;
    const primaryArtistIds = [...new Set(fastRows.map((row) => row.artistId))];
    const contributorIds = [...new Set(fastRows.flatMap((row) => row.contributorIds))];
    const featuredArtistNames = dedupeNames(fastRows.flatMap((row) => row.featuredArtists));

    const [primaryArtists, contributors, featuredArtistMatches] = await Promise.all([
      primaryArtistIds.length > 0
        ? prisma.artist.findMany({
            where: { id: { in: primaryArtistIds } },
            select: { id: true, name: true, imageUrl: true },
          })
        : Promise.resolve([]),
      contributorIds.length > 0
        ? prisma.artist.findMany({
            where: { id: { in: contributorIds } },
            select: { id: true, name: true, imageUrl: true },
          })
        : Promise.resolve([]),
      featuredArtistNames.length > 0
        ? prisma.artist.findMany({
            where: {
              OR: featuredArtistNames.map((name) => ({
                name: { equals: name, mode: "insensitive" as const },
              })),
            },
            select: { id: true, name: true, imageUrl: true },
          })
        : Promise.resolve([]),
    ]);

    const primaryArtistMap = new Map(primaryArtists.map((artist) => [artist.id, artist]));
    const contributorMap = new Map(contributors.map((artist) => [artist.id, artist]));
    const featuredArtistMap = new Map(featuredArtistMatches.map((artist) => [normalizeName(artist.name), artist]));

    const tracks = fastRows.map((row, index) => {
      const primaryArtist = primaryArtistMap.get(row.artistId) ?? {
        id: row.artistId,
        name: "Unknown artist",
        imageUrl: null,
      };
      const seenNames = new Set<string>([normalizeName(primaryArtist.name)]);
      const resolvedContributors = row.contributorIds
        .map((id) => contributorMap.get(id))
        .filter((artist): artist is BasicArtistInfo => !!artist)
        .filter((artist) => {
          const key = normalizeName(artist.name);
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        });
      const remainingFeaturedArtists: string[] = [];

      for (const featuredArtist of dedupeNames(row.featuredArtists)) {
        const normalized = normalizeName(featuredArtist);
        if (seenNames.has(normalized)) continue;

        const forumArtist = featuredArtistMap.get(normalized);
        if (forumArtist) {
          resolvedContributors.push(forumArtist);
          seenNames.add(normalized);
          continue;
        }

        seenNames.add(normalized);
        remainingFeaturedArtists.push(featuredArtist);
      }

      const versions = extractTrackVersions(row.name);

      const { deezerId: _deezerId, deezerUrl: _deezerUrl, ...publicRow } = row;

      return {
        ...publicRow,
        name: getDisplayTrackTitle(row.name),
        rank: skip + index + 1,
        versions,
        primaryVersion: versions[0] ?? "Original",
        metricValue: rankingModel === "legal" ? row.hypeScore : row.trendDelta,
        trendDelta: row.trendDelta,
        trendPercent: row.trendPercent,
        hasTrendData: row.hasTrendData,
        isEmergingHype: rankingModel === "legal" ? row.isEmergingHype : false,
        createdAt: row.createdAt,
        leaderboardMode: mode,
        featuredArtists: remainingFeaturedArtists,
        contributors: resolvedContributors,
        artist: primaryArtist,
      };
    });

    return NextResponse.json(
      { tracks, totalCount, mode: rankingModel === "legal" ? "hype" : mode },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  }

  const canUseFastCollapsedPopularityPath =
    legalPopularityMode
    && collapseVersions
    && sortOrder === "desc"
    && valueMode === "absolute"
    && search.length === 0;

  if (canUseFastCollapsedPopularityPath) {
    const fastRows = await prisma.$queryRaw<FastCollapsedPopularitySongRow[]>`
      WITH typed_tracks AS (
        SELECT
          t.id,
          t."artistId",
          t."deezerId",
          t.name,
          t."albumName",
          t."albumImageUrl",
          t."previewUrl",
          t."durationMs",
          t.popularity,
          t.explicit,
          t."releaseDate",
          t."spotifyUrl",
          t."deezerUrl",
          t."featuredArtists",
          t."contributorIds",
          t."createdAt",
          CASE
            WHEN t."releaseDate" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN t."releaseDate"::date
            ELSE NULL
          END AS release_date_value,
          CASE
            WHEN t.popularity > 100 THEN LEAST(100.0, t.popularity / 10000.0)
            ELSE LEAST(100.0, GREATEST(0.0, t.popularity::double precision))
          END AS popularity_score,
          CASE WHEN COALESCE(t."previewUrl", '') <> '' THEN 100 ELSE 0 END AS preview_score,
          COALESCE(
            NULLIF(
              BTRIM(
                REGEXP_REPLACE(
                  REGEXP_REPLACE(
                    REGEXP_REPLACE(
                      REGEXP_REPLACE(
                        LOWER(t.name),
                        '\\[[^\\]]*(slowed|speed up|sped up|nightcore|super slowed|ultra slowed|reverb|remix|edit|extended|instrumental|phonk version|version)[^\\]]*\\]',
                        ' ',
                        'gi'
                      ),
                      '\\([^\\)]*(slowed|speed up|sped up|nightcore|super slowed|ultra slowed|reverb|remix|edit|extended|instrumental|phonk version|version)[^\\)]*\\)',
                      ' ',
                      'gi'
                    ),
                    '\\s+-\\s+((slowed|speed up|sped up|nightcore|super slowed|ultra slowed|reverb|remix|edit|extended|instrumental|phonk version|version).*)$',
                    ' ',
                    'gi'
                  ),
                  '[^a-z0-9]+',
                  ' ',
                  'g'
                )
              ),
              ''
            ),
            LOWER(t.name)
          ) AS canonical_title
        FROM "Track" t
      ),
      scored_tracks AS (
        SELECT
          *,
          CASE
            WHEN release_date_value IS NULL THEN 25
            WHEN CURRENT_DATE - release_date_value <= 30 THEN 100
            WHEN CURRENT_DATE - release_date_value <= 90 THEN 78
            WHEN CURRENT_DATE - release_date_value <= 180 THEN 55
            WHEN CURRENT_DATE - release_date_value <= 365 THEN 32
            ELSE 12
          END AS recency_score,
          ROUND((popularity_score * 0.8) + (
            CASE
              WHEN release_date_value IS NULL THEN 25
              WHEN CURRENT_DATE - release_date_value <= 30 THEN 100
              WHEN CURRENT_DATE - release_date_value <= 90 THEN 78
              WHEN CURRENT_DATE - release_date_value <= 180 THEN 55
              WHEN CURRENT_DATE - release_date_value <= 365 THEN 32
              ELSE 12
            END * 0.15
          ) + (preview_score * 0.05))::int AS "audienceScore"
        FROM typed_tracks
      ),
      ranked_tracks AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY canonical_title
            ORDER BY
              CASE WHEN ${rankingModel} = 'legal' THEN "audienceScore"::double precision ELSE popularity::double precision END DESC,
              popularity DESC,
              CASE WHEN COALESCE("previewUrl", '') <> '' THEN 1 ELSE 0 END DESC,
              (COALESCE(array_length("featuredArtists", 1), 0) + COALESCE(array_length("contributorIds", 1), 0)) DESC,
              "durationMs" DESC,
              COALESCE("releaseDate", '') DESC,
              id ASC
          ) AS version_rank
        FROM scored_tracks
      ),
      collapsed_tracks AS (
        SELECT *
        FROM ranked_tracks
        WHERE version_rank = 1
      )
      SELECT
        id,
        "artistId",
        "deezerId",
        name,
        "albumName",
        "albumImageUrl",
        "previewUrl",
        "durationMs",
        popularity,
        explicit,
        "releaseDate",
        "spotifyUrl",
        "deezerUrl",
        "featuredArtists",
        "contributorIds",
        "createdAt",
        "audienceScore",
        COUNT(*) OVER()::int AS "totalCount"
      FROM collapsed_tracks
      ORDER BY
        CASE WHEN ${rankingModel} = 'legal' THEN "audienceScore"::double precision ELSE popularity::double precision END DESC,
        popularity DESC,
        id ASC
      OFFSET ${skip}
      LIMIT ${take}
    `;

    const totalCount = fastRows[0]?.totalCount ?? 0;
    const primaryArtistIds = [...new Set(fastRows.map((row) => row.artistId))];
    const contributorIds = [...new Set(fastRows.flatMap((row) => row.contributorIds))];
    const featuredArtistNames = dedupeNames(fastRows.flatMap((row) => row.featuredArtists));

    const [primaryArtists, contributors, featuredArtistMatches] = await Promise.all([
      primaryArtistIds.length > 0
        ? prisma.artist.findMany({
            where: { id: { in: primaryArtistIds } },
            select: { id: true, name: true, imageUrl: true },
          })
        : Promise.resolve([]),
      contributorIds.length > 0
        ? prisma.artist.findMany({
            where: { id: { in: contributorIds } },
            select: { id: true, name: true, imageUrl: true },
          })
        : Promise.resolve([]),
      featuredArtistNames.length > 0
        ? prisma.artist.findMany({
            where: {
              OR: featuredArtistNames.map((name) => ({
                name: { equals: name, mode: "insensitive" as const },
              })),
            },
            select: { id: true, name: true, imageUrl: true },
          })
        : Promise.resolve([]),
    ]);

    const primaryArtistMap = new Map(primaryArtists.map((artist) => [artist.id, artist]));
    const contributorMap = new Map(contributors.map((artist) => [artist.id, artist]));
    const featuredArtistMap = new Map(featuredArtistMatches.map((artist) => [normalizeName(artist.name), artist]));

    const tracks = fastRows.map((row, index) => {
      const primaryArtist = primaryArtistMap.get(row.artistId) ?? {
        id: row.artistId,
        name: "Unknown artist",
        imageUrl: null,
      };
      const seenNames = new Set<string>([normalizeName(primaryArtist.name)]);
      const resolvedContributors = row.contributorIds
        .map((id) => contributorMap.get(id))
        .filter((artist): artist is BasicArtistInfo => !!artist)
        .filter((artist) => {
          const key = normalizeName(artist.name);
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        });
      const remainingFeaturedArtists: string[] = [];

      for (const featuredArtist of dedupeNames(row.featuredArtists)) {
        const normalized = normalizeName(featuredArtist);
        if (seenNames.has(normalized)) continue;

        const forumArtist = featuredArtistMap.get(normalized);
        if (forumArtist) {
          resolvedContributors.push(forumArtist);
          seenNames.add(normalized);
          continue;
        }

        seenNames.add(normalized);
        remainingFeaturedArtists.push(featuredArtist);
      }

      const versions = extractTrackVersions(row.name);

      const { deezerId: _deezerId, deezerUrl: _deezerUrl, ...publicRow } = row;

      return {
        ...publicRow,
        name: getDisplayTrackTitle(row.name),
        rank: skip + index + 1,
        versions,
        primaryVersion: versions[0] ?? "Original",
        audienceScore: rankingModel === "legal" ? row.audienceScore : undefined,
        metricValue: rankingModel === "legal" ? row.audienceScore : row.popularity,
        trendDelta: 0,
        trendPercent: 0,
        hasTrendData: false,
        createdAt: row.createdAt,
        leaderboardMode: mode,
        featuredArtists: remainingFeaturedArtists,
        contributors: resolvedContributors,
        artist: primaryArtist,
      };
    });

    return NextResponse.json(
      { tracks, totalCount, mode: rankingModel === "legal" ? "popularity" : mode },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  }

  const rankedCacheKey = `v4-raw-signals:${rankingModel}:${mode}:${collapseVersions}:${sortOrder}:${valueMode}`;
  const now = Date.now();
  const cachedRanked = rankedTracksCache.get(rankedCacheKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rankedTracks: any[];

  if (cachedRanked && now - cachedRanked.timestamp < RANKED_CACHE_TTL) {
    rankedTracks = cachedRanked.rankedTracks;
  } else {
    const useFastStandardPopularityPath = false;

    const allTracks = useFastStandardPopularityPath
      ? await (async () => {
          const [tracks, artists] = await Promise.all([
            prisma.track.findMany({
              orderBy: { popularity: "desc" },
              select: {
                id: true,
                artistId: true,
                deezerId: true,
                name: true,
                albumName: true,
                albumImageUrl: true,
                previewUrl: true,
                durationMs: true,
                popularity: true,
                spotifyPopularity: true,
                youtubeViews: true,
                explicit: true,
                releaseDate: true,
                spotifyUrl: true,
                deezerUrl: true,
                featuredArtists: true,
                contributorIds: true,
                createdAt: true,
              },
            }),
            prisma.artist.findMany({
              select: { id: true, name: true, imageUrl: true },
            }),
          ]);

          const artistMap = new Map<string, BasicArtistInfo>(artists.map((artist) => [artist.id, artist]));

          return tracks.map((track) => ({
            ...track,
            artist: artistMap.get(track.artistId) ?? {
              id: track.artistId,
              name: "Unknown artist",
              imageUrl: null,
            },
          }));
        })()
      : await prisma.track.findMany({
          where: rankingModel === "legal" && !legalPopularityMode
            ? { createdAt: { gte: legalHypeCandidateCutoff } }
            : undefined,
          orderBy: { popularity: "desc" },
          include: {
            artist: {
              select: { id: true, name: true, imageUrl: true },
            },
          },
        });

    if (rankingModel === "legal") {
      if (legalPopularityMode) {
        const legalMetricTracks = allTracks.map((track) => {
          const audienceScore = getTrackAudienceScore(track, "composite", "strictLegacyPopularity");
          return {
            ...track,
            audienceScore,
            metricValue: audienceScore,
            trendDelta: 0,
            trendPercent: 0,
            hasTrendData: false,
          };
        });

        rankedTracks = collapseVersions
          ? collapseFeedTrackVersions(legalMetricTracks, chooseTrackByAudience)
          : collapseFeedTracks(legalMetricTracks, chooseTrackByAudience);

        rankedTracks.sort((left, right) => right.track.metricValue - left.track.metricValue || right.track.popularity - left.track.popularity);
      } else {
        const trendMode = (mode === "youtube" ? "day" : mode) as keyof typeof TREND_PERIODS;
        const periodMs = TREND_PERIODS[trendMode];
        const cutoff = new Date(Date.now() - periodMs);
        let oldSnapshots: Array<{
          trackId: string;
          popularity: number;
          spotifyPopularity: number;
          youtubeViews: number;
          createdAt: Date;
        }> = [];

        try {
          oldSnapshots = await prisma.$queryRaw<Array<{
            trackId: string;
            popularity: number;
            spotifyPopularity: number;
            youtubeViews: number;
            createdAt: Date;
          }>>`
            SELECT DISTINCT ON ("trackId") "trackId", popularity, "spotifyPopularity", "youtubeViews", "createdAt"
            FROM "TrackSnapshot"
            WHERE "createdAt" <= ${cutoff}
              AND (popularity > 0 AND popularity <= 100 OR "spotifyPopularity" > 0 OR "youtubeViews" > 0)
            ORDER BY "trackId", "createdAt" DESC
          `;
        } catch {
          oldSnapshots = [];
        }

        const oldSnapshotMap = new Map(oldSnapshots.map((snapshot) => [snapshot.trackId, snapshot]));

        const legalMetricTracks = allTracks.map((track) => {
          const oldSnapshot = oldSnapshotMap.get(track.id);
          const currentSignalScore = getTrackSignalScore(track);
          const previousSignalScore = oldSnapshot
            ? getTrackSignalScore({
                popularity: oldSnapshot.popularity,
                spotifyPopularity: oldSnapshot.spotifyPopularity,
                youtubeViews: oldSnapshot.youtubeViews,
              })
            : 0;
          const hasUsableTrendData = !!oldSnapshot
            && currentSignalScore > 0
            && previousSignalScore > 0
            && hasReliableTrendBaseline(track.createdAt, oldSnapshot.createdAt, trendMode);
          const trendDelta = hasUsableTrendData
            ? Math.round((currentSignalScore - previousSignalScore) * 100) / 100
            : 0;
          const trendPercent = hasUsableTrendData
            ? Math.round((((currentSignalScore - previousSignalScore) / previousSignalScore) * 100) * 100) / 100
            : 0;
          const audienceScore = getTrackAudienceScore(track);
          const emergingHypeScore = getEmergingTrackHypeScore({
            popularity: track.popularity,
            spotifyPopularity: track.spotifyPopularity,
            youtubeViews: track.youtubeViews,
            releaseDate: track.releaseDate,
            previewUrl: track.previewUrl,
            firstSeenAt: track.createdAt,
          });
          const measuredHypeBaseScore = hasUsableTrendData
            ? getTrackHypeScore({
                popularity: track.popularity,
                spotifyPopularity: track.spotifyPopularity,
                youtubeViews: track.youtubeViews,
                releaseDate: track.releaseDate,
                previewUrl: track.previewUrl,
                previousPopularity: oldSnapshot.popularity,
                previousSpotifyPopularity: oldSnapshot.spotifyPopularity,
                previousYoutubeViews: oldSnapshot.youtubeViews,
              })
            : 0;
          const measuredHypeScore = measuredHypeBaseScore;
          const shouldUseEmergingFallback = emergingHypeScore > 0
            && (emergingHypeScore >= measuredHypeScore || !hasUsableTrendData || measuredHypeScore <= 0);
          const hypeScore = shouldUseEmergingFallback
            ? Math.max(emergingHypeScore, measuredHypeScore)
            : measuredHypeScore;

          return {
            ...track,
            audienceScore,
            metricValue: hypeScore,
            trendDelta,
            trendPercent,
            hasTrendData: hasUsableTrendData,
            isEmergingHype: shouldUseEmergingFallback,
          };
        });

        rankedTracks = collapseVersions
          ? collapseFeedTrackVersions(legalMetricTracks, chooseTrackByMetric)
          : collapseFeedTracks(legalMetricTracks, chooseTrackByMetric);

        rankedTracks.sort((left, right) => right.track.metricValue - left.track.metricValue || right.track.trendDelta - left.track.trendDelta || right.track.popularity - left.track.popularity);
        rankedTracks = rankedTracks.filter(({ track }) => track.isEmergingHype);
      }
    } else {

      const popularityMetricTracks = allTracks.map((track) => ({
        ...track,
        metricValue: track.popularity,
        trendDelta: 0,
        trendPercent: 0,
        hasTrendData: false,
      }));

      if (mode === "popularity") {
        rankedTracks = collapseVersions
          ? collapseFeedTrackVersions(popularityMetricTracks)
          : collapseFeedTracks(popularityMetricTracks);
      } else if (mode === "day" || mode === "week" || mode === "month") {
        const periodMs = TREND_PERIODS[mode];
        const cutoff = new Date(Date.now() - periodMs);
        let oldSnapshots: Array<{ trackId: string; popularity: number; createdAt: Date }> = [];

        try {
          oldSnapshots = await prisma.trackSnapshot.findMany({
            where: {
              createdAt: { lte: cutoff },
              popularity: { gt: 0 },
            },
            orderBy: { createdAt: "desc" },
            distinct: ["trackId"],
            select: {
              trackId: true,
              popularity: true,
              createdAt: true,
            },
          });
        } catch {
          oldSnapshots = [];
        }

        const oldSnapshotMap = new Map(oldSnapshots.map((snapshot) => [snapshot.trackId, snapshot]));

        const metricTracks = allTracks.map((track) => {
          const oldSnapshot = oldSnapshotMap.get(track.id);
          const hasUsableTrendData = !!oldSnapshot
            && track.popularity > 0
            && oldSnapshot.popularity > 0
            && hasReliableTrendBaseline(track.createdAt, oldSnapshot.createdAt, mode);
          const trendDelta = hasUsableTrendData ? track.popularity - oldSnapshot.popularity : 0;
          const trendPercent = hasUsableTrendData
            ? Math.round(((track.popularity - oldSnapshot.popularity) / oldSnapshot.popularity) * 10000) / 100
            : 0;

          return {
            ...track,
            metricValue: trendDelta,
            trendDelta,
            trendPercent,
            hasTrendData: hasUsableTrendData,
          };
        });

        rankedTracks = collapseVersions
          ? collapseFeedTrackVersions(metricTracks, chooseTrackByMetric)
          : collapseFeedTracks(metricTracks, chooseTrackByMetric);

        sortTrendTracks(rankedTracks, sortOrder, valueMode);
      } else {
        rankedTracks = [];
      }
    }

    rankedTracksCache.set(rankedCacheKey, { rankedTracks, timestamp: now });
  }

  const rankByTrackId = new Map(rankedTracks.map(({ track }, index) => [track.id, index + 1]));

  const filteredTracks = search
    ? rankedTracks.filter(({ track }) => (
        includesSearch(track.name, search)
        || includesSearch(track.artist.name, search)
        || includesSearch(track.albumName, search)
        || track.featuredArtists.some((name: string) => includesSearch(name, search))
      ))
    : rankedTracks;

  const tracks = filteredTracks.slice(skip, skip + take);
  const totalCount = filteredTracks.length;

  // Resolve contributorIds to actual artist info
  const allContributorIds = [...new Set(tracks.flatMap(({ track }) => track.contributorIds))];
  const contributors = allContributorIds.length > 0
    ? await prisma.artist.findMany({
        where: { id: { in: allContributorIds } },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const contributorMap = new Map(contributors.map(c => [c.id, c]));
  const featuredArtistNames = dedupeNames(tracks.flatMap(({ track }) => track.featuredArtists));
  const featuredArtistMatches = featuredArtistNames.length > 0
    ? await prisma.artist.findMany({
        where: {
          OR: featuredArtistNames.map((name) => ({
            name: { equals: name, mode: "insensitive" as const },
          })),
        },
        select: { id: true, name: true, imageUrl: true },
      })
    : [];
  const featuredArtistMap = new Map(featuredArtistMatches.map((artist) => [normalizeName(artist.name), artist]));

  if (rankingModel === "legal") {
    const enrichedTracks = tracks.map(({ track, versions, primaryVersion }) => {
      const resolvedContributors = track.contributorIds
        .map((id: string) => contributorMap.get(id))
        .filter((artist: { id: string; name: string; imageUrl: string | null } | undefined): artist is { id: string; name: string; imageUrl: string | null } => !!artist);

      const { deezerId: _deezerId, deezerUrl: _deezerUrl, ...publicTrack } = track;

      return {
        ...publicTrack,
        audienceScore: track.audienceScore,
        rank: rankByTrackId.get(track.id) ?? 0,
        versions,
        primaryVersion,
        metricValue: track.metricValue,
        trendDelta: track.trendDelta,
        trendPercent: track.trendPercent,
        hasTrendData: track.hasTrendData,
        isEmergingHype: track.isEmergingHype ?? false,
        createdAt: track.createdAt,
        leaderboardMode: mode,
        contributors: resolvedContributors,
        artist: track.artist,
      };
    });

    return NextResponse.json(
      { tracks: enrichedTracks, totalCount, mode: legalPopularityMode ? "popularity" : "hype" },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  }

  const enrichedTracks = tracks.map(({ track, versions, primaryVersion }) => {
    const seenNames = new Set<string>([normalizeName(track.artist.name)]);
    const resolvedContributors = track.contributorIds
      .map((id: string) => contributorMap.get(id))
      .filter((artist: { id: string; name: string; imageUrl: string | null } | undefined): artist is { id: string; name: string; imageUrl: string | null } => !!artist)
      .filter((artist: { id: string; name: string; imageUrl: string | null }) => {
        const key = normalizeName(artist.name);
        if (seenNames.has(key)) return false;
        seenNames.add(key);
        return true;
      });

    const remainingFeaturedArtists: string[] = [];

    for (const featuredArtist of dedupeNames(track.featuredArtists)) {
      const normalized = normalizeName(featuredArtist);
      if (seenNames.has(normalized)) continue;

      const forumArtist = featuredArtistMap.get(normalized);
      if (forumArtist) {
        resolvedContributors.push(forumArtist);
        seenNames.add(normalized);
        continue;
      }

      seenNames.add(normalized);
      remainingFeaturedArtists.push(featuredArtist);
    }

    const { deezerId: _deezerId, deezerUrl: _deezerUrl, ...publicTrack } = track;

    return {
      ...publicTrack,
      name: getDisplayTrackTitle(track.name),
      rank: rankByTrackId.get(track.id) ?? 0,
      versions,
      primaryVersion,
      metricValue: track.metricValue,
      trendDelta: track.trendDelta,
      trendPercent: track.trendPercent,
      hasTrendData: track.hasTrendData,
      createdAt: track.createdAt,
      leaderboardMode: mode,
      featuredArtists: remainingFeaturedArtists,
      contributors: resolvedContributors,
      artist: track.artist,
    };
  });

  return NextResponse.json(
    { tracks: enrichedTracks, totalCount, mode },
    {
      headers: {
        "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
      },
    }
  );
}
