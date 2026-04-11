import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Submit an artist request (any user) or removal request (mods/admins)
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, links, reason, type, artistId } = await req.json();
  const requestType = type === "REMOVAL" ? "REMOVAL" : "ADD";

  if (requestType === "REMOVAL") {
    // Only privileged users can request removal
    const isPrivileged =
      session.user.role === "ADMIN" || session.user.role === "MODERATOR";
    if (!isPrivileged) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!artistId) {
      return NextResponse.json(
        { error: "Artist ID required for removal requests." },
        { status: 400 }
      );
    }

    const artist = await prisma.artist.findUnique({ where: { id: artistId } });
    if (!artist) {
      return NextResponse.json({ error: "Artist not found." }, { status: 404 });
    }

    // Admin can delete directly
    if (session.user.role === "ADMIN") {
      await prisma.artist.delete({ where: { id: artistId } });
      return NextResponse.json({ success: true, directDelete: true });
    }

    // Moderator: create removal request
    const existing = await prisma.artistRequest.findFirst({
      where: {
        userId: session.user.id,
        artistId,
        type: "REMOVAL",
        status: "PENDING",
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already have a pending removal request for this artist." },
        { status: 409 }
      );
    }

    const request = await prisma.artistRequest.create({
      data: {
        type: "REMOVAL",
        name: artist.name,
        artistId,
        reason: reason?.trim() || null,
        userId: session.user.id,
      },
    });

    return NextResponse.json(request, { status: 201 });
  }

  // ADD request
  if (!name?.trim() || !links?.trim()) {
    return NextResponse.json(
      { error: "Artist name and at least one link are required." },
      { status: 400 }
    );
  }

  const existing = await prisma.artistRequest.findFirst({
    where: { userId: session.user.id, name: name.trim(), status: "PENDING", type: "ADD" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending request for this artist." },
      { status: 409 }
    );
  }

  const request = await prisma.artistRequest.create({
    data: {
      type: "ADD",
      name: name.trim(),
      links: links.trim(),
      reason: reason?.trim() || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(request, { status: 201 });
}

// GET — users see own, mods/admins see all
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";

  const requests = await prisma.artistRequest.findMany({
    where: isPrivileged ? {} : { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, image: true, email: true } } },
  });

  return NextResponse.json(requests);
}
