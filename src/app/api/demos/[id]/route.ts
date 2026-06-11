import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabelProfileForUser, requireVerifiedLabel, serializeDemo } from "@/lib/demos";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  const { id } = await context.params;

  const demo = await prisma.demoSubmission.findUnique({
    where: { id, active: true },
    include: {
      artist: { select: { id: true, name: true, image: true } },
      targets: { include: { label: { select: { id: true, name: true, slug: true } } } },
      interests: {
        include: { label: { select: { id: true, name: true, slug: true, verified: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!demo) {
    return NextResponse.json({ error: "Demo not found." }, { status: 404 });
  }

  const isArtist = session?.user?.id === demo.artistId;
  const label = session?.user?.id ? await getLabelProfileForUser(session.user.id) : null;
  const isTargetLabel =
    label &&
    (demo.visibility === "PUBLIC" ||
      demo.targets.some((target) => target.labelId === label.id));

  if (!isArtist && !isTargetLabel && session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Demo not found." }, { status: 404 });
  }

  const interested = demo.interests.filter(
    (item) => item.status === "INTERESTED" || item.status === "SHORTLISTED"
  );
  const myInterest = label
    ? demo.interests.find((item) => item.labelId === label.id) ?? null
    : null;

  const payload = serializeDemo({
    ...demo,
    soundcloudUrl: isArtist || isTargetLabel ? demo.soundcloudUrl : "",
    interests: isArtist
      ? interested
      : myInterest?.status === "INTERESTED" || myInterest?.status === "SHORTLISTED"
        ? interested
        : [],
    _count: { interests: interested.length },
  });

  return NextResponse.json({
    demo: payload,
    peerInterestCount: interested.length,
    peerInterestVisible:
      Boolean(myInterest && ["INTERESTED", "SHORTLISTED"].includes(myInterest.status)) || isArtist,
    myStatus: myInterest?.status ?? null,
    canActAsLabel: Boolean(label?.verified && isTargetLabel),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const label = await requireVerifiedLabel(session.user.id);
  if (!label) {
    return NextResponse.json({ error: "Verified label profile required." }, { status: 403 });
  }

  const { id } = await context.params;
  const demo = await prisma.demoSubmission.findUnique({
    where: { id, active: true },
    include: { targets: true },
  });

  if (!demo) {
    return NextResponse.json({ error: "Demo not found." }, { status: 404 });
  }

  const canView =
    demo.visibility === "PUBLIC" || demo.targets.some((target) => target.labelId === label.id);
  if (!canView) {
    return NextResponse.json({ error: "Demo not available to your label." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const status =
    body.status === "PASSED" || body.status === "SHORTLISTED" || body.status === "INTERESTED"
      ? body.status
      : "INTERESTED";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : null;

  const interest = await prisma.demoInterest.upsert({
    where: { demoId_labelId: { demoId: id, labelId: label.id } },
    create: {
      demoId: id,
      labelId: label.id,
      actorUserId: session.user.id,
      status,
      note,
    },
    update: { status, note, actorUserId: session.user.id },
  });

  return NextResponse.json({
    id: interest.id,
    status: interest.status,
    note: interest.note,
  });
}
