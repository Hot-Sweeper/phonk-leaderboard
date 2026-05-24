import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const WATCHLIST_CACHE_TTL = 30_000;

type WatchlistCacheEntry = {
  expiresAt: number;
  data: unknown;
};

const watchlistCache = new Map<string, WatchlistCacheEntry>();
const watchlistInFlight = new Map<string, Promise<unknown>>();

function getWatchlistCacheKey(userId: string, details: boolean) {
  return `${userId}:${details ? "details" : "ids"}`;
}

function clearWatchlistCache(userId: string) {
  for (const details of [true, false]) {
    const key = getWatchlistCacheKey(userId, details);
    watchlistCache.delete(key);
    watchlistInFlight.delete(key);
  }
}

async function getCachedWatchlist<T>(key: string, load: () => Promise<T>) {
  const cached = watchlistCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const inFlight = watchlistInFlight.get(key);
  if (inFlight) {
    return inFlight as Promise<T>;
  }

  const request = load();
  watchlistInFlight.set(key, request);

  try {
    const data = await request;
    watchlistCache.set(key, { data, expiresAt: Date.now() + WATCHLIST_CACHE_TTL });
    return data;
  } finally {
    if (watchlistInFlight.get(key) === request) {
      watchlistInFlight.delete(key);
    }
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artistId } = await req.json();
  if (!artistId) {
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.watchlist.create({
        data: { userId: session.user.id, artistId },
      }),
      prisma.artist.update({
        where: { id: artistId },
        data: { watchlistCount: { increment: 1 } },
      }),
    ]);
    clearWatchlistCache(session.user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Already on your watchlist." },
      { status: 409 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artistId } = await req.json();
  if (!artistId) {
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.watchlist.delete({
        where: {
          userId_artistId: { userId: session.user.id, artistId },
        },
      }),
      prisma.artist.update({
        where: { id: artistId },
        data: { watchlistCount: { decrement: 1 } },
      }),
    ]);
    clearWatchlistCache(session.user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Not on your watchlist." },
      { status: 404 }
    );
  }
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json([]);
  }

  const { searchParams } = new URL(req.url);
  const details = searchParams.get("details") === "true";
  const cacheKey = getWatchlistCacheKey(session.user.id, details);

  if (details) {
    const artists = await getCachedWatchlist(cacheKey, async () => {
      const items = await prisma.watchlist.findMany({
        where: { userId: session.user.id },
        select: { artist: { select: { id: true, name: true, imageUrl: true } } },
      });
      return items.map((watchlistItem) => watchlistItem.artist);
    });
    return NextResponse.json(artists);
  }

  const artistIds = await getCachedWatchlist(cacheKey, async () => {
    const items = await prisma.watchlist.findMany({
      where: { userId: session.user.id },
      select: { artistId: true },
    });
    return items.map((watchlistItem) => watchlistItem.artistId);
  });
  return NextResponse.json(artistIds);
}
