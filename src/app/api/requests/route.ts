import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Submit an artist request (any user)
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, links, reason } = await req.json();
  if (!name?.trim() || !links?.trim()) {
    return NextResponse.json(
      { error: "Artist name and at least one link are required." },
      { status: 400 }
    );
  }

  const existing = await prisma.artistRequest.findFirst({
    where: { userId: session.user.id, name: name.trim(), status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending request for this artist." },
      { status: 409 }
    );
  }

  const request = await prisma.artistRequest.create({
    data: {
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
