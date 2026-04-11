type TrackLike = {
  id?: string;
  artistId?: string;
  name: string;
  popularity: number;
  previewUrl?: string | null;
  durationMs?: number;
  releaseDate?: string | null;
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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getCanonicalTrackTitle(title: string) {
  let normalized = normalizeText(title);

  normalized = normalized.replace(/\[(.*?)\]/g, (full, inner) => {
    const segment = normalizeText(inner);
    return VERSION_HINTS.some((hint) => segment.includes(hint)) ? "" : full;
  });

  normalized = normalized.replace(/\((.*?)\)/g, (full, inner) => {
    const segment = normalizeText(inner);
    return VERSION_HINTS.some((hint) => segment.includes(hint)) ? "" : full;
  });

  normalized = normalized.replace(/\s+-\s+(slowed|sped up|speed up|nightcore|remix|edit|extended|instrumental|reverb).*$/g, "");
  normalized = normalized.replace(/[^a-z0-9]+/g, " ");
  return normalized.trim();
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

  if (left.popularity !== right.popularity) return left.popularity > right.popularity ? left : right;

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
    const canonical = getCanonicalTrackTitle(track.name);
    const current = byCanonical.get(canonical);
    byCanonical.set(canonical, current ? preferTrack(current, track) : track);
  }

  return [...byCanonical.values()].sort((a, b) => b.popularity - a.popularity);
}

export function dedupeFeedTracks<T extends TrackLike & { artistId: string }>(tracks: T[]) {
  const byCanonical = new Map<string, T>();

  for (const track of tracks) {
    const canonical = `${track.artistId}::${getCanonicalTrackTitle(track.name)}`;
    const current = byCanonical.get(canonical);
    byCanonical.set(canonical, current ? preferTrack(current, track) : track);
  }

  return [...byCanonical.values()].sort((a, b) => b.popularity - a.popularity);
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
