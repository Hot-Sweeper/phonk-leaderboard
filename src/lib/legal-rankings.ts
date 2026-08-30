type ArtistTrackInput = {
  id?: string;
  artistId?: string;
  name?: string;
  albumName?: string | null;
  popularity: number;
  spotifyPopularity?: number;
  youtubeViews?: number;
  previewUrl?: string | null;
  durationMs?: number;
  releaseDate?: string | null;
  featuredArtists?: string[];
  contributorIds?: string[];
};

const TRACK_YOUTUBE_VIEW_MAX = 100_000_000;
export const TRACK_BREAKOUT_FIRST_SEEN_MAX_DAYS = 45;
const ARTIST_TRACK_AGE_HALF_LIFE_DAYS = 270;
const ARTIST_TRACK_MIN_WEIGHT = 0.2;

type ArtistScoreInput = {
  watchlistCount: number;
  youtubeSubscribers: number;
  tracks: ArtistTrackInput[];
  maxYoutubeSubscribers: number;
  maxWatchlistCount: number;
};

type ArtistScoreSummaryInput = {
  top5Average: number;
  top10Average: number;
  top20Average: number;
  catalogPopularityScore: number;
  strongTrackCount: number;
  activeTrackCount: number;
  recentReleaseCount: number;
  youtubeSubscribers: number;
  watchlistCount: number;
  maxYoutubeSubscribers: number;
  maxWatchlistCount: number;
  trackCount: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageTop(values: number[], count: number) {
  return average(values.slice(0, count));
}

function normalizeLog(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) return 0;
  return clamp((Math.log10(value + 1) / Math.log10(maxValue + 1)) * 100, 0, 100);
}

function getAgeInDays(releaseDate: string | null | undefined) {
  if (!releaseDate) return null;
  const parsed = Date.parse(releaseDate);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / (24 * 60 * 60 * 1000));
}

export function normalizePopularityForScore(popularity: number) {
  const normalized = popularity > 100 ? Math.min(100, popularity / 10000) : popularity;
  return clamp(normalized, 0, 100);
}

export function normalizeYouTubeViewsForScore(youtubeViews: number | null | undefined) {
  return Math.round(normalizeLog(Math.max(0, youtubeViews ?? 0), TRACK_YOUTUBE_VIEW_MAX));
}

export function getTrackSignalScore(
  track: Pick<ArtistTrackInput, "popularity" | "spotifyPopularity" | "youtubeViews">
) {
  const popularityFallback = normalizePopularityForScore(track.popularity);
  const hasSpotifySignal = (track.spotifyPopularity ?? 0) > 0;
  const hasYouTubeSignal = (track.youtubeViews ?? 0) > 0;
  const spotifyScore = hasSpotifySignal
    ? normalizePopularityForScore(track.spotifyPopularity ?? 0)
    : 0;
  const youtubeScore = normalizeYouTubeViewsForScore(track.youtubeViews);

  if (hasSpotifySignal && hasYouTubeSignal) {
    return Math.round(clamp((spotifyScore * 0.68) + (youtubeScore * 0.32), 0, 100));
  }

  if (hasSpotifySignal) {
    return spotifyScore;
  }

  if (hasYouTubeSignal) {
    return youtubeScore;
  }

  return popularityFallback;
}

export function getRecencyScore(releaseDate: string | null | undefined) {
  const ageInDays = getAgeInDays(releaseDate);
  if (ageInDays == null) return 25;
  if (ageInDays <= 30) return 100;
  if (ageInDays <= 90) return 78;
  if (ageInDays <= 180) return 55;
  if (ageInDays <= 365) return 32;
  return 12;
}

export function isRecentlyReleased(releaseDate: string | null | undefined, days: number) {
  const ageInDays = getAgeInDays(releaseDate);
  return ageInDays != null && ageInDays <= days;
}

const ARTIST_PLATFORM_MAX = 10_000_000;

type AudienceScoreFallbackMode = "default" | "strictLegacyPopularity";

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

export function getTrackAudienceScore(
  track: Pick<ArtistTrackInput, "popularity" | "releaseDate" | "previewUrl">,
  _signal: "composite" | "spotify" | "youtube" = "composite",
  _fallbackMode: AudienceScoreFallbackMode = "default"
) {
  void _signal;
  void _fallbackMode;
  const recencyScore = getRecencyScore(track.releaseDate);
  const previewScore = track.previewUrl ? 100 : 0;
  const popularityScore = normalizePopularityForScore(track.popularity);

  return Math.round(
    popularityScore * 0.72 +
    recencyScore * 0.2 +
    previewScore * 0.08
  );
}

function getArtistTrackWeight(releaseDate: string | null | undefined) {
  const ageInDays = getAgeInDays(releaseDate);
  if (ageInDays == null) return 0.35;

  return clamp(
    Math.pow(0.5, ageInDays / ARTIST_TRACK_AGE_HALF_LIFE_DAYS),
    ARTIST_TRACK_MIN_WEIGHT,
    1
  );
}

function getArtistTrackPopularityValue(
  track: Pick<ArtistTrackInput, "popularity" | "spotifyPopularity" | "releaseDate" | "previewUrl">
) {
  if ((track.spotifyPopularity ?? 0) <= 0) {
    return track.popularity;
  }

  return getTrackAudienceScore({
    popularity: track.spotifyPopularity ?? 0,
    releaseDate: track.releaseDate,
    previewUrl: track.previewUrl,
  });
}

function getAgeWeightedArtistPopularityAverage(
  tracks: Array<Pick<ArtistTrackInput, "popularity" | "spotifyPopularity" | "releaseDate" | "previewUrl">>
) {
  if (tracks.length === 0) return 0;

  let weightedTotal = 0;
  let weightTotal = 0;

  for (const track of tracks) {
    const weight = getArtistTrackWeight(track.releaseDate);
    const score = getArtistTrackPopularityValue(track);
    weightedTotal += score * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) return 0;
  return weightedTotal / weightTotal;
}

export function getTrackHypeScore(
  track: Pick<ArtistTrackInput, "popularity" | "spotifyPopularity" | "youtubeViews" | "releaseDate" | "previewUrl"> & {
    previousPopularity?: number | null;
    previousSpotifyPopularity?: number | null;
    previousYoutubeViews?: number | null;
  }
) {
  const currentSignalScore = getTrackSignalScore(track);
  const previousSignalScore = (() => {
    if ((track.previousSpotifyPopularity ?? 0) > 0 || (track.previousYoutubeViews ?? 0) > 0) {
      return getTrackSignalScore({
        popularity: track.previousPopularity ?? 0,
        spotifyPopularity: track.previousSpotifyPopularity ?? undefined,
        youtubeViews: track.previousYoutubeViews ?? undefined,
      });
    }

    const previousPopularity = track.previousPopularity ?? null;
    if (previousPopularity == null || previousPopularity <= 0) {
      return null;
    }

    return normalizePopularityForScore(previousPopularity);
  })();

  if (previousSignalScore == null || previousSignalScore <= 0 || currentSignalScore <= 0) {
    return 0;
  }

  const trendDelta = currentSignalScore - previousSignalScore;
  const trendPercent = ((currentSignalScore - previousSignalScore) / previousSignalScore) * 100;

  if (trendDelta <= 0) {
    return 0;
  }

  const currentSpotifyScore = (track.spotifyPopularity ?? 0) > 0
    ? normalizePopularityForScore(track.spotifyPopularity ?? 0)
    : null;
  const previousSpotifyScore = (() => {
    if ((track.previousSpotifyPopularity ?? 0) > 0) {
      return normalizePopularityForScore(track.previousSpotifyPopularity ?? 0);
    }
    return null;
  })();
  const spotifyDeltaScore = currentSpotifyScore != null && previousSpotifyScore != null && currentSpotifyScore > previousSpotifyScore
    ? clamp(((currentSpotifyScore - previousSpotifyScore) / 18) * 100, 0, 100)
    : 0;
  const spotifyPercentScore = currentSpotifyScore != null && previousSpotifyScore != null && currentSpotifyScore > previousSpotifyScore
    ? clamp(((((currentSpotifyScore - previousSpotifyScore) / Math.max(previousSpotifyScore, 1)) * 100) / 120) * 100, 0, 100)
    : 0;

  const currentYouTubeScore = normalizeYouTubeViewsForScore(track.youtubeViews);
  const previousYouTubeScore = (track.previousYoutubeViews ?? 0) > 0
    ? normalizeYouTubeViewsForScore(track.previousYoutubeViews)
    : null;
  const youtubeDeltaScore = previousYouTubeScore != null && currentYouTubeScore > previousYouTubeScore
    ? clamp(((currentYouTubeScore - previousYouTubeScore) / 30) * 100, 0, 100)
    : 0;
  const youtubePercentScore = previousYouTubeScore != null && currentYouTubeScore > previousYouTubeScore
    ? clamp(((((currentYouTubeScore - previousYouTubeScore) / Math.max(previousYouTubeScore, 1)) * 100) / 200) * 100, 0, 100)
    : 0;

  const ageInDays = getAgeInDays(track.releaseDate);
  const deltaScore = clamp((trendDelta / 18) * 100, 0, 100);
  const percentScore = clamp((trendPercent / 120) * 100, 0, 100);
  const signalScore = currentSignalScore;
  const freshnessScore = (() => {
    if (ageInDays == null) return 18;
    if (ageInDays <= 14) return 100;
    if (ageInDays <= 30) return 92;
    if (ageInDays <= 60) return 78;
    if (ageInDays <= 90) return 60;
    if (ageInDays <= 180) return 36;
    if (ageInDays <= 365) return 18;
    return 8;
  })();

  const decayMultiplier = (() => {
    if (ageInDays == null) return 0.4;
    if (ageInDays <= 14) return 1.25;
    if (ageInDays <= 30) return 1.1;
    if (ageInDays <= 60) return 0.92;
    if (ageInDays <= 90) return 0.72;
    if (ageInDays <= 180) return 0.46;
    if (ageInDays <= 365) return 0.24;
    return 0.12;
  })();

  const ageAdjustedDeltaScore = clamp(deltaScore * decayMultiplier, 0, 100);
  const ageAdjustedPercentScore = clamp(percentScore * Math.max(0.18, decayMultiplier), 0, 100);
  const rawDeltaScore = clamp((spotifyDeltaScore * 0.55) + (youtubeDeltaScore * 0.45), 0, 100);
  const rawPercentScore = clamp((spotifyPercentScore * 0.45) + (youtubePercentScore * 0.55), 0, 100);

  return Math.round(
    ageAdjustedDeltaScore * 0.35 +
    ageAdjustedPercentScore * 0.15 +
    rawDeltaScore * 0.2 +
    rawPercentScore * 0.1 +
    freshnessScore * 0.12 +
    signalScore * 0.08
  );
}

export function getHypeLeaderboardPopularityScore(
  track: Pick<ArtistTrackInput, "popularity" | "spotifyPopularity">
) {
  const spotifyScore = normalizePopularityForScore(track.spotifyPopularity ?? 0);
  const internalScore = normalizePopularityForScore(track.popularity);

  // Spotify removed track popularity from Development Mode responses in 2026.
  // Keep existing Spotify values authoritative, but allow newly discovered tracks
  // to participate in hype rankings using the app's internal catalog score.
  return Math.round(spotifyScore > 0 ? spotifyScore : internalScore);
}

export function getHypeLeaderboardHypeScore(
  track: Pick<ArtistTrackInput, "popularity" | "spotifyPopularity" | "releaseDate">,
  trendPercent: number,
  period: "day" | "week" | "month" = "week"
) {
  const baseScore = getHypeLeaderboardPopularityScore(track);
  const ageInDays = getAgeInDays(track.releaseDate);

  if (baseScore <= 0 || ageInDays == null) {
    return 0;
  }

  const ageMultiplier = (() => {
    if (period === "day") {
      if (ageInDays <= 2) return 1.4;
      if (ageInDays <= 5) return 1.05;
      if (ageInDays <= 10) return 0.62;
      if (ageInDays <= 21) return 0.28;
      if (ageInDays <= 45) return 0.08;
      if (ageInDays <= 90) return 0.04;
      if (ageInDays <= 180) return 0.02;
      return 0;
    }

    if (period === "month") {
      if (ageInDays <= 7) return 1.1;
      if (ageInDays <= 14) return 1.02;
      if (ageInDays <= 30) return 0.92;
      if (ageInDays <= 60) return 0.65;
      if (ageInDays <= 90) return 0.35;
      if (ageInDays <= 180) return 0.1;
      return 0;
    }

    if (ageInDays <= 7) return 1.2;
    if (ageInDays <= 14) return 1.05;
    if (ageInDays <= 30) return 0.78;
    if (ageInDays <= 45) return 0.55;
    if (ageInDays <= 60) return 0.36;
    if (ageInDays <= 90) return 0.18;
    if (ageInDays <= 120) return 0.08;
    if (ageInDays <= 180) return 0.03;
    return 0;
  })();

  const freshnessBonus = (() => {
    if (period === "day") {
      if (ageInDays <= 2) return 32;
      if (ageInDays <= 5) return 24;
      if (ageInDays <= 10) return 10;
      return 0;
    }

    if (period === "month") {
      if (ageInDays <= 7) return 18;
      if (ageInDays <= 14) return 16;
      if (ageInDays <= 30) return 14;
      if (ageInDays <= 60) return 8;
      return 0;
    }

    if (ageInDays <= 7) return 24;
    if (ageInDays <= 14) return 18;
    if (ageInDays <= 30) return 12;
    if (ageInDays <= 45) return 6;
    if (ageInDays <= 60) return 2;
    return 0;
  })();

  const velocityMultiplier = (() => {
    if (period === "day") {
      if (ageInDays <= 10) return 1.25;
      if (ageInDays <= 21) return 0.5;
      if (ageInDays <= 45) return 0.25;
      if (ageInDays <= 90) return 0.12;
      if (ageInDays <= 180) return 0.05;
      return 0;
    }

    if (period === "month") {
      if (ageInDays <= 30) return 0.85;
      if (ageInDays <= 90) return 0.55;
      if (ageInDays <= 180) return 0.2;
      return 0;
    }

    if (ageInDays <= 30) return 1;
    if (ageInDays <= 60) return 0.7;
    if (ageInDays <= 90) return 0.35;
    if (ageInDays <= 180) return 0.1;
    return 0;
  })();

  const velocityBonus = trendPercent > 0
    ? clamp((trendPercent / 100) * 40, 0, 35) * velocityMultiplier
    : 0;

  const underdogBonus = trendPercent >= 20 && ageInDays <= 60 && baseScore < 65
    ? clamp(((65 - baseScore) / 65) * 12, 0, 12) * velocityMultiplier
    : 0;

  return Math.round(clamp((baseScore * ageMultiplier) + freshnessBonus + velocityBonus + underdogBonus, 0, 100));
}

export function getEmergingTrackHypeScore(
  track: Pick<ArtistTrackInput, "popularity" | "spotifyPopularity" | "youtubeViews" | "releaseDate" | "previewUrl"> & {
    firstSeenAt?: string | Date | null;
  }
) {
  const signalScore = getTrackSignalScore(track);
  const ageInDays = getAgeInDays(track.releaseDate);
  const audienceScore = getTrackAudienceScore(track);
  const breakoutReadinessScore = Math.round(clamp((signalScore * 0.75) + (audienceScore * 0.25), 0, 100));
  if (breakoutReadinessScore < 55) {
    return 0;
  }

  const firstSeenDays = (() => {
    if (!track.firstSeenAt) return null;
    const parsed = new Date(track.firstSeenAt).getTime();
    if (Number.isNaN(parsed)) return null;
    return Math.max(0, (Date.now() - parsed) / (24 * 60 * 60 * 1000));
  })();

  if (firstSeenDays != null && firstSeenDays > TRACK_BREAKOUT_FIRST_SEEN_MAX_DAYS) {
    return 0;
  }

  const maxEligibleAgeDays = breakoutReadinessScore >= 72 ? 90 : 75;
  if (ageInDays == null || ageInDays > maxEligibleAgeDays) {
    return 0;
  }

  const breakoutWindowScore = (() => {
    if (ageInDays <= 14) return 100;
    if (ageInDays <= 30) return 82;
    if (ageInDays <= 45) return 68;
    if (ageInDays <= 60) return 56;
    return 40;
  })();

  const firstSeenBoost = (() => {
    if (firstSeenDays == null) return 0;
    if (firstSeenDays <= 3) return 100;
    if (firstSeenDays <= 7) return 82;
    if (firstSeenDays <= 14) return 68;
    if (firstSeenDays <= 30) return 60;
    if (firstSeenDays <= TRACK_BREAKOUT_FIRST_SEEN_MAX_DAYS) return 52;
    return 0;
  })();

  return Math.round(
    breakoutReadinessScore * 0.62 +
    breakoutWindowScore * 0.26 +
    firstSeenBoost * 0.12
  );
}

export function getArtistAudienceScoreFromSummary(input: ArtistScoreSummaryInput) {
  const topTracksScore =
    input.top5Average * 0.5 +
    input.top10Average * 0.3 +
    input.top20Average * 0.2;

  const depthScore = clamp(input.strongTrackCount * 14 + input.activeTrackCount * 4, 0, 100);
  const releaseScore = clamp(input.recentReleaseCount * 34, 0, 100);
  const youtubeScore = normalizeLog(input.youtubeSubscribers, input.maxYoutubeSubscribers);
  const watchlistScore = normalizeLog(input.watchlistCount, input.maxWatchlistCount);

  const audienceScore = Math.round(input.catalogPopularityScore);

  return {
    audienceScore,
    topTracksScore: Math.round(topTracksScore),
    catalogPopularityScore: Math.round(input.catalogPopularityScore),
    depthScore: Math.round(depthScore),
    releaseScore: Math.round(releaseScore),
    youtubeScore: Math.round(youtubeScore),
    watchlistScore: Math.round(watchlistScore),
    trackCount: input.trackCount,
  };
}

export function getArtistAudienceScore(input: ArtistScoreInput) {
  const trackScores = input.tracks
    .map((track) => getArtistTrackPopularityValue(track))
    .sort((left, right) => right - left);
  const catalogPopularityScore = getAgeWeightedArtistPopularityAverage(input.tracks);

  const strongTracks = trackScores.filter((score) => score >= 65).length;
  const activeTracks = trackScores.filter((score) => score >= 45).length;
  const recentReleases = input.tracks.filter((track) => isRecentlyReleased(track.releaseDate, 90)).length;
  return getArtistAudienceScoreFromSummary({
    top5Average: averageTop(trackScores, 5),
    top10Average: averageTop(trackScores, 10),
    top20Average: averageTop(trackScores, 20),
    catalogPopularityScore,
    strongTrackCount: strongTracks,
    activeTrackCount: activeTracks,
    recentReleaseCount: recentReleases,
    youtubeSubscribers: input.youtubeSubscribers,
    watchlistCount: input.watchlistCount,
    maxYoutubeSubscribers: input.maxYoutubeSubscribers,
    maxWatchlistCount: input.maxWatchlistCount,
    trackCount: input.tracks.length,
  });
}

export type ArtistInternalSnapshotInput = {
  popularityIndex: number;
  hypeIndex: number;
};

type ArtistInternalMetricsInput = {
  watchlistCount: number;
  maxWatchlistCount: number;
  tracks: Pick<ArtistTrackInput, "popularity" | "spotifyPopularity" | "releaseDate" | "previewUrl">[];
  previousSnapshot?: Partial<ArtistInternalSnapshotInput> | null;
};

export function getArtistInternalMetrics(input: ArtistInternalMetricsInput) {
  const trackScores = input.tracks
    .map((track) => getArtistTrackPopularityValue(track))
    .sort((left, right) => right - left);

  const catalogPopularityScore = getAgeWeightedArtistPopularityAverage(input.tracks);
  const strongTrackCount = trackScores.filter((score) => score >= 65).length;
  const activeTrackCount = trackScores.filter((score) => score >= 45).length;
  const recentReleaseCount = input.tracks.filter((track) => isRecentlyReleased(track.releaseDate, 90)).length;
  const breakoutTrackCount = input.tracks.filter((track) => getEmergingTrackHypeScore(track) >= 55).length;

  const audience = getArtistAudienceScoreFromSummary({
    top5Average: averageTop(trackScores, 5),
    top10Average: averageTop(trackScores, 10),
    top20Average: averageTop(trackScores, 20),
    catalogPopularityScore,
    strongTrackCount,
    activeTrackCount,
    recentReleaseCount,
    youtubeSubscribers: 0,
    watchlistCount: input.watchlistCount,
    maxYoutubeSubscribers: 1,
    maxWatchlistCount: Math.max(1, input.maxWatchlistCount),
    trackCount: input.tracks.length,
  });

  const popularityScore = Math.round(catalogPopularityScore);
  const previousPopularity = input.previousSnapshot?.popularityIndex ?? null;
  const previousHype = input.previousSnapshot?.hypeIndex ?? null;

  const popularityChangeValue = previousPopularity != null ? popularityScore - previousPopularity : 0;
  const popularityChangePercent = previousPopularity != null && previousPopularity > 0
    ? roundPercent(((popularityScore - previousPopularity) / previousPopularity) * 100)
    : 0;

  const watchlistScore = normalizeLog(input.watchlistCount, Math.max(1, input.maxWatchlistCount));
  const breakoutScore = clamp(breakoutTrackCount * 24, 0, 100);
  const releaseScore = clamp(recentReleaseCount * 28, 0, 100);
  const activeScore = clamp(activeTrackCount * 6, 0, 100);
  const growthScore = previousPopularity != null && previousPopularity > 0
    ? clamp(((popularityChangePercent + 20) / 1.6), 0, 100)
    : breakoutScore * 0.75;

  const hypeScore = Math.round(clamp(
    growthScore * 0.45 +
    breakoutScore * 0.25 +
    releaseScore * 0.15 +
    activeScore * 0.08 +
    watchlistScore * 0.04 +
    popularityScore * 0.03,
    0,
    100
  ));

  const hypeChangeValue = previousHype != null ? hypeScore - previousHype : breakoutTrackCount > 0 ? hypeScore : 0;
  const hypeChangePercent = previousHype != null && previousHype > 0
    ? roundPercent(((hypeScore - previousHype) / previousHype) * 100)
    : previousPopularity != null && previousPopularity > 0
      ? popularityChangePercent
      : breakoutTrackCount > 0
        ? roundPercent(breakoutTrackCount * 10)
        : 0;

  return {
    ...audience,
    popularityScore,
    popularityChangeValue,
    popularityChangePercent,
    hasPopularityTrendData: previousPopularity != null,
    hypeScore,
    hypeChangeValue,
    hypeChangePercent,
    hasHypeData: previousHype != null || previousPopularity != null || breakoutTrackCount > 0,
    breakoutTrackCount,
    strongTrackCount,
    activeTrackCount,
    recentReleaseCount,
  };
}

export type ArtistPlatformSnapshotInput = {
  monthlyListeners: number;
  followerCount: number;
  youtubeSubscribers: number;
  tiktokFollowers: number;
  instagramFollowers: number;
};

type ArtistHypeMetrics = {
  hypeScore: number;
  changePercent: number;
  changeValue: number;
  hasData: boolean;
};

function getPlatformPercentChange(current: number, previous: number) {
  if (current <= 0 && previous <= 0) return 0;
  if (previous <= 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function getArtistPlatformPopularityScore(input: ArtistPlatformSnapshotInput) {
  const spotifyReach = normalizeLog(input.monthlyListeners, ARTIST_PLATFORM_MAX);
  const spotifyFollowers = normalizeLog(input.followerCount, ARTIST_PLATFORM_MAX);
  const youtubeReach = normalizeLog(input.youtubeSubscribers, ARTIST_PLATFORM_MAX);
  const tiktokReach = normalizeLog(input.tiktokFollowers, ARTIST_PLATFORM_MAX);
  const instagramReach = normalizeLog(input.instagramFollowers, ARTIST_PLATFORM_MAX);

  return Math.round(clamp(
    spotifyReach * 0.44 +
    youtubeReach * 0.28 +
    tiktokReach * 0.14 +
    instagramReach * 0.09 +
    spotifyFollowers * 0.05,
    0,
    100
  ));
}

export function getArtistPlatformHypeMetrics(
  current: ArtistPlatformSnapshotInput,
  previous?: Partial<ArtistPlatformSnapshotInput> | null
): ArtistHypeMetrics {
  if (!previous) {
    return {
      hypeScore: 0,
      changePercent: 0,
      changeValue: 0,
      hasData: false,
    };
  }

  const metrics = [
    { current: current.monthlyListeners, previous: previous.monthlyListeners ?? 0, weight: 0.42 },
    { current: current.youtubeSubscribers, previous: previous.youtubeSubscribers ?? 0, weight: 0.28 },
    { current: current.tiktokFollowers, previous: previous.tiktokFollowers ?? 0, weight: 0.16 },
    { current: current.instagramFollowers, previous: previous.instagramFollowers ?? 0, weight: 0.09 },
    { current: current.followerCount, previous: previous.followerCount ?? 0, weight: 0.05 },
  ];

  let weightedPercent = 0;
  let weightedGrowthScore = 0;
  let activeWeight = 0;
  let breakoutSignals = 0;

  for (const metric of metrics) {
    if (metric.current <= 0 && metric.previous <= 0) continue;

    const percentChange = getPlatformPercentChange(metric.current, metric.previous);
    const boundedPercent = clamp(percentChange, -95, 220);
    const presenceScore = normalizeLog(metric.current, ARTIST_PLATFORM_MAX);
    const growthScore = clamp(((boundedPercent + 20) / 1.8) * 0.74 + presenceScore * 0.26, 0, 100);

    weightedPercent += boundedPercent * metric.weight;
    weightedGrowthScore += growthScore * metric.weight;
    activeWeight += metric.weight;

    if (boundedPercent >= 22 && presenceScore >= 28) {
      breakoutSignals += 1;
    }
  }

  if (activeWeight === 0) {
    return {
      hypeScore: 0,
      changePercent: 0,
      changeValue: 0,
      hasData: false,
    };
  }

  const averagePercent = weightedPercent / activeWeight;
  const breakoutBoost = Math.min(12, breakoutSignals * 4);
  const hypeScore = Math.round(clamp((weightedGrowthScore / activeWeight) + breakoutBoost, 0, 100));

  return {
    hypeScore,
    changePercent: Math.round(averagePercent * 100) / 100,
    changeValue: Math.round((hypeScore - 50) * 100) / 100,
    hasData: true,
  };
}
