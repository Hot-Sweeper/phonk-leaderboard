import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST — suggest a link change for an artist
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: artistId } = await params;
  const { platform, url, note } = await req.json();

  if (!platform || !url?.trim()) {
    return NextResponse.json(
      { error: "Platform and URL are required." },
      { status: 400 }
    );
  }

  if (!["YOUTUBE", "SPOTIFY", "TIKTOK", "INSTAGRAM"].includes(platform)) {
    return NextResponse.json({ error: "Invalid platform." }, { status: 400 });
  }

  // Check for existing pending suggestion
  const existing = await prisma.linkSuggestion.findFirst({
    where: { artistId, platform, userId: session.user.id, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending suggestion for this platform." },
      { status: 409 }
    );
  }

  const suggestion = await prisma.linkSuggestion.create({
    data: {
      artistId,
      platform,
      url: url.trim(),
      note: note?.trim() || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(suggestion, { status: 201 });
}
