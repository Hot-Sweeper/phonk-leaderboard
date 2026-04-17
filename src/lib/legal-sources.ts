function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeTrackTitle(value: string | null | undefined) {
  if (!value) return "";

  return normalizeName(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|sped up|slowed|remix|edit|version|extended|instrumental)\b.*$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titlesLooselyMatch(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeTrackTitle(left);
  const normalizedRight = normalizeTrackTitle(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const shorterLength = Math.min(normalizedLeft.length, normalizedRight.length);
  if (shorterLength < 12) {
    return false;
  }

  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

type DeezerChartEntry = {
  deezerId: number;
  position: number;
};

type AudiusTrendEntry = {
  position: number;
  title: string;
  artistName: string;
  playCount: number;
  favoriteCount: number;
  repostCount: number;
};

type AppleChartEntry = {
  position: number;
  title: string;
  artistName: string;
};

type LastFmTrendEntry = {
  position: number;
  title: string;
  artistName: string;
  listeners: number;
  playCount: number;
};

export type ExternalTrendSignals = {
  score: number;
  sources: string[];
  deezerChartPosition: number | null;
  audiusTrendingPosition: number | null;
  appleChartPosition: number | null;
  lastfmChartPosition: number | null;
  lastfmTagPositions: Record<string, number>;
};

export type ExternalSignalSnapshot = {
  deezerChartById: Map<number, DeezerChartEntry>;
  audiusTrending: AudiusTrendEntry[];
  appleChart: AppleChartEntry[];
  lastfmChart: LastFmTrendEntry[];
  lastfmTagCharts: Record<string, LastFmTrendEntry[]>;
};

type ExternalSignalCacheEntry = {
  data: ExternalSignalSnapshot;
  timestamp: number;
};

type LastFmTrackPayload = {
  name?: string;
  playcount?: string;
  listeners?: string;
  artist?: { name?: string } | string;
};

export type ExternalSignalTrack = {
  name: string;
  deezerId: string | number | null;
  artist: { name: string };
  featuredArtists: string[];
};

const EXTERNAL_SIGNAL_CACHE_TTL = 10 * 60 * 1000;
const LASTFM_PHONK_TAGS = ["phonk", "drift phonk", "brazilian phonk", "funk mandela"];
const externalSignalCache = new Map<string, ExternalSignalCacheEntry>();

export const EMPTY_EXTERNAL_SIGNAL_SNAPSHOT: ExternalSignalSnapshot = {
  deezerChartById: new Map(),
  audiusTrending: [],
  appleChart: [],
  lastfmChart: [],
  lastfmTagCharts: {},
};

export const EMPTY_EXTERNAL_TREND_SIGNALS: ExternalTrendSignals = {
  score: 0,
  sources: [],
  deezerChartPosition: null,
  audiusTrendingPosition: null,
  appleChartPosition: null,
  lastfmChartPosition: null,
  lastfmTagPositions: {},
};

function getArtistCandidates(track: ExternalSignalTrack) {
  return [track.artist.name, ...track.featuredArtists]
    .map((value) => normalizeName(value))
    .filter(Boolean);
}

function parseLastFmCount(value: string | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapLastFmEntries(entries: LastFmTrackPayload[] | undefined) {
  return (entries ?? []).map((entry, index) => ({
    position: index + 1,
    title: entry.name ?? "",
    artistName: typeof entry.artist === "string" ? entry.artist : entry.artist?.name ?? "",
    listeners: parseLastFmCount(entry.listeners),
    playCount: parseLastFmCount(entry.playcount),
  }));
}

async function fetchLastFmJson(url: string) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    return null;
  }

  const joinedUrl = `${url}&api_key=${apiKey}&format=json`;
  const response = await fetch(joinedUrl, { next: { revalidate: 600 } }).catch(() => null);
  if (!response?.ok) {
    return null;
  }

  return response.json().catch(() => null);
}

export async function fetchExternalTrendSignals() {
  const cacheKey = "legal-24h";
  const cached = externalSignalCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < EXTERNAL_SIGNAL_CACHE_TTL) {
    return cached.data;
  }

  const lastFmTagUrls = LASTFM_PHONK_TAGS.map((tag) =>
    `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&limit=100`
  );

  const [deezerChartResponse, audiusTrendingResponse, appleChartResponse, lastfmChartJson, ...lastfmTagPayloads] = await Promise.all([
    fetch("https://api.deezer.com/chart/0/tracks?limit=100", { next: { revalidate: 600 } }).catch(() => null),
    fetch("https://api.audius.co/v1/tracks/trending?genre=Electronic&limit=100&app_name=phonkforum", { next: { revalidate: 600 } }).catch(() => null),
    fetch("https://rss.marketingtools.apple.com/api/v2/us/music/most-played/100/songs.json", { next: { revalidate: 600 } }).catch(() => null),
    fetchLastFmJson("https://ws.audioscrobbler.com/2.0/?method=chart.gettoptracks&limit=100"),
    ...lastFmTagUrls.map((url) => fetchLastFmJson(url)),
  ]);

  let deezerChartById = new Map<number, DeezerChartEntry>();
  if (deezerChartResponse?.ok) {
    const deezerJson = await deezerChartResponse.json().catch(() => null);
    deezerChartById = new Map(
      (deezerJson?.data ?? [])
        .map((entry: { id?: number; position?: number }) => {
          if (typeof entry.id !== "number") return null;
          return [entry.id, { deezerId: entry.id, position: entry.position ?? 999 }] as const;
        })
        .filter((entry: readonly [number, DeezerChartEntry] | null): entry is readonly [number, DeezerChartEntry] => entry !== null)
    );
  }

  let audiusTrending: AudiusTrendEntry[] = [];
  if (audiusTrendingResponse?.ok) {
    const audiusJson = await audiusTrendingResponse.json().catch(() => null);
    audiusTrending = (audiusJson?.data ?? []).map((entry: {
      title?: string;
      play_count?: number;
      favorite_count?: number;
      repost_count?: number;
      user?: { name?: string };
    }, index: number) => ({
      position: index + 1,
      title: entry.title ?? "",
      artistName: entry.user?.name ?? "",
      playCount: entry.play_count ?? 0,
      favoriteCount: entry.favorite_count ?? 0,
      repostCount: entry.repost_count ?? 0,
    }));
  }

  let appleChart: AppleChartEntry[] = [];
  if (appleChartResponse?.ok) {
    const appleJson = await appleChartResponse.json().catch(() => null);
    appleChart = (appleJson?.feed?.results ?? []).map((entry: { name?: string; artistName?: string }, index: number) => ({
      position: index + 1,
      title: entry.name ?? "",
      artistName: entry.artistName ?? "",
    }));
  }

  const lastfmChart = mapLastFmEntries(lastfmChartJson?.tracks?.track);
  const lastfmTagCharts = Object.fromEntries(
    LASTFM_PHONK_TAGS.map((tag, index) => [tag, mapLastFmEntries(lastfmTagPayloads[index]?.tracks?.track ?? lastfmTagPayloads[index]?.toptracks?.track)])
  );

  const snapshot = { deezerChartById, audiusTrending, appleChart, lastfmChart, lastfmTagCharts };
  externalSignalCache.set(cacheKey, { data: snapshot, timestamp: now });
  return snapshot;
}

function scoreAudiusMatch(entry: AudiusTrendEntry) {
  return Math.round(
    clamp(100 - ((entry.position - 1) * 0.9), 20, 100) * 0.55 +
    clamp((Math.log10(entry.playCount + 1) / 4) * 100, 0, 100) * 0.25 +
    clamp((Math.log10(entry.favoriteCount + entry.repostCount + 1) / 3) * 100, 0, 100) * 0.2
  );
}

function scoreLastFmMatch(entry: LastFmTrendEntry) {
  return Math.round(
    clamp(100 - ((entry.position - 1) * 0.85), 22, 100) * 0.45 +
    clamp((Math.log10(entry.listeners + 1) / 5) * 100, 0, 100) * 0.3 +
    clamp((Math.log10(entry.playCount + 1) / 6) * 100, 0, 100) * 0.25
  );
}

function scoreAppleChartMatch(position: number) {
  return Math.round(clamp(100 - ((position - 1) * 0.95), 18, 100));
}

function matchTrackEntry<T extends { title: string; artistName: string }>(
  track: ExternalSignalTrack,
  entries: T[]
) {
  const candidateArtists = getArtistCandidates(track);

  return entries.find((entry) => {
    if (!titlesLooselyMatch(track.name, entry.title)) {
      return false;
    }

    const normalizedArtist = normalizeName(entry.artistName);
    return candidateArtists.includes(normalizedArtist);
  });
}

export function resolveExternalTrendSignalForTrack(track: ExternalSignalTrack, externalSignals: ExternalSignalSnapshot): ExternalTrendSignals {
  const sources: string[] = [];
  const deezerTrackId = typeof track.deezerId === "number"
    ? track.deezerId
    : typeof track.deezerId === "string"
      ? Number(track.deezerId)
      : null;

  const deezerChartEntry = deezerTrackId != null && !Number.isNaN(deezerTrackId)
    ? externalSignals.deezerChartById.get(deezerTrackId)
    : undefined;
  const deezerScore = deezerChartEntry
    ? clamp(100 - ((deezerChartEntry.position - 1) * 1.15), 24, 100)
    : 0;
  if (deezerChartEntry) {
    sources.push("deezer-chart");
  }

  const audiusMatch = matchTrackEntry(track, externalSignals.audiusTrending);
  const audiusScore = audiusMatch ? scoreAudiusMatch(audiusMatch) : 0;
  if (audiusMatch) {
    sources.push("audius-trending");
  }

  const appleMatch = matchTrackEntry(track, externalSignals.appleChart);
  const appleScore = appleMatch ? scoreAppleChartMatch(appleMatch.position) : 0;
  if (appleMatch) {
    sources.push("apple-chart");
  }

  const lastfmChartMatch = matchTrackEntry(track, externalSignals.lastfmChart);
  const lastfmChartScore = lastfmChartMatch ? scoreLastFmMatch(lastfmChartMatch) : 0;
  if (lastfmChartMatch) {
    sources.push("lastfm-chart");
  }

  const lastfmTagPositions: Record<string, number> = {};
  let strongestLastfmTagScore = 0;
  for (const tag of LASTFM_PHONK_TAGS) {
    const match = matchTrackEntry(track, externalSignals.lastfmTagCharts[tag] ?? []);
    if (!match) {
      continue;
    }

    lastfmTagPositions[tag] = match.position;
    strongestLastfmTagScore = Math.max(strongestLastfmTagScore, scoreLastFmMatch(match));
    sources.push(`lastfm-tag:${tag}`);
  }

  return {
    score: Math.max(deezerScore, audiusScore, appleScore, lastfmChartScore, strongestLastfmTagScore),
    sources,
    deezerChartPosition: deezerChartEntry?.position ?? null,
    audiusTrendingPosition: audiusMatch?.position ?? null,
    appleChartPosition: appleMatch?.position ?? null,
    lastfmChartPosition: lastfmChartMatch?.position ?? null,
    lastfmTagPositions,
  };
}