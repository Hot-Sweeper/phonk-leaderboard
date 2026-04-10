import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PATCH — approve or reject an artist request or link suggestion
export async function PATCH(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { requestId, suggestionId, action, reviewNote } = await req.json();
  if (!["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  // Handle link suggestion review
  if (suggestionId) {
    const suggestion = await prisma.linkSuggestion.findUnique({
      where: { id: suggestionId },
    });
    if (!suggestion || suggestion.status !== "PENDING") {
      return NextResponse.json(
        { error: "Suggestion not found or already reviewed." },
        { status: 404 }
      );
    }

    if (action === "reject") {
      await prisma.linkSuggestion.update({
        where: { id: suggestionId },
        data: { status: "REJECTED", reviewedBy: session.user.id },
      });
      return NextResponse.json({ success: true });
    }

    // Approve: upsert the artist link
    await prisma.$transaction([
      prisma.artistLink.upsert({
        where: {
          artistId_platform: {
            artistId: suggestion.artistId,
            platform: suggestion.platform,
          },
        },
        update: { url: suggestion.url },
        create: {
          artistId: suggestion.artistId,
          platform: suggestion.platform,
          url: suggestion.url,
        },
      }),
      prisma.linkSuggestion.update({
        where: { id: suggestionId },
        data: { status: "APPROVED", reviewedBy: session.user.id },
      }),
    ]);
    return NextResponse.json({ success: true });
  }

  // Handle artist request review
  if (!requestId) {
    return NextResponse.json({ error: "requestId or suggestionId required." }, { status: 400 });
  }

  const artistRequest = await prisma.artistRequest.findUnique({
    where: { id: requestId },
  });
  if (!artistRequest || artistRequest.status !== "PENDING") {
    return NextResponse.json(
      { error: "Request not found or already reviewed." },
      { status: 404 }
    );
  }

  if (action === "reject") {
    await prisma.artistRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        reviewedBy: session.user.id,
        reviewNote: reviewNote?.trim() || null,
      },
    });
    return NextResponse.json({ success: true });
  }

  // Approve: parse links and create artist
  const linkLines = artistRequest.links
    .split(/[\n,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const parsedLinks: { platform: string; url: string; handle?: string }[] = [];
  for (const link of linkLines) {
    if (link.includes("youtube.com") || link.includes("youtu.be")) {
      const m = link.match(/@([\w.-]+)/);
      parsedLinks.push({ platform: "YOUTUBE", url: link, handle: m?.[1] });
    } else if (link.includes("spotify.com")) {
      parsedLinks.push({ platform: "SPOTIFY", url: link });
    } else if (link.includes("tiktok.com")) {
      const m = link.match(/@([\w.-]+)/);
      parsedLinks.push({ platform: "TIKTOK", url: link, handle: m?.[1] });
    } else if (link.includes("instagram.com")) {
      const m = link.match(/instagram\.com\/([\w.-]+)/);
      parsedLinks.push({ platform: "INSTAGRAM", url: link, handle: m?.[1] });
    }
  }

  const artist = await prisma.artist.create({
    data: {
      name: artistRequest.name,
      addedById: session.user.id,
      links: {
        create: parsedLinks.map((l) => ({
          platform: l.platform as "YOUTUBE" | "SPOTIFY" | "TIKTOK" | "INSTAGRAM",
          url: l.url,
          handle: l.handle || null,
        })),
      },
    },
    include: { links: true },
  });

  await prisma.artistRequest.update({
    where: { id: requestId },
    data: {
      status: "APPROVED",
      reviewedBy: session.user.id,
      reviewNote: reviewNote?.trim() || null,
    },
  });

  return NextResponse.json(artist);
}
