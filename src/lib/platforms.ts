/**
 * YouTube Data API v3 + Spotify Web API utilities
 * Fetches profile pictures, subscriber counts, and follower counts.
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
  name: string | null;
  platformId: string | null;
};

function parseLooseCount(value: string | null | undefined): number {
  if (!value) return 0;
  const digits = value.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

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
let spotifyWebToken: string | null = null;
let spotifyWebTokenExpiry = 0;

async function getSpotifyWebToken(): Promise<string | null> {
  if (spotifyWebToken && Date.now() < spotifyWebTokenExpiry) {
    return spotifyWebToken;
  }

  try {
    const res = await fetch(
      "https://open.spotify.com/get_access_token?reason=transport&productType=web_player",
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        },
        next: { revalidate: 0 },
      }
    );

    const text = await res.text();
    if (!res.ok) {
      console.error(`[Spotify] Web token request failed: ${res.status} ${text}`);
      return null;
    }

    const data = JSON.parse(text) as {
      accessToken?: string;
      accessTokenExpirationTimestampMs?: number;
    };

    if (!data.accessToken) {
      console.error("[Spotify] Web token missing accessToken");
      return null;
    }

    spotifyWebToken = data.accessToken;
    spotifyWebTokenExpiry =
      (data.accessTokenExpirationTimestampMs ?? Date.now() + 30 * 60 * 1000) -
      60_000;
    return spotifyWebToken;
  } catch (err) {
    console.error("[Spotify] Web token request error:", err);
    return null;
  }
}

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

async function fetchSpotifyArtistPageFallback(
  url: string,
  artistId: string
): Promise<SpotifyArtistData | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const normalizedHtml = html.replace(/\s+/g, " ");

    const titleMatch =
      normalizedHtml.match(/<meta property="og:title" content="([^"]+)"/i) ??
      normalizedHtml.match(/<title>([^<]+)<\/title>/i);
    const imageMatch = normalizedHtml.match(
      /<meta property="og:image" content="([^"]+)"/i
    );
    const followerMatch =
      normalizedHtml.match(/([0-9][0-9.,]*)\s*Followers/i) ??
      normalizedHtml.match(/Followers[^0-9]{0,40}([0-9][0-9.,]*)/i);

    const name = titleMatch?.[1]
      ?.replace(/\s*\|\s*Spotify.*$/i, "")
      .trim() ?? null;

    return {
      imageUrl: imageMatch?.[1] ?? null,
      followerCount: parseLooseCount(followerMatch?.[1]),
      name,
      platformId: artistId,
    };
  } catch (err) {
    console.error("[Spotify] Page fallback failed:", err);
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

/** Fetch Spotify artist data */
export async function fetchSpotifyArtist(
  url: string
): Promise<SpotifyArtistData | null> {
  const artistId = parseSpotifyUrl(url);
  if (!artistId) return null;

  const token = await getSpotifyToken();
  if (token) {
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (res.ok) {
        const data = await res.json();

        return {
          imageUrl: data.images?.[0]?.url ?? null,
          followerCount: data.followers?.total ?? 0,
          name: data.name ?? null,
          platformId: data.id ?? null,
        };
      }

      const text = await res.text().catch(() => "");
      console.error(`[Spotify] Artist lookup failed: ${res.status} ${text}`);
    } catch (err) {
      console.error("[Spotify] Artist lookup error:", err);
    }
  }

  const webToken = await getSpotifyWebToken();
  if (webToken) {
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${artistId}`,
        {
          headers: { Authorization: `Bearer ${webToken}` },
          next: { revalidate: 0 },
        }
      );
      if (res.ok) {
        const data = await res.json();

        return {
          imageUrl: data.images?.[0]?.url ?? null,
          followerCount: data.followers?.total ?? 0,
          name: data.name ?? null,
          platformId: data.id ?? null,
        };
      }

      const text = await res.text().catch(() => "");
      console.error(`[Spotify] Web token artist lookup failed: ${res.status} ${text}`);
    } catch (err) {
      console.error("[Spotify] Web token artist lookup error:", err);
    }
  }

  return fetchSpotifyArtistPageFallback(url, artistId);
}

// ─── Combined ───

export type PlatformStats = {
  imageUrl: string | null;
  followerCount: number;
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
      handle: null,
      platformId: data.platformId,
    };
  }

  if (platform === "TIKTOK" || platform === "INSTAGRAM") {
    return {
      imageUrl: null,
      followerCount: 0,
      handle: extractSocialHandle(platform, url),
      platformId: null,
    };
  }

  return null;
}
