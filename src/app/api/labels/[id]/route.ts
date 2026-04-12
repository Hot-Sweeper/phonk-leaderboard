import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/labels/[id] — update a label (admin only)
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.email === "string") data.email = body.email.trim();
  if (typeof body.iconUrl === "string") data.iconUrl = body.iconUrl.trim() || null;
  if (typeof body.color === "string") data.color = body.color.trim();
  if (typeof body.active === "boolean") data.active = body.active;

  const label = await prisma.submitLabel.update({ where: { id }, data });
  return NextResponse.json(label);
}

/**
 * DELETE /api/labels/[id] — delete a label (admin only)
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.submitLabel.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
