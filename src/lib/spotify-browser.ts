type SpotifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export type SpotifyBrowserArtist = {
  name: string | null;
  imageUrl: string | null;
  followerCount: number;
  platformId: string | null;
  url: string;
};

const ACCESS_TOKEN_KEY = "spotify_access_token";
const REFRESH_TOKEN_KEY = "spotify_refresh_token";
const EXPIRES_AT_KEY = "spotify_expires_at";
const VERIFIER_KEY = "spotify_pkce_verifier";
const RETURN_TO_KEY = "spotify_return_to";

function parseSpotifyArtistId(url: string): string | null {
  try {
    const parsedUrl = new URL(url);
    const match = parsedUrl.pathname.match(/\/artist\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return base64UrlEncode(new Uint8Array(digest));
}

function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64UrlEncode(bytes);
}

async function getSpotifyClientId(): Promise<string> {
  const res = await fetch("/api/spotify/client-id", { credentials: "include" });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.clientId) {
    throw new Error((data as { error?: string } | null)?.error ?? "Spotify client ID is unavailable.");
  }

  return data.clientId;
}

function saveTokens(token: SpotifyTokenResponse) {
  if (!token.access_token || !token.expires_in) {
    throw new Error("Spotify token response was incomplete.");
  }

  localStorage.setItem(ACCESS_TOKEN_KEY, token.access_token);
  localStorage.setItem(
    EXPIRES_AT_KEY,
    String(Date.now() + (token.expires_in - 60) * 1000)
  );

  if (token.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token.refresh_token);
  }
}

export function hasSpotifyConnection(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(REFRESH_TOKEN_KEY)
  );
}

export function clearSpotifyConnection() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(RETURN_TO_KEY);
}

export async function connectSpotify() {
  const clientId = await getSpotifyClientId();
  const verifier = generateCodeVerifier();
  const challenge = await sha256(verifier);
  const redirectUri = `${window.location.origin}/spotify-auth-callback`;

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(
    RETURN_TO_KEY,
    `${window.location.pathname}${window.location.search}`
  );

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function finishSpotifyAuth(): Promise<string> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");

  if (error) {
    throw new Error(`Spotify authorization failed: ${error}`);
  }

  if (!code) {
    throw new Error("Spotify authorization code is missing.");
  }

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) {
    throw new Error("Spotify PKCE verifier is missing.");
  }

  const clientId = await getSpotifyClientId();
  const redirectUri = `${window.location.origin}/spotify-auth-callback`;

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  const token = (await res.json().catch(() => null)) as SpotifyTokenResponse | null;
  if (!res.ok || !token?.access_token) {
    throw new Error("Spotify token exchange failed.");
  }

  saveTokens(token);
  sessionStorage.removeItem(VERIFIER_KEY);

  const returnTo = sessionStorage.getItem(RETURN_TO_KEY) || "/";
  sessionStorage.removeItem(RETURN_TO_KEY);
  return returnTo;
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const expiresAt = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");

  if (accessToken && Date.now() < expiresAt) {
    return accessToken;
  }

  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    return null;
  }

  const clientId = await getSpotifyClientId();
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const token = (await res.json().catch(() => null)) as SpotifyTokenResponse | null;
  if (!res.ok || !token?.access_token) {
    clearSpotifyConnection();
    return null;
  }

  saveTokens(token);
  return token.access_token;
}

export async function fetchSpotifyArtistInBrowser(
  url: string
): Promise<SpotifyBrowserArtist> {
  const artistId = parseSpotifyArtistId(url);
  if (!artistId) {
    throw new Error("Paste a valid Spotify artist URL.");
  }

  const accessToken = await getSpotifyAccessToken();
  if (!accessToken) {
    throw new Error("Connect Spotify first.");
  }

  const res = await fetch(`https://api.spotify.com/v1/artists/${artistId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    if (res.status === 401) {
      clearSpotifyConnection();
      throw new Error("Spotify connection expired. Connect again.");
    }

    throw new Error("Could not fetch Spotify followers.");
  }

  return {
    name: data.name ?? null,
    imageUrl: data.images?.[0]?.url ?? null,
    followerCount: data.followers?.total ?? 0,
    platformId: data.id ?? artistId,
    url,
  };
}