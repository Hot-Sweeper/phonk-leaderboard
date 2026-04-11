import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchPlatformStats } from "@/lib/platforms";

// POST — refresh platform stats for an artist (admin/mod only)
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const artist = await prisma.artist.findUnique({
    where: { id },
    include: { links: true },
  });
  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let newImageUrl = artist.imageUrl;
  let spotifyImage: string | null = null;

  // Fetch stats for each link in parallel
  await Promise.all(
    artist.links.map(async (link) => {
      const stats = await fetchPlatformStats(link.platform, link.url);
      if (!stats) return;

      await prisma.artistLink.update({
        where: { id: link.id },
        data: {
          followerCount: stats.followerCount,
          monthlyListeners: stats.monthlyListeners,
          handle: stats.handle ?? link.handle,
          platformId: stats.platformId ?? link.platformId,
        },
      });

      // Spotify is the primary source for name and image
      if (link.platform === "SPOTIFY" && stats.imageUrl) {
        spotifyImage = stats.imageUrl;
      }
    })
  );

  // Always prefer Spotify image
  if (spotifyImage) {
    newImageUrl = spotifyImage;
  }

  // Update artist image if changed
  if (newImageUrl !== artist.imageUrl) {
    await prisma.artist.update({
      where: { id },
      data: { imageUrl: newImageUrl },
    });
  }

  const updated = await prisma.artist.findUnique({
    where: { id },
    include: {
      links: { orderBy: { platform: "asc" } },
      suggestions: {
        where: { status: "PENDING" },
        select: { id: true, platform: true, url: true, note: true, createdAt: true },
      },
    },
  });

  return NextResponse.json(updated);
}
