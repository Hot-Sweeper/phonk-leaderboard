import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/labels — list active labels (public), or all labels (admin)
 */
export async function GET() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const labels = await prisma.submitLabel.findMany({
    where: isAdmin ? {} : { active: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(labels);
}

/**
 * POST /api/labels — create a label (admin only)
 * Body: { name, email, iconUrl?, color? }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const name = body.name?.trim();
  const email = body.email?.trim();
  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  }

  const label = await prisma.submitLabel.create({
    data: {
      name,
      email,
      iconUrl: body.iconUrl?.trim() || null,
      color: body.color?.trim() || "#c026d3",
      addedById: session.user.id,
    },
  });

  return NextResponse.json(label, { status: 201 });
}
