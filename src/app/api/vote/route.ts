import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { songId } = await req.json();
  if (!songId) {
    return NextResponse.json({ error: "songId required" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.vote.create({
        data: { userId: session.user.id, songId },
      }),
      prisma.song.update({
        where: { id: songId },
        data: { voteCount: { increment: 1 } },
      }),
    ]);
    return NextResponse.json({ success: true });
  } catch {
    // Unique constraint = already voted
    return NextResponse.json(
      { error: "Already voted for this song." },
      { status: 409 }
    );
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { songId } = await req.json();
  if (!songId) {
    return NextResponse.json({ error: "songId required" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.vote.delete({
      where: { userId_songId: { userId: session.user.id, songId } },
    }),
    prisma.song.update({
      where: { id: songId },
      data: { voteCount: { decrement: 1 } },
    }),
  ]);

  return NextResponse.json({ success: true });
}
