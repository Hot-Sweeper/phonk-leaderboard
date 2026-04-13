/**
 * YouTube Data API v3 + Spotify/TikTok/Instagram scraping utilities
 * Fetches profile pictures, subscriber counts, follower counts, and monthly listeners.
 */

type YouTubeChannelData = {
  imageUrl: string | null;
  subscriberCount: number;
  handle: string | null;
  platformId: string | null;
};

type SpotifyArtistData = {
  imageUrl: string | null;
  followerCount: number;
  monthlyListeners: number;
  name: string | null;
  platformId: string | null;
};

// ─── YouTube ───

/** Extract a YouTube handle or channel ID from a URL */
export function parseYouTubeUrl(url: string): {
  handle?: string;
  channelId?: string;
} {
  try {
    const u = new URL(url);
    // youtube.com/@handle
    const handleMatch = u.pathname.match(/^\/@([\w.-]+)/);
    if (handleMatch) return { handle: handleMatch[1] };
    // youtube.com/channel/UCxxx
    const channelMatch = u.pathname.match(/^\/channel\/(UC[\w-]+)/);
    if (channelMatch) return { channelId: channelMatch[1] };
    // youtube.com/c/CustomName — treated as handle
    const customMatch = u.pathname.match(/^\/c\/([\w.-]+)/);
    if (customMatch) return { handle: customMatch[1] };
    return {};
  } catch {
    return {};
  }
}

/** Fetch YouTube channel data */
export async function fetchYouTubeChannel(
  url: string
): Promise<YouTubeChannelData | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const { handle, channelId } = parseYouTubeUrl(url);
  if (!handle && !channelId) return null;

  const params = new URLSearchParams({
    part: "snippet,statistics",
    key: apiKey,
  });
  if (handle) {
    params.set("forHandle", handle);
  } else if (channelId) {
    params.set("id", channelId);
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    return {
      imageUrl:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
      subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0", 10),
      handle: item.snippet?.customUrl?.replace(/^@/, "") ?? handle ?? null,
      platformId: item.id ?? null,
    };
  } catch {
    return null;
  }
}

export type YouTubeChannelFull = YouTubeChannelData & {
  name: string;
  description: string;
};

/** Fetch full YouTube channel data including description */
export async function fetchYouTubeChannelFull(
  url: string
): Promise<YouTubeChannelFull | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const { handle, channelId } = parseYouTubeUrl(url);
  if (!handle && !channelId) return null;

  const params = new URLSearchParams({
    part: "snippet,statistics",
    key: apiKey,
  });
  if (handle) params.set("forHandle", handle);
  else if (channelId) params.set("id", channelId);

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${params}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (!item) return null;

    return {
      name: item.snippet?.title ?? "",
      description: item.snippet?.description ?? "",
      imageUrl:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
      subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0", 10),
      handle: item.snippet?.customUrl?.replace(/^@/, "") ?? handle ?? null,
      platformId: item.id ?? null,
    };
  } catch {
    return null;
  }
}

/** Extract Spotify URL from text (e.g. YouTube description) */
export function extractSpotifyUrl(text: string): string | null {
  const match = text.match(
    /https?:\/\/open\.spotify\.com\/(?:intl-\w+\/)?artist\/[a-zA-Z0-9]+/
  );
  return match?.[0] ?? null;
}

/** Search Spotify artists by name */
export async function searchSpotifyArtists(
  query: string,
  limit = 5
): Promise<SpotifyArtistData[]> {
  const token = await getSpotifyToken();
  if (!token) {
    console.error("[Spotify] Cannot search — no token available");
    throw new Error("Spotify credentials not configured");
  }

  const params = new URLSearchParams({
    q: query,
    type: "artist",
    limit: String(limit),
  });
  const res = await fetch(
    `https://api.spotify.com/v1/search?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[Spotify] Search failed: ${res.status} ${text}`);
    throw new Error(`Spotify search failed (${res.status})`);
  }
  const data = await res.json();
  return (data.artists?.items ?? []).map(
    (a: { id: string; name: string; images?: { url: string }[]; followers?: { total: number } }) => ({
      imageUrl: a.images?.[0]?.url ?? null,
      followerCount: a.followers?.total ?? 0,
      monthlyListeners: 0,
      name: a.name ?? null,
      platformId: a.id ?? null,
    })
  );
}

/** Search YouTube channels by query */
export async function searchYouTubeChannels(
  query: string,
  limit = 5
): Promise<YouTubeChannelFull[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    // Step 1: search for channels
    const searchParams = new URLSearchParams({
      part: "snippet",
      type: "channel",
      q: query,
      maxResults: String(limit),
      key: apiKey,
    });
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${searchParams}`
    );
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    const channelIds = (searchData.items ?? [])
      .map((i: { id?: { channelId?: string } }) => i.id?.channelId)
      .filter(Boolean)
      .join(",");
    if (!channelIds) return [];

    // Step 2: get full channel details
    const detailParams = new URLSearchParams({
      part: "snippet,statistics",
      id: channelIds,
      key: apiKey,
    });
    const detailRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?${detailParams}`
    );
    if (!detailRes.ok) return [];
    const detailData = await detailRes.json();

    return (detailData.items ?? []).map(
      (item: {
        id: string;
        snippet?: {
          title?: string;
          description?: string;
          customUrl?: string;
          thumbnails?: { high?: { url?: string }; default?: { url?: string } };
        };
        statistics?: { subscriberCount?: string };
      }) => ({
        name: item.snippet?.title ?? "",
        description: item.snippet?.description ?? "",
        imageUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        subscriberCount: parseInt(
          item.statistics?.subscriberCount ?? "0",
          10
        ),
        handle: item.snippet?.customUrl?.replace(/^@/, "") ?? null,
        platformId: item.id ?? null,
      })
    );
  } catch {
    return [];
  }
}

// ─── Spotify ───

let spotifyToken: string | null = null;
let spotifyTokenExpiry = 0;
let spotifyTokenFailedUntil = 0;

/** Get a Spotify access token via Client Credentials flow */
export async function getSpotifyToken(): Promise<string | null> {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;
  // Don't retry if we recently failed (cache failures for 60s)
  if (Date.now() < spotifyTokenFailedUntil) return null;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[Spotify] Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
    spotifyTokenFailedUntil = Date.now() + 60_000;
    return null;
  }

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[Spotify] Token request failed: ${res.status} ${text}`);
      spotifyTokenFailedUntil = Date.now() + 60_000;
      return null;
    }
    const data = await res.json();
    spotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch (err) {
    console.error("[Spotify] Token request error:", err);
    spotifyTokenFailedUntil = Date.now() + 60_000;
    return null;
  }
}

/** Extract Spotify artist ID from URL */
export function parseSpotifyUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // open.spotify.com/artist/XXXID or /intl-xx/artist/XXXID
    const match = u.pathname.match(/\/artist\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function extractSocialHandle(
  platform: string,
  url: string
): string | null {
  try {
    const parsedUrl = new URL(url);

    if (platform === "TIKTOK") {
      const match = parsedUrl.pathname.match(/\/@([^/?#]+)/);
      return match?.[1] ?? null;
    }

    if (platform === "INSTAGRAM") {
      const path = parsedUrl.pathname.replace(/\/+$/, "");
      const match = path.match(/^\/([^/?#]+)/);
      const handle = match?.[1]?.replace(/^@/, "") ?? null;
      if (!handle) return null;

      const reservedPaths = new Set([
        "p",
        "reel",
        "reels",
        "tv",
        "stories",
        "explore",
        "accounts",
        "direct",
      ]);

      return reservedPaths.has(handle.toLowerCase()) ? null : handle;
    }

    return null;
  } catch {
    return null;
  }
}

/** Fetch Spotify artist data (API + scrape monthly listeners) */
export async function fetchSpotifyArtist(
  url: string
): Promise<SpotifyArtistData | null> {
  const artistId = parseSpotifyUrl(url);
  if (!artistId) return null;

  // Fetch API data and scrape monthly listeners in parallel
  const [apiData, scraped] = await Promise.all([
    fetchSpotifyArtistApi(artistId),
    scrapeSpotifyListeners(artistId),
  ]);

  return {
    imageUrl: scraped?.profileImage ?? apiData?.imageUrl ?? null,
    followerCount: scraped?.followers ?? apiData?.followerCount ?? 0,
    monthlyListeners: scraped?.monthlyListeners ?? 0,
    name: scraped?.name ?? apiData?.name ?? null,
    platformId: artistId,
  };
}

/** Fetch full Spotify artist details (genres, popularity, images) */
export async function fetchSpotifyArtistDetails(spotifyId: string): Promise<{
  genres: string[];
  popularity: number;
  images: { url: string; width: number; height: number }[];
  followers: number;
  name: string;
} | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/artists/${spotifyId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      genres: data.genres ?? [],
      popularity: data.popularity ?? 0,
      images: data.images ?? [],
      followers: data.followers?.total ?? 0,
      name: data.name ?? "",
    };
  } catch {
    return null;
  }
}

/** Fetch Spotify artist's top tracks */
export async function fetchSpotifyTopTracks(spotifyId: string): Promise<{
  id: string;
  name: string;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
  trackNumber: number;
  discNumber: number;
  spotifyUrl: string;
  album: {
    name: string;
    imageUrl: string | null;
    releaseDate: string | null;
  };
  artists: { name: string; id: string }[];
}[] | null> {
  const token = await getSpotifyToken();
  if (!token) {
    console.error(`[Spotify] No token available for top-tracks of ${spotifyId}`);
    return null;
  }

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/artists/${spotifyId}/top-tracks?market=US`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[Spotify] top-tracks failed for ${spotifyId}: ${res.status} ${text.substring(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return (data.tracks ?? []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      name: t.name as string,
      popularity: (t.popularity as number) ?? 0,
      durationMs: (t.duration_ms as number) ?? 0,
      explicit: (t.explicit as boolean) ?? false,
      previewUrl: (t.preview_url as string | null) ?? null,
      trackNumber: (t.track_number as number) ?? 0,
      discNumber: (t.disc_number as number) ?? 0,
      spotifyUrl: (t.external_urls as Record<string, string>)?.spotify ?? "",
      album: {
        name: ((t.album as Record<string, unknown>)?.name as string) ?? "",
        imageUrl: ((t.album as Record<string, unknown>)?.images as { url: string }[])?.[0]?.url ?? null,
        releaseDate: ((t.album as Record<string, unknown>)?.release_date as string) ?? null,
      },
      artists: ((t.artists as { name: string; id: string }[]) ?? []).map((a) => ({
        name: a.name,
        id: a.id,
      })),
    }));
  } catch (err) {
    console.error(`[Spotify] top-tracks exception for ${spotifyId}:`, err);
    return null;
  }
}

async function fetchSpotifyArtistApi(
  artistId: string
): Promise<{ imageUrl: string | null; followerCount: number; name: string | null } | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      return {
        imageUrl: data.images?.[0]?.url ?? null,
        followerCount: data.followers?.total ?? 0,
        name: data.name ?? null,
      };
    }
    const text = await res.text().catch(() => "");
    console.error(`[Spotify] Artist lookup failed: ${res.status} ${text}`);
  } catch (err) {
    console.error("[Spotify] Artist lookup error:", err);
  }
  return null;
}

const SCRAPE_HEADERS = {
  "User-Agent": "Mozilla/5.0",
  "Accept-Language": "en",
};

async function scrapeSpotifyListeners(
  artistId: string
): Promise<{ monthlyListeners: number; followers: number | null; name: string | null; profileImage: string | null } | null> {
  try {
    const res = await fetch(`https://open.spotify.com/artist/${artistId}`, {
      headers: SCRAPE_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Monthly listeners: "62,131 monthly listeners"
    let monthlyListeners = 0;
    const exactMatch = html.match(/([\d,]+)\s+monthly\s+listeners/i);
    if (exactMatch) {
      monthlyListeners = parseInt(exactMatch[1].replace(/,/g, ""), 10);
    } else {
      // Abbreviated form: "62.1K monthly listeners"
      const abbrevMatch = html.match(/([\d.]+)([KMB])\s+monthly\s+listeners/i);
      if (abbrevMatch) {
        const suffixes: Record<string, number> = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
        monthlyListeners = Math.round(parseFloat(abbrevMatch[1]) * (suffixes[abbrevMatch[2].toUpperCase()] ?? 1));
      }
    }

    // Followers from HTML: ">3,587</p>...Followers</p>"
    let followers: number | null = null;
    const followersMatch = html.match(/>([\d,]+)<\/[^>]+>\s*<[^>]+>Followers</i);
    if (followersMatch) {
      followers = parseInt(followersMatch[1].replace(/,/g, ""), 10);
    }

    // Artist name from JSON-LD
    let name: string | null = null;
    const nameMatch = html.match(/"name"\s*:\s*"([^"]+)"/);
    if (nameMatch) {
      // Decode JSON unicode escapes (e.g. \u00F8 → ø)
      try {
        name = JSON.parse(`"${nameMatch[1]}"`);
      } catch {
        name = nameMatch[1];
      }
    }

    // Profile image from og:image meta tag
    let profileImage: string | null = null;
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (ogImageMatch) {
      profileImage = ogImageMatch[1];
    }

    return { monthlyListeners, followers, name, profileImage };
  } catch (err) {
    console.error("[Spotify] Scrape error:", err);
    return null;
  }
}

type ScrapedSocialStats = {
  followers: number | null;
  name: string | null;
};

async function scrapeInstagramStats(url: string): Promise<ScrapedSocialStats | null> {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.replace(/\/+$/, "");
    const match = path.match(/^\/([^/?#]+)/);
    const username = match?.[1]?.replace(/^@/, "");
    if (!username) return null;

    const res = await fetch(`https://www.instagram.com/${username}/`, {
      headers: SCRAPE_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Meta description: "96 Followers, 62 Following, 0 Posts - Name (@user)"
    const metaMatch = html.match(/<meta[^>]*(?:name|property)="(?:og:)?description"[^>]*content="([^"]*)"/i)
      ?? html.match(/<meta[^>]*content="([^"]*)"[^>]*name="description"/i);

    let followers: number | null = null;
    let name: string | null = null;

    if (metaMatch) {
      const desc = metaMatch[1];
      const followersMatch = desc.match(/([\d,]+)\s+Followers/i);
      if (followersMatch) followers = parseInt(followersMatch[1].replace(/,/g, ""), 10);
      const nameMatch = desc.match(/-\s*(.+?)\s*\((?:@|&#064;)/);
      if (nameMatch) name = nameMatch[1].trim();
    }

    return { followers, name };
  } catch (err) {
    console.error("[Instagram] Scrape error:", err);
    return null;
  }
}

async function scrapeTikTokStats(url: string): Promise<ScrapedSocialStats | null> {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/\/@([^/?#]+)/);
    const username = match?.[1];
    if (!username) return null;

    const res = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: SCRAPE_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();

    let followers: number | null = null;
    const followersMatch = html.match(/"followerCount"\s*:\s*(\d+)/);
    if (followersMatch) followers = parseInt(followersMatch[1], 10);

    let name: string | null = null;
    const nameMatch = html.match(/"nickname"\s*:\s*"([^"]+)"/);
    if (nameMatch) name = nameMatch[1];

    return { followers, name };
  } catch (err) {
    console.error("[TikTok] Scrape error:", err);
    return null;
  }
}

// ─────────── Deezer API (free, no auth) ───────────

/** Resolve Spotify artist → Deezer artist ID via Odesli (song.link) */
export async function resolveDeezerId(spotifyId: string): Promise<number | null> {
  try {
    const url = `https://api.song.link/v1-alpha.1/links?url=https://open.spotify.com/artist/${spotifyId}&userCountry=US`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[Odesli] Failed to resolve ${spotifyId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    // Odesli returns linksByPlatform.deezer.url like "https://www.deezer.com/artist/12345"
    const deezerUrl: string | undefined = data.linksByPlatform?.deezer?.url;
    if (!deezerUrl) {
      console.warn(`[Odesli] No Deezer mapping for Spotify artist ${spotifyId}`);
      return null;
    }
    const match = deezerUrl.match(/\/artist\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  } catch (err) {
    console.error(`[Odesli] Error resolving ${spotifyId}:`, err);
    return null;
  }
}

function normalizeArtistName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type DeezerArtistCandidate = {
  id: number;
  name: string;
  nbFan: number;
  nbAlbum: number;
  pictureMedium: string | null;
};

/**
 * Search Deezer by name and return a best-effort exact candidate.
 * We prefer exact normalized matches and avoid guessing when multiple candidates are too close.
 */
export async function searchDeezerArtist(name: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=5`);
    if (!res.ok) return null;
    const data = await res.json();
    const candidates: DeezerArtistCandidate[] = (data.data ?? []).map((artist: {
      id: number;
      name: string;
      nb_fan?: number;
      nb_album?: number;
      picture_medium?: string;
    }) => ({
      id: artist.id,
      name: artist.name,
      nbFan: artist.nb_fan ?? 0,
      nbAlbum: artist.nb_album ?? 0,
      pictureMedium: artist.picture_medium ?? null,
    }));

    if (candidates.length === 0) return null;

    const normalizedTarget = normalizeArtistName(name);
    const exactMatches = candidates.filter(
      (artist) => normalizeArtistName(artist.name) === normalizedTarget
    );

    if (exactMatches.length === 1) {
      return exactMatches[0].id;
    }

    if (exactMatches.length > 1) {
      const sorted = [...exactMatches].sort((a, b) => b.nbFan - a.nbFan || b.nbAlbum - a.nbAlbum);
      const best = sorted[0];
      const second = sorted[1];

      // Only auto-pick when the top exact match is clearly dominant.
      if (!second || best.nbFan >= Math.max(10_000, second.nbFan * 5)) {
        return best.id;
      }

      console.warn(
        `[Deezer] Ambiguous exact artist match for "${name}": ${sorted
          .slice(0, 3)
          .map((artist) => `${artist.name}#${artist.id} (${artist.nbFan} fans)`)
          .join(", ")}`
      );
      return null;
    }

    // Only accept a fuzzy match when the top result is very strong and the names are very close.
    const sorted = [...candidates].sort((a, b) => b.nbFan - a.nbFan || b.nbAlbum - a.nbAlbum);
    const best = sorted[0];
    const second = sorted[1];
    const bestNormalized = normalizeArtistName(best.name);

    if (
      (bestNormalized.includes(normalizedTarget) || normalizedTarget.includes(bestNormalized)) &&
      (!second || best.nbFan >= Math.max(10_000, second.nbFan * 8))
    ) {
      return best.id;
    }

    console.warn(
      `[Deezer] No safe artist match for "${name}". Best candidates: ${sorted
        .slice(0, 3)
        .map((artist) => `${artist.name}#${artist.id} (${artist.nbFan} fans)`)
        .join(", ")}`
    );
    return null;
  } catch (err) {
    console.error(`[Deezer] Search error for "${name}":`, err);
    return null;
  }
}

export async function resolveArtistToDeezer(name: string, spotifyId?: string | null): Promise<{
  deezerId: number | null;
  source: "deezer-search" | "odesli" | "unresolved";
}> {
  const deezerByName = await searchDeezerArtist(name);
  if (deezerByName) {
    return { deezerId: deezerByName, source: "deezer-search" };
  }

  if (spotifyId) {
    const deezerBySpotify = await resolveDeezerId(spotifyId);
    if (deezerBySpotify) {
      return { deezerId: deezerBySpotify, source: "odesli" };
    }
  }

  return { deezerId: null, source: "unresolved" };
}

type DeezerTrack = {
  deezerId: number;
  name: string;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
  trackNumber: number;
  deezerUrl: string;
  album: {
    name: string;
    imageUrl: string | null;
    releaseDate: string | null;
  };
  artists: { name: string; deezerId: number }[];
  bpm: number | null;
  gain: number | null;
  releaseDate: string | null;
};

export type DeezerTrackDetail = {
  deezerId: number;
  name: string;
  fullTitle: string;
  titleVersion: string | null;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
  trackNumber: number;
  deezerUrl: string;
  album: {
    name: string;
    imageUrl: string | null;
    releaseDate: string | null;
  };
  artists: Array<{
    name: string;
    deezerId: number;
    role: string | null;
  }>;
  bpm: number | null;
  gain: number | null;
  releaseDate: string | null;
};

export async function fetchDeezerTrackDetail(deezerTrackId: number): Promise<DeezerTrackDetail | null> {
  try {
    const detailRes = await fetch(`https://api.deezer.com/track/${deezerTrackId}`);
    if (!detailRes.ok) {
      return null;
    }

    const detail = await detailRes.json();
    const contributors = Array.isArray(detail.contributors) && detail.contributors.length > 0
      ? detail.contributors
      : detail.artist
        ? [detail.artist]
        : [];

    return {
      deezerId: detail.id,
      name: detail.title_short ?? detail.title,
      fullTitle: detail.title ?? detail.title_short,
      titleVersion: detail.title_version || null,
      popularity: detail.rank ?? 0,
      durationMs: (detail.duration ?? 0) * 1000,
      explicit: detail.explicit_lyrics ?? false,
      previewUrl: detail.preview ?? null,
      trackNumber: detail.track_position ?? 0,
      deezerUrl: detail.link ?? `https://www.deezer.com/track/${detail.id}`,
      album: {
        name: detail.album?.title ?? "",
        imageUrl: detail.album?.cover_big ?? detail.album?.cover_medium ?? null,
        releaseDate: detail.release_date ?? detail.album?.release_date ?? null,
      },
      artists: contributors.map((artist: { name: string; id: number; role?: string }) => ({
        name: artist.name,
        deezerId: artist.id,
        role: artist.role ?? null,
      })),
      bpm: detail.bpm && detail.bpm > 0 ? detail.bpm : null,
      gain: detail.gain ?? null,
      releaseDate: detail.release_date ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the FULL discography for an artist via Deezer albums → tracks.
 * Replaces the limited top-50 endpoint with a paginated full-catalog approach.
 * Skips per-track detail calls (BPM/gain) to keep the request count manageable.
 */
export async function fetchDeezerFullCatalog(deezerId: number): Promise<DeezerTrack[] | null> {
  try {
    // ── 1. Paginate through all albums ──
    const albums: Array<{ id: number; title: string; coverBig: string | null; releaseDate: string | null; type: string }> = [];
    let offset = 0;
    const albumLimit = 50;
    while (true) {
      const res = await fetch(
        `https://api.deezer.com/artist/${deezerId}/albums?limit=${albumLimit}&index=${offset}`
      );
      if (!res.ok) break;
      const data = await res.json();
      if (!data.data || data.data.length === 0) break;
      for (const a of data.data) {
        albums.push({
          id: a.id,
          title: a.title ?? "",
          coverBig: a.cover_big ?? a.cover_medium ?? null,
          releaseDate: a.release_date ?? null,
          type: a.record_type ?? "album",
        });
      }
      if (data.data.length < albumLimit) break;
      offset += albumLimit;
      if (albums.length >= 500) break; // hard cap — avoids runaway fetches
    }

    if (albums.length === 0) {
      // fall back to top tracks if no albums available
      return fetchDeezerTopTracks(deezerId);
    }

    // ── 2. Fetch tracks for each album (paginated to catch albums with >100 tracks) ──
    const allTracks: DeezerTrack[] = [];
    for (const album of albums) {
      try {
        let trackOffset = 0;
        const trackBatchSize = 100;
        while (true) {
          const res = await fetch(
            `https://api.deezer.com/album/${album.id}/tracks?limit=${trackBatchSize}&index=${trackOffset}`
          );
          if (!res.ok) break;
          const data = await res.json();
          if (!data.data || data.data.length === 0) break;

          for (const t of data.data) {
            // contributors array is available on album track listing
            const contributors: Array<{ name: string; id: number }> =
              Array.isArray(t.contributors) && t.contributors.length > 0
                ? t.contributors
                : t.artist
                  ? [t.artist]
                  : [];

            allTracks.push({
              deezerId: t.id,
              name: t.title_short ?? t.title,
              popularity: t.rank ?? 0,
              durationMs: (t.duration ?? 0) * 1000,
              explicit: t.explicit_lyrics ?? false,
              previewUrl: t.preview ?? null,
              trackNumber: t.track_position ?? 0,
              deezerUrl: t.link ?? `https://www.deezer.com/track/${t.id}`,
              album: {
                name: album.title,
                imageUrl: album.coverBig,
                releaseDate: album.releaseDate,
              },
              artists: contributors.map((c) => ({ name: c.name, deezerId: c.id })),
              bpm: null,
              gain: null,
              releaseDate: album.releaseDate,
            });
          }
          if (data.data.length < trackBatchSize) break;
          trackOffset += trackBatchSize;
        }
      } catch {
        // individual album failure — keep going
      }
    }

    // ── 3. Supplement with artist's top tracks (catches featured appearances not in own albums) ──
    try {
      const topRes = await fetch(`https://api.deezer.com/artist/${deezerId}/top?limit=200`);
      if (topRes.ok) {
        const topData = await topRes.json();
        const seenIds = new Set(allTracks.map((t) => t.deezerId));
        for (const t of topData.data ?? []) {
          if (seenIds.has(t.id)) continue;
          const contributors: Array<{ name: string; id: number }> =
            Array.isArray(t.contributors) && t.contributors.length > 0
              ? t.contributors
              : t.artist
                ? [t.artist]
                : [];
          allTracks.push({
            deezerId: t.id,
            name: t.title_short ?? t.title,
            popularity: t.rank ?? 0,
            durationMs: (t.duration ?? 0) * 1000,
            explicit: t.explicit_lyrics ?? false,
            previewUrl: t.preview ?? null,
            trackNumber: t.track_position ?? 0,
            deezerUrl: t.link ?? `https://www.deezer.com/track/${t.id}`,
            album: {
              name: t.album?.title ?? "",
              imageUrl: t.album?.cover_big ?? t.album?.cover_medium ?? null,
              releaseDate: t.album?.release_date ?? null,
            },
            artists: contributors.map((c) => ({ name: c.name, deezerId: c.id })),
            bpm: null,
            gain: null,
            releaseDate: null,
          });
        }
      }
    } catch {
      // supplement failed — album catalog is still used
    }

    return allTracks.length > 0 ? allTracks : null;
  } catch (err) {
    console.error(`[Deezer] Full catalog error for ${deezerId}:`, err);
    return null;
  }
}

/**
 * Fetch the FULL discography for an artist via Spotify albums → tracks.
 * Used as a fallback when no Deezer ID is available.
 */
export async function fetchSpotifyFullCatalog(spotifyId: string): Promise<{
  id: string;
  name: string;
  popularity: number;
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
  trackNumber: number;
  discNumber: number;
  spotifyUrl: string;
  album: { name: string; imageUrl: string | null; releaseDate: string | null };
  artists: { name: string; id: string }[];
}[] | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    // ── 1. Paginate albums (album + single + compilation + appears_on for full coverage) ──
    const albumIds: string[] = [];
    const appearsOnAlbumIds = new Set<string>(); // albums from other artists where this artist features
    let nextUrl: string | null =
      `https://api.spotify.com/v1/artists/${spotifyId}/albums?include_groups=album,single,compilation,appears_on&limit=50&market=US`;

    while (nextUrl && albumIds.length < 500) {
      const albumRes = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!albumRes.ok) break;
      const albumData = await albumRes.json() as { items?: { id: string; album_group?: string }[]; next?: string | null };
      for (const a of albumData.items ?? []) {
        albumIds.push(a.id);
        if (a.album_group === "appears_on") appearsOnAlbumIds.add(a.id);
      }
      nextUrl = albumData.next ?? null;
    }

    if (albumIds.length === 0) {
      // fall back to top tracks
      return fetchSpotifyTopTracks(spotifyId);
    }

    // ── 2. Fetch tracks per album (batch albums in groups of 20) ──
    const allTracks: Awaited<ReturnType<typeof fetchSpotifyTopTracks>> = [];
    // Fetch album details in batches of 20 (Spotify limit)
    for (let i = 0; i < albumIds.length; i += 20) {
      const batch = albumIds.slice(i, i + 20);
      const res = await fetch(
        `https://api.spotify.com/v1/albums?ids=${batch.join(",")}&market=US`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const album of data.albums ?? []) {
        if (!album) continue;
        const isAppearsOn = appearsOnAlbumIds.has(album.id);
        const albumInfo = {
          name: album.name ?? "",
          imageUrl: album.images?.[0]?.url ?? null,
          releaseDate: album.release_date ?? null,
        };
        for (const t of album.tracks?.items ?? []) {
          if (!t) continue;
          // For appears_on albums, only include tracks where the target artist is actually credited
          if (isAppearsOn) {
            const trackArtistIds = (t.artists ?? []).map((a: { id: string }) => a.id);
            if (!trackArtistIds.includes(spotifyId)) continue;
          }
          allTracks!.push({
            id: t.id,
            name: t.name,
            popularity: 0, // tracks endpoint doesn't include popularity; acceptably 0
            durationMs: t.duration_ms ?? 0,
            explicit: t.explicit ?? false,
            previewUrl: t.preview_url ?? null,
            trackNumber: t.track_number ?? 0,
            discNumber: t.disc_number ?? 0,
            spotifyUrl: t.external_urls?.spotify ?? "",
            album: albumInfo,
            artists: (t.artists ?? []).map((a: { name: string; id: string }) => ({ name: a.name, id: a.id })),
          });
        }
      }
    }

    return allTracks && allTracks.length > 0 ? allTracks : null;
  } catch (err) {
    console.error(`[Spotify] Full catalog error for ${spotifyId}:`, err);
    return null;
  }
}

/** Fetch top tracks for an artist from Deezer */
export async function fetchDeezerTopTracks(deezerId: number): Promise<DeezerTrack[] | null> {
  try {
    const res = await fetch(`https://api.deezer.com/artist/${deezerId}/top?limit=50`);
    if (!res.ok) {
      console.error(`[Deezer] Top tracks failed for ${deezerId}: ${res.status}`);
      return null;
    }
    const data = await res.json();
    if (!data.data || data.data.length === 0) return [];

    // Fetch BPM/gain/release_date for each track (detail endpoint)
    const tracks: DeezerTrack[] = [];
    for (const t of data.data) {
      const detail = await fetchDeezerTrackDetail(t.id);

      tracks.push({
        deezerId: t.id,
        name: t.title ?? detail?.fullTitle ?? detail?.name ?? t.title_short,
        popularity: detail?.popularity ?? t.rank ?? 0,
        durationMs: detail?.durationMs ?? (t.duration ?? 0) * 1000,
        explicit: detail?.explicit ?? t.explicit_lyrics ?? false,
        previewUrl: detail?.previewUrl ?? t.preview ?? null,
        trackNumber: detail?.trackNumber ?? 0,
        deezerUrl: detail?.deezerUrl ?? t.link ?? `https://www.deezer.com/track/${t.id}`,
        album: {
          name: detail?.album.name ?? t.album?.title ?? "",
          imageUrl: detail?.album.imageUrl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null,
          releaseDate: detail?.album.releaseDate ?? null,
        },
        artists: detail?.artists.map((artist) => ({
          name: artist.name,
          deezerId: artist.deezerId,
        })) ?? (t.contributors ?? []).map((c: { name: string; id: number }) => ({
          name: c.name,
          deezerId: c.id,
        })),
        bpm: detail?.bpm ?? null,
        gain: detail?.gain ?? null,
        releaseDate: detail?.releaseDate ?? null,
      });
    }

    return tracks;
  } catch (err) {
    console.error(`[Deezer] Top tracks error for ${deezerId}:`, err);
    return null;
  }
}

// ─── Combined ───

export type PlatformStats = {
  imageUrl: string | null;
  followerCount: number;
  monthlyListeners: number;
  handle: string | null;
  platformId: string | null;
  name?: string | null;
};

/** Fetch stats for a given platform link */
export async function fetchPlatformStats(
  platform: string,
  url: string
): Promise<PlatformStats | null> {
  if (platform === "YOUTUBE") {
    const data = await fetchYouTubeChannel(url);
    if (!data) return null;
    return {
      imageUrl: data.imageUrl,
      followerCount: data.subscriberCount,
      monthlyListeners: 0,
      handle: data.handle,
      platformId: data.platformId,
    };
  }

  if (platform === "SPOTIFY") {
    const data = await fetchSpotifyArtist(url);
    if (!data) return null;
    return {
      imageUrl: data.imageUrl,
      followerCount: data.followerCount,
      monthlyListeners: data.monthlyListeners,
      handle: null,
      platformId: data.platformId,
      name: data.name,
    };
  }

  if (platform === "TIKTOK") {
    const scraped = await scrapeTikTokStats(url);
    return {
      imageUrl: null,
      followerCount: scraped?.followers ?? 0,
      monthlyListeners: 0,
      handle: extractSocialHandle(platform, url),
      platformId: null,
    };
  }

  if (platform === "INSTAGRAM") {
    const scraped = await scrapeInstagramStats(url);
    return {
      imageUrl: null,
      followerCount: scraped?.followers ?? 0,
      monthlyListeners: 0,
      handle: extractSocialHandle(platform, url),
      platformId: null,
    };
  }

  return null;
}
