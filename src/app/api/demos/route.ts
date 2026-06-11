import { NextResponse } from "next/server";
import { DemoInterestStatus, DemoVisibility } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  clampPreviewWindow,
  getLabelProfileForUser,
  serializeDemo,
} from "@/lib/demos";

const activeInterestStatuses: DemoInterestStatus[] = ["INTERESTED", "SHORTLISTED"];

const demoInclude = {
  artist: { select: { id: true, name: true, image: true } },
  targets: { include: { label: { select: { id: true, name: true, slug: true } } } },
  interests: {
    where: { status: { in: activeInterestStatuses } },
    include: { label: { select: { id: true, name: true, slug: true, verified: true } } },
    orderBy: { createdAt: "desc" as const },
  },
  _count: { select: { interests: true } },
};

export async function GET(request: Request) {
  const session = await auth();
  const { searchParams } = new URL(request.url);
  const mine = searchParams.get("mine") === "1";
  const inbox = searchParams.get("inbox") === "1";

  if (mine) {
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const demos = await prisma.demoSubmission.findMany({
      where: { artistId: session.user.id, active: true },
      orderBy: { createdAt: "desc" },
      include: demoInclude,
    });
    return NextResponse.json(demos.map(serializeDemo));
  }

  if (inbox) {
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }
    const label = await getLabelProfileForUser(session.user.id);
    if (!label) {
      return NextResponse.json({ error: "Label profile required." }, { status: 403 });
    }

    const demos = await prisma.demoSubmission.findMany({
      where: {
        active: true,
        OR: [
          { visibility: "PUBLIC" },
          { targets: { some: { labelId: label.id } } },
        ],
        NOT: {
          interests: {
            some: { labelId: label.id, status: "PASSED" },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      include: {
        ...demoInclude,
        interests: {
          where: { status: { in: activeInterestStatuses } },
          include: { label: { select: { id: true, name: true, slug: true, verified: true } } },
        },
      },
    });

    const myInterest = await prisma.demoInterest.findMany({
      where: { labelId: label.id },
      select: { demoId: true, status: true },
    });
    const interestByDemo = new Map(myInterest.map((item) => [item.demoId, item.status]));

    return NextResponse.json(
      demos.map((demo) => ({
        ...serializeDemo(demo),
        myStatus: interestByDemo.get(demo.id) ?? null,
        verifiedInbox: label.verified,
      }))
    );
  }

  const demos = await prisma.demoSubmission.findMany({
    where: { active: true, visibility: "PUBLIC" },
    orderBy: { createdAt: "desc" },
    take: 24,
    include: {
      artist: { select: { id: true, name: true, image: true } },
      _count: { select: { interests: true } },
    },
  });

  return NextResponse.json(
    demos.map((demo) =>
      serializeDemo({
        ...demo,
        soundcloudUrl: "",
        interests: [],
        targets: [],
      })
    )
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const soundcloudUrl = typeof body.soundcloudUrl === "string" ? body.soundcloudUrl.trim() : "";
  const labelIds = Array.isArray(body.labelIds)
    ? body.labelIds.filter((id: unknown): id is string => typeof id === "string")
    : [];

  if (!title || !soundcloudUrl.includes("soundcloud.com/")) {
    return NextResponse.json({ error: "Title and SoundCloud URL are required." }, { status: 400 });
  }

  const durationMs = Number(body.durationMs) || 0;
  const preview = clampPreviewWindow(
    Number(body.previewStartMs) || 0,
    Number(body.previewDurationMs) || 45_000,
    durationMs || 180_000
  );

  const artists = Array.isArray(body.artists)
    ? body.artists.filter((name: unknown): name is string => typeof name === "string").map((name: string) => name.trim()).filter(Boolean)
    : [];

  const visibility: DemoVisibility =
    labelIds.length > 0 && body.visibility !== "PUBLIC" ? "DIRECT" : "PUBLIC";

  const demo = await prisma.demoSubmission.create({
    data: {
      artistId: session.user.id,
      title,
      artists,
      genre: typeof body.genre === "string" ? body.genre.trim() || null : null,
      releaseType: typeof body.releaseType === "string" ? body.releaseType : "Single",
      soundcloudUrl,
      artworkUrl: typeof body.artworkUrl === "string" ? body.artworkUrl : null,
      durationMs,
      previewStartMs: preview.previewStartMs,
      previewDurationMs: preview.previewDurationMs,
      message: typeof body.message === "string" ? body.message.trim() || null : null,
      samplePackUrl: typeof body.samplePackUrl === "string" ? body.samplePackUrl.trim() || null : null,
      tags: Array.isArray(body.tags)
        ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string").map((tag: string) => tag.trim().toLowerCase()).filter(Boolean)
        : [],
      visibility,
      targets:
        visibility === "DIRECT" && labelIds.length > 0
          ? {
              create: labelIds.map((labelId: string) => ({ labelId })),
            }
          : undefined,
    },
    include: demoInclude,
  });

  return NextResponse.json(serializeDemo(demo), { status: 201 });
}
