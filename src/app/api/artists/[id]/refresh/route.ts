import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hydrateArtistNow } from "@/lib/update-runner";

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
  });
  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await hydrateArtistNow(id);

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
