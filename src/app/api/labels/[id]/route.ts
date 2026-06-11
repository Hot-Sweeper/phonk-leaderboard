import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uniqueLabelSlug } from "@/lib/personas";

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
  const existing = await prisma.labelProfile.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Label not found." }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (typeof body.name === "string") {
    data.name = body.name.trim();
    if (body.name.trim() !== existing.name) {
      data.slug = await uniqueLabelSlug(body.name.trim(), id);
    }
  }
  if (typeof body.email === "string") data.email = body.email.trim();
  if (typeof body.iconUrl === "string") data.iconUrl = body.iconUrl.trim() || null;
  if (typeof body.color === "string") data.color = body.color.trim();
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.verified === "boolean") data.verified = body.verified;
  if (typeof body.guidelines === "string") data.guidelines = body.guidelines.trim() || null;
  if (typeof body.discordWebhookUrl === "string") {
    data.discordWebhookUrl = body.discordWebhookUrl.trim() || null;
  }

  const label = await prisma.labelProfile.update({ where: { id }, data });
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
  await prisma.labelProfile.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
