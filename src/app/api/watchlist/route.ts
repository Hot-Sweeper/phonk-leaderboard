import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Not on your watchlist." },
      { status: 404 }
    );
  }
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json([]);
  }

  const items = await prisma.watchlist.findMany({
    where: { userId: session.user.id },
    select: { artistId: true },
  });

  return NextResponse.json(items.map((w) => w.artistId));
}
