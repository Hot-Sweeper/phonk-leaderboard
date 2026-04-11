import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

// GET — list all mod invite links (admin only)
export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const invites = await prisma.modInvite.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { name: true, image: true } },
      _count: { select: { requests: true } },
    },
  });

  return NextResponse.json(invites);
}

// POST — create a new mod invite code (admin only)
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const maxUses = Math.max(1, Math.min(100, body.maxUses ?? 1));
  const expiresInDays = body.expiresInDays as number | undefined;

  const code = randomBytes(6).toString("hex"); // 12-char hex code

  const invite = await prisma.modInvite.create({
    data: {
      code,
      createdById: session.user.id,
      maxUses,
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 86400000)
        : null,
    },
  });

  return NextResponse.json(invite, { status: 201 });
}

// DELETE — deactivate an invite (admin only)
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await req.json();
  if (!id) {
    return NextResponse.json({ error: "Invite ID required." }, { status: 400 });
  }

  await prisma.modInvite.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ success: true });
}
