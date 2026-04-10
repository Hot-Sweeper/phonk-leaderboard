import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Submit a request to join the leaderboard
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { url, reason } = await req.json();
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL is required." }, { status: 400 });
  }

  // Check if user already has a pending request for this URL
  const existing = await prisma.channelRequest.findFirst({
    where: { userId: session.user.id, url, status: "PENDING" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already have a pending request for this channel." },
      { status: 409 }
    );
  }

  const request = await prisma.channelRequest.create({
    data: {
      url,
      reason: reason?.trim() || null,
      userId: session.user.id,
    },
  });

  return NextResponse.json(request, { status: 201 });
}

// Get requests — users see their own, mods/admins see all
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";

  const requests = await prisma.channelRequest.findMany({
    where: isPrivileged ? {} : { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, image: true, email: true } } },
  });

  return NextResponse.json(requests);
}
