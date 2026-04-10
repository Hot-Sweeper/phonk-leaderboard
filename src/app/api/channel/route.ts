import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

async function fetchYouTubeChannel(handle: string) {
  if (!YOUTUBE_API_KEY) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/channels");
  url.searchParams.set("part", "snippet,statistics");
  url.searchParams.set("forHandle", handle);
  url.searchParams.set("key", YOUTUBE_API_KEY);
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const item = data.items?.[0];
  if (!item) return null;
  return {
    youtubeId: item.id as string,
    name: item.snippet.title as string,
    handle,
    thumbnailUrl: item.snippet.thumbnails?.default?.url as string | undefined,
    subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0", 10),
    totalViews: BigInt(item.statistics?.viewCount ?? "0"),
  };
}

// Only admins/mods can add channels
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json(
      { error: "Only admins and moderators can add channels." },
      { status: 403 }
    );
  }

  const { url } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Invalid URL." }, { status: 400 });
  }

  const match = url.match(/@([\w.-]+)/);
  const handle = match?.[1];
  if (!handle) {
    return NextResponse.json(
      { error: "Could not find a YouTube handle in the URL." },
      { status: 400 }
    );
  }

  // Check duplicate
  const existing = await prisma.channel.findFirst({
    where: { OR: [{ url }, { handle }] },
  });
  if (existing) {
    return NextResponse.json(
      { error: "This channel is already on the leaderboard." },
      { status: 409 }
    );
  }

  const ytData = await fetchYouTubeChannel(handle);

  const channel = await prisma.channel.create({
    data: {
      youtubeId: ytData?.youtubeId ?? handle,
      url,
      name: ytData?.name ?? handle,
      handle: ytData?.handle ?? handle,
      thumbnailUrl: ytData?.thumbnailUrl,
      subscriberCount: ytData?.subscriberCount ?? 0,
      totalViews: ytData?.totalViews ?? BigInt(0),
      addedById: session.user.id,
    },
  });

  return NextResponse.json(
    { ...channel, totalViews: channel.totalViews.toString() },
    { status: 201 }
  );
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { handle: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const channels = await prisma.channel.findMany({
    where,
    orderBy: { watchlistCount: "desc" },
    take: 50,
  });

  return NextResponse.json(
    channels.map((c) => ({ ...c, totalViews: c.totalViews.toString() }))
  );
}
