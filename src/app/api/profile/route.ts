import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { bio, spotifyUrl, appleMusicUrl, instagramUrl, tiktokUrl } =
    await req.json();

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      bio: bio?.trim() ?? undefined,
      spotifyUrl: spotifyUrl?.trim() || null,
      appleMusicUrl: appleMusicUrl?.trim() || null,
      instagramUrl: instagramUrl?.trim() || null,
      tiktokUrl: tiktokUrl?.trim() || null,
    },
    select: {
      id: true,
      name: true,
      bio: true,
      image: true,
      spotifyUrl: true,
      appleMusicUrl: true,
      instagramUrl: true,
      tiktokUrl: true,
      youtubeChannelUrl: true,
      role: true,
    },
  });

  return NextResponse.json(user);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      bio: true,
      image: true,
      spotifyUrl: true,
      appleMusicUrl: true,
      instagramUrl: true,
      tiktokUrl: true,
      youtubeChannelUrl: true,
      role: true,
      channel: true,
      createdAt: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(user);
}
