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

// PATCH — approve or reject a request
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId, action, reviewNote } = await req.json();
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }

  const channelRequest = await prisma.channelRequest.findUnique({
    where: { id: requestId },
  });
  if (!channelRequest || channelRequest.status !== "PENDING") {
    return NextResponse.json(
      { error: "Request not found or already reviewed." },
      { status: 404 }
    );
  }

  if (action === "reject") {
    const updated = await prisma.channelRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedBy: session.user.id,
        reviewNote: reviewNote?.trim() || null,
      },
    });
    return NextResponse.json(updated);
  }

  // Approve: create the channel
  const match = channelRequest.url.match(/@([\w.-]+)/);
  const handle = match?.[1];

  if (!handle) {
    return NextResponse.json(
      { error: "Could not find a YouTube handle in the URL." },
      { status: 400 }
    );
  }

  // Check duplicate
  const existing = await prisma.channel.findFirst({
    where: { OR: [{ url: channelRequest.url }, { handle }] },
  });
  if (existing) {
    await prisma.channelRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedBy: session.user.id,
        reviewNote: "Channel already exists on the leaderboard.",
      },
    });
    return NextResponse.json(
      { error: "Channel already on the leaderboard." },
      { status: 409 }
    );
  }

  const ytData = await fetchYouTubeChannel(handle);

  const [channel] = await prisma.$transaction([
    prisma.channel.create({
      data: {
        youtubeId: ytData?.youtubeId ?? handle,
        url: channelRequest.url,
        name: ytData?.name ?? handle,
        handle: ytData?.handle ?? handle,
        thumbnailUrl: ytData?.thumbnailUrl,
        subscriberCount: ytData?.subscriberCount ?? 0,
        totalViews: ytData?.totalViews ?? BigInt(0),
        addedById: session.user.id,
      },
    }),
    prisma.channelRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        reviewedBy: session.user.id,
        reviewNote: reviewNote?.trim() || null,
      },
    }),
  ]);

  return NextResponse.json({
    ...channel,
    totalViews: channel.totalViews.toString(),
  });
}
