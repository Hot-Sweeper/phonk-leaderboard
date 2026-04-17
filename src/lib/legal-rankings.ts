import { dedupeArtistTracks } from "@/lib/track-dedupe";

type ArtistTrackInput = {
  id: string;
  artistId: string;
  name: string;
  albumName?: string | null;
  popularity: number;
  previewUrl?: string | null;
  durationMs?: number;
  releaseDate?: string | null;
  featuredArtists?: string[];
  contributorIds?: string[];
};

type ArtistScoreInput = {
  watchlistCount: number;
  youtubeSubscribers: number;
  tracks: ArtistTrackInput[];
  maxYoutubeSubscribers: number;
  maxWatchlistCount: number;
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

export function getTrackAudienceScore(track: Pick<ArtistTrackInput, "popularity" | "releaseDate" | "previewUrl">) {
  const popularityScore = normalizePopularityForScore(track.popularity);
  const recencyScore = getRecencyScore(track.releaseDate);
  const previewScore = track.previewUrl ? 100 : 0;

  return Math.round(
    popularityScore * 0.8 +
    recencyScore * 0.15 +
    previewScore * 0.05
  );
}

export function getTrackHypeScore(track: Pick<ArtistTrackInput, "popularity" | "releaseDate" | "previewUrl"> & { previousPopularity?: number | null }) {
  const previousPopularity = track.previousPopularity ?? null;
  if (previousPopularity == null || previousPopularity <= 0 || track.popularity <= 0) {
    return 0;
  }

  const trendDelta = track.popularity - previousPopularity;
  const trendPercent = ((track.popularity - previousPopularity) / previousPopularity) * 100;

  if (trendDelta <= 0) {
    return 0;
  }

  const ageInDays = getAgeInDays(track.releaseDate);
  const deltaScore = clamp((trendDelta / 18) * 100, 0, 100);
  const percentScore = clamp((trendPercent / 120) * 100, 0, 100);
  const audienceScore = getTrackAudienceScore(track);
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
  const earlyBreakoutScore = clamp(((ageAdjustedDeltaScore * 0.65) + (freshnessScore * 0.35)), 0, 100);

  return Math.round(
    ageAdjustedDeltaScore * 0.45 +
    ageAdjustedPercentScore * 0.2 +
    freshnessScore * 0.2 +
    earlyBreakoutScore * 0.1 +
    audienceScore * 0.05
  );
}

export function getEmergingTrackHypeScore(track: Pick<ArtistTrackInput, "popularity" | "releaseDate" | "previewUrl"> & { firstSeenAt?: string | Date | null }) {
  const ageInDays = getAgeInDays(track.releaseDate);
  const audienceScore = getTrackAudienceScore(track);
  if (audienceScore < 55) {
    return 0;
  }

  const firstSeenDays = (() => {
    if (!track.firstSeenAt) return null;
    const parsed = new Date(track.firstSeenAt).getTime();
    if (Number.isNaN(parsed)) return null;
    return Math.max(0, (Date.now() - parsed) / (24 * 60 * 60 * 1000));
  })();

  if (firstSeenDays != null && firstSeenDays > 7) {
    return 0;
  }

  const maxEligibleAgeDays = audienceScore >= 72 ? 90 : 75;
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
    if (firstSeenDays <= 2) return 100;
    if (firstSeenDays <= 4) return 82;
    if (firstSeenDays <= 7) return 60;
    return 0;
  })();

  return Math.round(
    audienceScore * 0.68 +
    breakoutWindowScore * 0.24 +
    firstSeenBoost * 0.08
  );
}

export function getArtistAudienceScore(input: ArtistScoreInput) {
  const dedupedTracks = dedupeArtistTracks(input.tracks);
  const trackScores = dedupedTracks
    .map((track) => getTrackAudienceScore(track))
    .sort((left, right) => right - left);

  const topTracksScore =
    averageTop(trackScores, 5) * 0.5 +
    averageTop(trackScores, 10) * 0.3 +
    averageTop(trackScores, 20) * 0.2;

  const strongTracks = trackScores.filter((score) => score >= 65).length;
  const activeTracks = trackScores.filter((score) => score >= 45).length;
  const depthScore = clamp(strongTracks * 14 + activeTracks * 4, 0, 100);

  const recentReleases = dedupedTracks.filter((track) => isRecentlyReleased(track.releaseDate, 90)).length;
  const releaseScore = clamp(recentReleases * 34, 0, 100);

  const youtubeScore = normalizeLog(input.youtubeSubscribers, input.maxYoutubeSubscribers);
  const watchlistScore = normalizeLog(input.watchlistCount, input.maxWatchlistCount);

  const audienceScore = Math.round(
    topTracksScore * 0.82 +
    depthScore * 0.12 +
    releaseScore * 0.03 +
    youtubeScore * 0.02 +
    watchlistScore * 0.01
  );

  return {
    audienceScore,
    topTracksScore: Math.round(topTracksScore),
    depthScore: Math.round(depthScore),
    releaseScore: Math.round(releaseScore),
    youtubeScore: Math.round(youtubeScore),
    watchlistScore: Math.round(watchlistScore),
    trackCount: dedupedTracks.length,
  };
}