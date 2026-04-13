type TrackLike = {
  id?: string;
  artistId?: string;
  name: string;
  albumName?: string | null;
  popularity: number;
  previewUrl?: string | null;
  durationMs?: number;
  releaseDate?: string | null;
  featuredArtists?: string[];
  contributorIds?: string[];
};

const VERSION_HINTS = [
  "slowed",
  "speed up",
  "sped up",
  "nightcore",
  "super slowed",
  "ultra slowed",
  "reverb",
  "remix",
  "edit",
  "extended",
  "instrumental",
  "phonk version",
  "version",
];

const GENERIC_VERSION_LABELS = new Set([
  "edit",
  "edit version",
  "version",
  "versions",
  "remixes",
]);

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toDisplayLabel(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasVersionHint(value: string) {
  const normalized = normalizeText(value);
  return VERSION_HINTS.some((hint) => normalized.includes(hint));
}

function sanitizeVersionLabel(value: string) {
  const normalized = normalizeText(value)
    .replace(/\bversions?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized || GENERIC_VERSION_LABELS.has(normalized)) {
    return null;
  }

  return toDisplayLabel(normalized);
}

export function getCanonicalTrackTitle(title: string) {
  let normalized = normalizeText(title);

  normalized = normalized.replace(/\[(.*?)\]/g, (full, inner) => {
    return hasVersionHint(inner) ? "" : full;
  });

  normalized = normalized.replace(/\((.*?)\)/g, (full, inner) => {
    return hasVersionHint(inner) ? "" : full;
  });

  normalized = normalized.replace(/\s+-\s+(.+)$/g, (full, suffix) => {
    return hasVersionHint(suffix) ? "" : full;
  });
  normalized = normalized.replace(/[^a-z0-9]+/g, " ");
  return normalized.trim();
}

export function getDisplayTrackTitle(title: string) {
  let displayTitle = title.trim();

  displayTitle = displayTitle.replace(/\s*[\[(]([^\])]+)[\])]\s*/g, (full, inner) => {
    return hasVersionHint(inner) ? " " : full;
  });

  displayTitle = displayTitle.replace(/\s+-\s+(.+)$/g, (full, suffix) => {
    return hasVersionHint(suffix) ? "" : full;
  });

  return displayTitle.replace(/\s+/g, " ").trim();
}

function getTrackIdentityTitle(title: string) {
  return normalizeText(title)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getFeedArtistSignature(track: Pick<TrackLike, "artistId" | "contributorIds" | "featuredArtists">) {
  const ids = [track.artistId, ...(track.contributorIds ?? [])]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => `id:${value}`);

  const names = (track.featuredArtists ?? [])
    .map((name) => normalizeText(name))
    .filter(Boolean)
    .map((name) => `name:${name}`);

  return [...new Set([...ids, ...names])].sort().join("|");
}

export function extractTrackVersions(title: string, _albumName?: string | null) {
  const labels: string[] = [];
  const candidates = [title];

  for (const candidate of candidates) {
    const bracketSegments = [...candidate.matchAll(/[\[(]([^\])]+)[\])]/g)].map((match) => match[1]);
    const dashedSegment = candidate.match(/\s+-\s+(.+)$/)?.[1];

    for (const rawSegment of [...bracketSegments, dashedSegment].filter(Boolean) as string[]) {
      for (const part of rawSegment.split(/[\/|,]+/)) {
        const normalized = normalizeText(part);
        if (!VERSION_HINTS.some((hint) => normalized.includes(hint))) continue;

        const label = sanitizeVersionLabel(part);
        if (label) {
          labels.push(label);
        }
      }
    }
  }

  const normalizedTitle = normalizeText(title);
  if (labels.length === 0) {
    for (const hint of VERSION_HINTS) {
      if (normalizedTitle.includes(hint)) {
        const label = sanitizeVersionLabel(hint);
        if (label) {
          labels.push(label);
        }
      }
    }
  }

  return dedupeNames(labels);
}

function getVariantPenalty(title: string) {
  const normalized = normalizeText(title);
  let penalty = 0;

  for (const hint of VERSION_HINTS) {
    if (normalized.includes(hint)) penalty += 10;
  }

  if (/\(|\)|\[|\]/.test(title)) penalty += 2;
  return penalty;
}

function preferTrack<T extends TrackLike>(left: T, right: T) {
  const leftPenalty = getVariantPenalty(left.name);
  const rightPenalty = getVariantPenalty(right.name);
  if (leftPenalty !== rightPenalty) return leftPenalty < rightPenalty ? left : right;

  const leftPreview = left.previewUrl ? 1 : 0;
  const rightPreview = right.previewUrl ? 1 : 0;
  if (leftPreview !== rightPreview) return leftPreview > rightPreview ? left : right;

  const leftArtistCount = (left.featuredArtists?.length ?? 0) + (left.contributorIds?.length ?? 0);
  const rightArtistCount = (right.featuredArtists?.length ?? 0) + (right.contributorIds?.length ?? 0);
  if (leftArtistCount !== rightArtistCount) return leftArtistCount > rightArtistCount ? left : right;

  if (left.popularity !== right.popularity) return left.popularity > right.popularity ? left : right;

  const leftDuration = left.durationMs ?? 0;
  const rightDuration = right.durationMs ?? 0;
  if (leftDuration !== rightDuration) return leftDuration > rightDuration ? left : right;

  const leftRelease = left.releaseDate ?? "";
  const rightRelease = right.releaseDate ?? "";
  if (leftRelease !== rightRelease) return leftRelease > rightRelease ? left : right;

  return left;
}

function preferHighestScoringTrack<T extends TrackLike>(left: T, right: T) {
  if (left.popularity !== right.popularity) return left.popularity > right.popularity ? left : right;

  const leftPreview = left.previewUrl ? 1 : 0;
  const rightPreview = right.previewUrl ? 1 : 0;
  if (leftPreview !== rightPreview) return leftPreview > rightPreview ? left : right;

  const leftArtistCount = (left.featuredArtists?.length ?? 0) + (left.contributorIds?.length ?? 0);
  const rightArtistCount = (right.featuredArtists?.length ?? 0) + (right.contributorIds?.length ?? 0);
  if (leftArtistCount !== rightArtistCount) return leftArtistCount > rightArtistCount ? left : right;

  const leftPenalty = getVariantPenalty(left.name);
  const rightPenalty = getVariantPenalty(right.name);
  if (leftPenalty !== rightPenalty) return leftPenalty < rightPenalty ? left : right;

  const leftDuration = left.durationMs ?? 0;
  const rightDuration = right.durationMs ?? 0;
  if (leftDuration !== rightDuration) return leftDuration > rightDuration ? left : right;

  const leftRelease = left.releaseDate ?? "";
  const rightRelease = right.releaseDate ?? "";
  if (leftRelease !== rightRelease) return leftRelease > rightRelease ? left : right;

  return left;
}

export function dedupeArtistTracks<T extends TrackLike>(tracks: T[]) {
  const byCanonical = new Map<string, T>();

  for (const track of tracks) {
    const canonical = getTrackIdentityTitle(track.name);
    const current = byCanonical.get(canonical);
    byCanonical.set(canonical, current ? preferTrack(current, track) : track);
  }

  return [...byCanonical.values()].sort((a, b) => b.popularity - a.popularity);
}

export function dedupeFeedTracks<T extends TrackLike & { artistId: string }>(tracks: T[]) {
  const byCanonical = new Map<string, T>();

  for (const track of tracks) {
    const canonical = `${track.artistId}::${getTrackIdentityTitle(track.name)}`;
    const current = byCanonical.get(canonical);
    byCanonical.set(canonical, current ? preferTrack(current, track) : track);
  }

  return [...byCanonical.values()].sort((a, b) => b.popularity - a.popularity);
}

type CollapsedTrack<T> = {
  track: T;
  versions: string[];
  primaryVersion: string;
};

function collapseTracks<T extends TrackLike>(
  tracks: T[],
  keyBuilder: (track: T) => string,
  chooseTrack: (left: T, right: T) => T = preferTrack,
): CollapsedTrack<T>[] {
  const grouped = new Map<string, T[]>();

  for (const track of tracks) {
    const key = keyBuilder(track);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(track);
  }

  return [...grouped.values()]
    .map((group) => {
      const chosen = group.reduce((best, current) => chooseTrack(best, current));
      const chosenVersions = extractTrackVersions(chosen.name, chosen.albumName);
      const versions = chosenVersions.length > 0 ? chosenVersions : ["Original"];
      const primaryVersion = chosenVersions[0] ?? "Original";

      return {
        track: chosen,
        versions,
        primaryVersion,
      };
    })
    .sort((left, right) => right.track.popularity - left.track.popularity);
}

export function collapseArtistTracks<T extends TrackLike>(
  tracks: T[],
  chooseTrack?: (left: T, right: T) => T,
) {
  return collapseTracks(tracks, (track) => getCanonicalTrackTitle(track.name), chooseTrack);
}

export function collapseFeedTracks<T extends TrackLike & { artistId: string }>(
  tracks: T[],
  chooseTrack?: (left: T, right: T) => T,
) {
  return collapseTracks(
    tracks,
    (track) => `${getFeedArtistSignature(track)}::${getTrackIdentityTitle(track.name)}`,
    chooseTrack,
  );
}

export function collapseFeedTrackVersions<T extends TrackLike & { artistId: string }>(
  tracks: T[],
  chooseTrack?: (left: T, right: T) => T,
) {
  return collapseTracks(
    tracks,
    (track) => `${getFeedArtistSignature(track)}::${getCanonicalTrackTitle(track.name)}`,
    chooseTrack ?? preferHighestScoringTrack,
  );
}

export function dedupeNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const key = normalizeText(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }

  return result;
}
