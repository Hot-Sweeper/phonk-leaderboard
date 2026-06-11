import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { releasePostInclude, serializeReleasePost } from "@/lib/community";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const post = await prisma.releasePost.findFirst({
    where: { id, active: true },
    include: releasePostInclude,
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  return NextResponse.json(serializeReleasePost(post));
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const post = await prisma.releasePost.findUnique({ where: { id } });
  if (!post || post.authorId !== session.user.id) {
    return NextResponse.json({ error: "Post not found." }, { status: 404 });
  }

  await prisma.releasePost.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}
