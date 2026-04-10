import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const songs = await prisma.song.findMany({
    orderBy: { voteCount: "desc" },
  });
  return NextResponse.json(songs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { title, artist, genre, youtubeUrl, spotifyUrl, coverUrl } = body;

  if (!title?.trim() || !artist?.trim()) {
    return NextResponse.json(
      { error: "Title and artist are required." },
      { status: 400 }
    );
  }

  const song = await prisma.song.create({
    data: {
      title: title.trim(),
      artist: artist.trim(),
      genre: genre ?? "PHONK",
      youtubeUrl: youtubeUrl?.trim() || null,
      spotifyUrl: spotifyUrl?.trim() || null,
      coverUrl: coverUrl?.trim() || null,
      submittedById: session.user.id,
    },
  });

  return NextResponse.json(song, { status: 201 });
}
