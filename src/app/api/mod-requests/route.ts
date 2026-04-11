import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST — claim a mod invite code (any authenticated user)
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role === "ADMIN" || session.user.role === "MODERATOR") {
    return NextResponse.json(
      { error: "You are already a moderator or admin." },
      { status: 400 }
    );
  }

  const { code } = await req.json();
  if (!code?.trim()) {
    return NextResponse.json({ error: "Invite code required." }, { status: 400 });
  }

  const invite = await prisma.modInvite.findUnique({
    where: { code: code.trim() },
  });

  if (!invite || !invite.active) {
    return NextResponse.json({ error: "Invalid or expired invite code." }, { status: 404 });
  }

  if (invite.expiresAt && invite.expiresAt < new Date()) {
    return NextResponse.json({ error: "This invite code has expired." }, { status: 410 });
  }

  if (invite.usedCount >= invite.maxUses) {
    return NextResponse.json({ error: "This invite code has reached its usage limit." }, { status: 410 });
  }

  // Check for existing request
  const existing = await prisma.modRequest.findUnique({
    where: {
      userId_inviteId: { userId: session.user.id, inviteId: invite.id },
    },
  });
  if (existing) {
    return NextResponse.json(
      { error: "You already submitted a request with this invite." },
      { status: 409 }
    );
  }

  // Create mod request
  const modRequest = await prisma.modRequest.create({
    data: {
      userId: session.user.id,
      inviteId: invite.id,
    },
  });

  // Increment used count
  await prisma.modInvite.update({
    where: { id: invite.id },
    data: { usedCount: { increment: 1 } },
  });

  return NextResponse.json(modRequest, { status: 201 });
}

// GET — list mod requests (admins see all pending, users see own)
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = session.user.role === "ADMIN";

  const requests = await prisma.modRequest.findMany({
    where: isAdmin ? {} : { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { name: true, image: true, email: true } },
      invite: { select: { code: true } },
    },
  });

  return NextResponse.json(requests);
}
