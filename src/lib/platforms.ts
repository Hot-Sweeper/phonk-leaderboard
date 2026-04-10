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

/** Get a Spotify access token via Client Credentials flow */
async function getSpotifyToken(): Promise<string | null> {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("[Spotify] Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
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
      return null;
    }
    const data = await res.json();
    spotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch (err) {
    console.error("[Spotify] Token request error:", err);
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
    imageUrl: apiData?.imageUrl ?? null,
    followerCount: scraped?.followers ?? apiData?.followerCount ?? 0,
    monthlyListeners: scraped?.monthlyListeners ?? 0,
    name: apiData?.name ?? scraped?.name ?? null,
    platformId: artistId,
  };
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
): Promise<{ monthlyListeners: number; followers: number | null; name: string | null } | null> {
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
      name = nameMatch[1];
    }

    return { monthlyListeners, followers, name };
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

// ─── Combined ───

export type PlatformStats = {
  imageUrl: string | null;
  followerCount: number;
  monthlyListeners: number;
  handle: string | null;
  platformId: string | null;
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
