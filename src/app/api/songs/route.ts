import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { collapseFeedTracks, collapseFeedTrackVersions, dedupeNames, extractTrackVersions, getDisplayTrackTitle } from "@/lib/track-dedupe";
import { fetchDeezerTrackDetail } from "@/lib/platforms";
import { getEmergingTrackHypeScore, getTrackAudienceScore, getTrackHypeScore } from "@/lib/legal-rankings";
import { EMPTY_EXTERNAL_SIGNAL_SNAPSHOT, EMPTY_EXTERNAL_TREND_SIGNALS, fetchExternalTrendSignals, resolveExternalTrendSignalForTrack } from "@/lib/legal-sources";

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
const RANKED_CACHE_TTL = 120_000; // 2 minutes

type DeezerDetail = Awaited<ReturnType<typeof fetchDeezerTrackDetail>>;
type DeezerCacheEntry = { data: DeezerDetail; timestamp: number };
const deezerDetailCache = new Map<number, DeezerCacheEntry>();
const DEEZER_CACHE_TTL = 3_600_000; // 1 hour

type SongsLeaderboardMode = "popularity" | keyof typeof TREND_PERIODS;
type TrendSortOrder = "desc" | "abs" | "asc";
type TrendValueMode = "absolute" | "relative";

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

type DisplayArtist = {
  key: string;
  name: string;
  href: string;
  external: boolean;
};

function getLeaderboardMode(value: string | null): SongsLeaderboardMode {
  if (value === "day" || value === "week" || value === "month") {
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
  const rankingModel = searchParams.get("rankingModel") === "legal" ? "legal" : "standard";
  const collapseVersions = searchParams.get("collapseVersions") !== "false";
  const mode = getLeaderboardMode(searchParams.get("mode"));
  const sortOrder = getTrendSortOrder(searchParams.get("sort"));
  const valueMode = getTrendValueMode(searchParams.get("valueMode"));

  const rankedCacheKey = `${rankingModel}:${mode}:${collapseVersions}:${sortOrder}:${valueMode}`;
  const now = Date.now();
  const cachedRanked = rankedTracksCache.get(rankedCacheKey);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rankedTracks: any[];

  if (cachedRanked && now - cachedRanked.timestamp < RANKED_CACHE_TTL) {
    rankedTracks = cachedRanked.rankedTracks;
  } else {
    const allTracks = await prisma.track.findMany({
      orderBy: { popularity: "desc" },
      include: {
        artist: {
          select: { id: true, name: true, imageUrl: true },
        },
      },
    });

    if (rankingModel === "legal") {
      if (mode === "popularity") {
        const legalMetricTracks = allTracks.map((track) => {
          const audienceScore = getTrackAudienceScore(track);
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
        const externalSignals = mode === "day"
          ? await fetchExternalTrendSignals().catch(() => EMPTY_EXTERNAL_SIGNAL_SNAPSHOT)
          : EMPTY_EXTERNAL_SIGNAL_SNAPSHOT;
        const periodMs = TREND_PERIODS[mode];
        const cutoff = new Date(Date.now() - periodMs);
        let oldSnapshots: Array<{ trackId: string; popularity: number; createdAt: Date }> = [];

        try {
          oldSnapshots = await prisma.trackSnapshot.findMany({
            where: {
              trackId: { in: allTracks.map((track) => track.id) },
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

        const legalMetricTracks = allTracks.map((track) => {
          const oldSnapshot = oldSnapshotMap.get(track.id);
          const hasUsableTrendData = !!oldSnapshot
            && track.popularity > 0
            && oldSnapshot.popularity > 0
            && hasReliableTrendBaseline(track.createdAt, oldSnapshot.createdAt, mode);
          const trendDelta = hasUsableTrendData ? track.popularity - oldSnapshot.popularity : 0;
          const trendPercent = hasUsableTrendData
            ? Math.round(((track.popularity - oldSnapshot.popularity) / oldSnapshot.popularity) * 10000) / 100
            : 0;
          const audienceScore = getTrackAudienceScore(track);
          const externalTrendSignals = mode === "day"
            ? resolveExternalTrendSignalForTrack(track, externalSignals)
            : EMPTY_EXTERNAL_TREND_SIGNALS;
          const emergingHypeScore = getEmergingTrackHypeScore({
            popularity: track.popularity,
            releaseDate: track.releaseDate,
            previewUrl: track.previewUrl,
            firstSeenAt: track.createdAt,
          });
          const measuredHypeBaseScore = hasUsableTrendData
            ? getTrackHypeScore({
                popularity: track.popularity,
                releaseDate: track.releaseDate,
                previewUrl: track.previewUrl,
                previousPopularity: oldSnapshot.popularity,
              })
            : 0;
          const measuredHypeScore = measuredHypeBaseScore > 0
            ? Math.round((measuredHypeBaseScore * 0.9) + (externalTrendSignals.score * 0.1))
            : 0;
          const emergingHypeWithExternalScore = emergingHypeScore > 0
            ? Math.round((emergingHypeScore * 0.85) + (externalTrendSignals.score * 0.15))
            : 0;
          const chartDrivenHypeScore = !hasUsableTrendData && externalTrendSignals.score >= 72 && audienceScore >= 60
            ? Math.round((externalTrendSignals.score * 0.78) + (audienceScore * 0.22))
            : 0;
          const shouldUseEmergingFallback = (emergingHypeWithExternalScore > 0 || chartDrivenHypeScore > 0)
            && (!hasUsableTrendData || measuredHypeScore <= 0);
          const fallbackHypeScore = Math.max(emergingHypeWithExternalScore, chartDrivenHypeScore);
          const hypeScore = shouldUseEmergingFallback ? fallbackHypeScore : measuredHypeScore;

          return {
            ...track,
            audienceScore,
            metricValue: hypeScore,
            trendDelta,
            trendPercent,
            hasTrendData: hasUsableTrendData,
            isEmergingHype: shouldUseEmergingFallback,
            externalMomentumScore: externalTrendSignals.score,
            externalMomentumSources: externalTrendSignals.sources,
            deezerChartPosition: externalTrendSignals.deezerChartPosition,
            audiusTrendingPosition: externalTrendSignals.audiusTrendingPosition,
            appleChartPosition: externalTrendSignals.appleChartPosition,
            lastfmChartPosition: externalTrendSignals.lastfmChartPosition,
            lastfmTagPositions: externalTrendSignals.lastfmTagPositions,
          };
        });

        rankedTracks = collapseVersions
          ? collapseFeedTrackVersions(legalMetricTracks, chooseTrackByMetric)
          : collapseFeedTracks(legalMetricTracks, chooseTrackByMetric);

        rankedTracks.sort((left, right) => right.track.metricValue - left.track.metricValue || right.track.trendDelta - left.track.trendDelta || right.track.popularity - left.track.popularity);
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
      } else {
        const periodMs = TREND_PERIODS[mode];
        const cutoff = new Date(Date.now() - periodMs);
        let oldSnapshots: Array<{ trackId: string; popularity: number; createdAt: Date }> = [];

        try {
          oldSnapshots = await prisma.trackSnapshot.findMany({
            where: {
              trackId: { in: allTracks.map((track) => track.id) },
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

  if (rankingModel === "legal") {
    const enrichedTracks = tracks.map(({ track, versions, primaryVersion }) => {
      const resolvedContributors = track.contributorIds
        .map((id: string) => contributorMap.get(id))
        .filter((artist: { id: string; name: string; imageUrl: string | null } | undefined): artist is { id: string; name: string; imageUrl: string | null } => !!artist);

      return {
        ...track,
        audienceScore: track.audienceScore,
        rank: rankByTrackId.get(track.id) ?? 0,
        versions,
        primaryVersion,
        metricValue: track.metricValue,
        trendDelta: track.trendDelta,
        trendPercent: track.trendPercent,
        hasTrendData: track.hasTrendData,
        isEmergingHype: track.isEmergingHype ?? false,
        externalMomentumScore: track.externalMomentumScore ?? 0,
        externalMomentumSources: track.externalMomentumSources ?? [],
        deezerChartPosition: track.deezerChartPosition ?? null,
        audiusTrendingPosition: track.audiusTrendingPosition ?? null,
        appleChartPosition: track.appleChartPosition ?? null,
        lastfmChartPosition: track.lastfmChartPosition ?? null,
        lastfmTagPositions: track.lastfmTagPositions ?? {},
        createdAt: track.createdAt,
        leaderboardMode: mode,
        contributors: resolvedContributors,
        artist: track.artist,
      };
    });

    return NextResponse.json(
      { tracks: enrichedTracks, totalCount, mode: mode === "popularity" ? "audience" : "hype" },
      {
        headers: {
          "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
        },
      }
    );
  }

  const deezerDetailEntries = await Promise.all(
    tracks.map(async ({ track }) => {
      if (!track.deezerId) return null;
      const deezerId = Number(track.deezerId);
      const cachedDeezer = deezerDetailCache.get(deezerId);
      if (cachedDeezer && now - cachedDeezer.timestamp < DEEZER_CACHE_TTL) {
        return cachedDeezer.data ? [track.id, cachedDeezer.data] as const : null;
      }
      const detail = await fetchDeezerTrackDetail(deezerId);
      deezerDetailCache.set(deezerId, { data: detail, timestamp: now });
      return detail ? [track.id, detail] as const : null;
    })
  );
  const deezerDetails = new Map(
    deezerDetailEntries.filter(
      (entry): entry is readonly [string, NonNullable<Awaited<ReturnType<typeof fetchDeezerTrackDetail>>>] => entry !== null
    )
  );

  const featuredArtistNames = dedupeNames([
    ...tracks.flatMap(({ track }) => track.featuredArtists),
    ...tracks.flatMap(({ track }) => deezerDetails.get(track.id)?.artists.map((artist) => artist.name) ?? []),
  ]);

  const deezerArtistIds = [...new Set(
    tracks.flatMap(({ track }) => deezerDetails.get(track.id)?.artists.map((artist) => artist.deezerId) ?? [])
  )];

  const forumArtistMatches = featuredArtistNames.length > 0 || deezerArtistIds.length > 0
    ? await prisma.artist.findMany({
        where: {
          OR: [
            ...featuredArtistNames.map((name) => ({
              name: { equals: name, mode: "insensitive" as const },
            })),
            ...(deezerArtistIds.length > 0 ? [{ deezerId: { in: deezerArtistIds } }] : []),
          ],
        },
        select: { id: true, name: true, imageUrl: true, deezerId: true },
      })
    : [];

  const forumArtistMap = new Map(
    forumArtistMatches.map((artist) => [normalizeName(artist.name), artist])
  );
  const forumArtistByDeezerId = new Map(
    forumArtistMatches
      .filter((artist) => typeof artist.deezerId === "number")
      .map((artist) => [artist.deezerId as number, artist])
  );

  const enrichedTracks = tracks.map(({ track, versions, primaryVersion }) => {
    const detail = deezerDetails.get(track.id);
    const detailVersions = detail?.fullTitle ? extractTrackVersions(detail.fullTitle) : [];
    const titleVersions = extractTrackVersions(track.name);
    const resolvedVersions = detailVersions.length > 0
      ? detailVersions
      : titleVersions.length > 0
        ? titleVersions
        : versions;
    const displayTitle = getDisplayTrackTitle(detail?.fullTitle ?? track.name);

    let displayArtists: DisplayArtist[] | undefined;
    let artist = track.artist;

    if (detail && detail.artists.length > 0) {
      const seenNames = new Set<string>();
      displayArtists = [];

      for (const credit of detail.artists) {
        const normalized = normalizeName(credit.name);
        if (seenNames.has(normalized)) continue;
        seenNames.add(normalized);

        const forumArtist = forumArtistByDeezerId.get(credit.deezerId) ?? forumArtistMap.get(normalized);
        if (forumArtist) {
          displayArtists.push({
            key: forumArtist.id,
            name: forumArtist.name,
            href: `/artist/${forumArtist.id}`,
            external: false,
          });
        } else {
          displayArtists.push({
            key: `deezer:${credit.deezerId}`,
            name: credit.name,
            href: `https://www.deezer.com/artist/${credit.deezerId}`,
            external: true,
          });
        }
      }

      const primaryCredit = detail.artists[0];
      const forumPrimaryArtist = forumArtistByDeezerId.get(primaryCredit.deezerId) ?? forumArtistMap.get(normalizeName(primaryCredit.name));
      if (forumPrimaryArtist) {
        artist = forumPrimaryArtist;
      } else {
        artist = {
          id: track.artist.id,
          name: primaryCredit.name,
          imageUrl: track.artist.imageUrl,
        };
      }
    }

    const seenNames = new Set<string>([normalizeName(artist.name)]);
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

      const forumArtist = forumArtistMap.get(normalized);
      if (forumArtist) {
        resolvedContributors.push(forumArtist);
        seenNames.add(normalized);
        continue;
      }

      seenNames.add(normalized);
      remainingFeaturedArtists.push(featuredArtist);
    }

    return {
      ...track,
      name: displayTitle,
      albumName: detail?.album.name ?? track.albumName,
      albumImageUrl: detail?.album.imageUrl ?? track.albumImageUrl,
      releaseDate: detail?.releaseDate ?? detail?.album.releaseDate ?? track.releaseDate,
      rank: rankByTrackId.get(track.id) ?? 0,
      versions: resolvedVersions,
      primaryVersion: resolvedVersions[0] ?? primaryVersion,
      metricValue: track.metricValue,
      trendDelta: track.trendDelta,
      trendPercent: track.trendPercent,
      hasTrendData: track.hasTrendData,
      createdAt: track.createdAt,
      leaderboardMode: mode,
      featuredArtists: remainingFeaturedArtists,
      contributors: resolvedContributors,
      artist,
      artists: displayArtists,
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
