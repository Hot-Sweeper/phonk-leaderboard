import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchSpotifyArtists } from "@/lib/platforms";

// POST — search Spotify artists by name
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

  const { q } = await req.json();
  if (!q?.trim()) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const results = await searchSpotifyArtists(q.trim(), 8);
  const withUrls = results.map((r) => ({
    ...r,
    url: `https://open.spotify.com/artist/${r.platformId}`,
  }));

  return NextResponse.json(withUrls);
}
