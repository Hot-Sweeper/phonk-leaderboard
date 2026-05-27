import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const artistId = searchParams.get("artistId");

  if (!artistId) {
    return NextResponse.json({ error: "artistId required" }, { status: 400 });
  }

  const artist = await prisma.artist.findUnique({
    where: { id: artistId },
    include: {
      links: { orderBy: { platform: "asc" } },
      tracks: {
        orderBy: [{ popularity: "desc" }, { spotifyPopularity: "desc" }],
        take: 20,
      },
      _count: { select: { tracks: true } },
    },
  });

  if (!artist) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  const snapshot = await prisma.artistSnapshot.findFirst({
    where: { artistId: artist.id },
    orderBy: { createdAt: "desc" },
  });

  const rankSnapshot = await prisma.rankSnapshot.findFirst({
    where: { artistId: artist.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ artist, snapshot, rankSnapshot });
}
