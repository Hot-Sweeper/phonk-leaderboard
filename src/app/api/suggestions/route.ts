import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET all pending suggestions (mods/admins only)
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const suggestions = await prisma.linkSuggestion.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      artist: { select: { name: true } },
      user: { select: { name: true, image: true } },
    },
  });

  return NextResponse.json(suggestions);
}
