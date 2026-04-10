import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Add a channel to your watchlist
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channelId } = await req.json();
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.watchlist.create({
        data: { userId: session.user.id, channelId },
      }),
      prisma.channel.update({
        where: { id: channelId },
        data: { watchlistCount: { increment: 1 } },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Already on your watchlist." },
      { status: 409 }
    );
  }
}

// Remove a channel from your watchlist
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { channelId } = await req.json();
  if (!channelId) {
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.watchlist.delete({
        where: {
          userId_channelId: { userId: session.user.id, channelId },
        },
      }),
      prisma.channel.update({
        where: { id: channelId },
        data: { watchlistCount: { decrement: 1 } },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Not on your watchlist." },
      { status: 404 }
    );
  }
}

// Get user's watchlisted channel IDs
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json([]);
  }

  const items = await prisma.watchlist.findMany({
    where: { userId: session.user.id },
    select: { channelId: true },
  });

  return NextResponse.json(items.map((w) => w.channelId));
}
