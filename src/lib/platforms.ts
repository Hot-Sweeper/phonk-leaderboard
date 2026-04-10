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

// ─── Spotify ───

let spotifyToken: string | null = null;
let spotifyTokenExpiry = 0;

/** Get a Spotify access token via Client Credentials flow */
async function getSpotifyToken(): Promise<string | null> {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json();
    spotifyToken = data.access_token;
    spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
  } catch {
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

/** Fetch Spotify artist data */
export async function fetchSpotifyArtist(
  url: string
): Promise<SpotifyArtistData | null> {
  const artistId = parseSpotifyUrl(url);
  if (!artistId) return null;

  const token = await getSpotifyToken();
  if (!token) return null;

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/artists/${artistId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();

    return {
      imageUrl: data.images?.[0]?.url ?? null,
      followerCount: data.followers?.total ?? 0,
      name: data.name ?? null,
      platformId: data.id ?? null,
    };
  } catch {
    return null;
  }
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

  // TikTok and Instagram don't have easy public APIs
  return null;
}
