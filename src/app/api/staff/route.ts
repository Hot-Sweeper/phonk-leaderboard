import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — list all admins and moderators (admin/mod only)
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

  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MODERATOR"] } },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      createdAt: true,
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(staff);
}

// PATCH — demote a moderator to USER (admin only)
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await req.json();
  if (!userId) {
    return NextResponse.json({ error: "User ID required." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    return NextResponse.json(
      { error: "Cannot demote another admin." },
      { status: 403 }
    );
  }

  if (target.role !== "MODERATOR") {
    return NextResponse.json(
      { error: "User is not a moderator." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { role: "USER" },
  });

  return NextResponse.json({ success: true });
}
