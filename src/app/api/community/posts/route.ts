import { NextResponse } from "next/server";
import { ReleasePostKind } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  RELEASE_POST_KINDS,
  getPersonaForUser,
  isPromotionActive,
  releasePostInclude,
  serializeReleasePost,
} from "@/lib/community";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine") === "1";
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? 30) || 30));
  const session = await auth();

  if (mine) {
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const posts = await prisma.releasePost.findMany({
      where: { authorId: session.user.id, active: true },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: releasePostInclude,
    });
    return NextResponse.json(posts.map(serializeReleasePost));
  }

  const posts = await prisma.releasePost.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    take: limit * 2,
    include: releasePostInclude,
  });

  const sorted = [...posts].sort((a, b) => {
    const aPromoted = a.promotion && isPromotionActive(a.promotion.status, a.promotion.endsAt);
    const bPromoted = b.promotion && isPromotionActive(b.promotion.status, b.promotion.endsAt);
    if (aPromoted && !bPromoted) return -1;
    if (!aPromoted && bPromoted) return 1;
    if (aPromoted && bPromoted) {
      const aEnds = a.promotion?.endsAt?.getTime() ?? 0;
      const bEnds = b.promotion?.endsAt?.getTime() ?? 0;
      if (aEnds !== bEnds) return bEnds - aEnds;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return NextResponse.json(sorted.slice(0, limit).map(serializeReleasePost));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 3 || title.length > 160) {
    return NextResponse.json({ error: "Title must be 3–160 characters." }, { status: 400 });
  }

  const kindRaw = typeof body.kind === "string" ? body.kind.toUpperCase() : "RELEASE";
  const kind = RELEASE_POST_KINDS.includes(kindRaw as ReleasePostKind)
    ? (kindRaw as ReleasePostKind)
    : "RELEASE";

  const postBody = typeof body.body === "string" ? body.body.trim().slice(0, 5000) : null;
  const externalUrl = typeof body.externalUrl === "string" ? body.externalUrl.trim() : null;
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : null;
  const trackId = typeof body.trackId === "string" ? body.trackId.trim() : null;
  const personaId = typeof body.personaId === "string" ? body.personaId.trim() : null;
  const tags = Array.isArray(body.tags)
    ? body.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 8)
    : [];

  const persona = await getPersonaForUser(session.user.id, personaId);
  if (!persona) {
    return NextResponse.json({ error: "Complete onboarding before posting." }, { status: 403 });
  }

  if (trackId) {
    const track = await prisma.track.findUnique({ where: { id: trackId }, select: { id: true } });
    if (!track) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }
  }

  const post = await prisma.releasePost.create({
    data: {
      authorId: session.user.id,
      personaId: persona.id,
      kind,
      title,
      body: postBody || null,
      trackId: trackId || null,
      externalUrl: externalUrl || null,
      imageUrl: imageUrl || null,
      tags,
    },
    include: releasePostInclude,
  });

  return NextResponse.json(serializeReleasePost(post), { status: 201 });
}
