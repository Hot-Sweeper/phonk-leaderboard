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
    thumbnailUrl: item.snippet.thumbnails?.default?.url as string | undefined,
    subscriberCount: parseInt(item.statistics?.subscriberCount ?? "0", 10),
    totalViews: BigInt(item.statistics?.viewCount ?? "0"),
  };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Enforce 1 channel per user (admins/mods can bypass)
  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    const existing = await prisma.channel.findUnique({
      where: { addedById: session.user.id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You have already added a channel." },
        { status: 409 }
      );
    }
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

  const ytData = await fetchYouTubeChannel(handle);

  const channel = await prisma.channel.create({
    data: {
      youtubeId: ytData?.youtubeId ?? handle,
      url,
      name: ytData?.name ?? handle,
      thumbnailUrl: ytData?.thumbnailUrl,
      subscriberCount: ytData?.subscriberCount ?? 0,
      totalViews: ytData?.totalViews ?? BigInt(0),
      addedById: session.user.id,
    },
  });

  // Link channel to user profile
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      youtubeChannelId: ytData?.youtubeId ?? handle,
      youtubeChannelUrl: url,
    },
  });

  return NextResponse.json(channel, { status: 201 });
}

export async function GET() {
  const channels = await prisma.channel.findMany({
    orderBy: { subscriberCount: "desc" },
    include: { addedBy: { select: { name: true, image: true } } },
  });
  // Convert BigInt to string for JSON serialization
  return NextResponse.json(
    channels.map((c) => ({ ...c, totalViews: c.totalViews.toString() }))
  );
}
