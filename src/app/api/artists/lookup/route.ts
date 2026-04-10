import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  fetchYouTubeChannelFull,
  extractSpotifyUrl,
  fetchSpotifyArtist,
  searchYouTubeChannels,
} from "@/lib/platforms";

// POST — lookup a YouTube URL: get channel info + try to find Spotify
// Also supports ?mode=search&q=... for searching YouTube channels
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // YouTube search mode
  if (body.mode === "search") {
    const q = body.q?.trim();
    if (!q) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }
    const channels = await searchYouTubeChannels(q, 5);
    return NextResponse.json(channels);
  }

  // YouTube URL lookup mode
  const { url } = body;
  if (!url?.trim()) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  const yt = await fetchYouTubeChannelFull(url.trim());
  if (!yt) {
    return NextResponse.json(
      { error: "Could not fetch YouTube channel" },
      { status: 404 }
    );
  }

  // Try to find Spotify from channel description
  let spotifyMatch = null;
  const spotifyUrl = extractSpotifyUrl(yt.description);
  if (spotifyUrl) {
    spotifyMatch = await fetchSpotifyArtist(spotifyUrl);
    if (spotifyMatch) {
      (spotifyMatch as Record<string, unknown>).url = spotifyUrl;
    }
  }

  return NextResponse.json({
    youtube: {
      name: yt.name,
      handle: yt.handle,
      imageUrl: yt.imageUrl,
      subscriberCount: yt.subscriberCount,
      platformId: yt.platformId,
      url: url.trim(),
    },
    spotifyMatch: spotifyMatch
      ? {
          ...spotifyMatch,
          url: spotifyUrl,
        }
      : null,
  });
}
