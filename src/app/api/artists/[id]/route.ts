import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET single artist with all links
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const artist = await prisma.artist.findUnique({
    where: { id },
    include: {
      links: { orderBy: { platform: "asc" } },
      suggestions: {
        where: { status: "PENDING" },
        select: { id: true, platform: true, url: true, note: true, createdAt: true },
      },
    },
  });

  if (!artist) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(artist);
}
