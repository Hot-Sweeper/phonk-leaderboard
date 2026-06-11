import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePersonaLinks, serializePersona } from "@/lib/personas";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;

  const persona = await prisma.userPersona.findUnique({
    where: { slug },
    include: {
      user: {
        select: {
          image: true,
          createdAt: true,
        },
      },
      artist: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
        },
      },
    },
  });

  if (!persona) {
    return NextResponse.json({ error: "Profile not found." }, { status: 404 });
  }

  const labelProfile =
    persona.type === "LABEL"
      ? await prisma.labelProfile.findFirst({
          where: { userId: persona.userId },
          select: {
            id: true,
            slug: true,
            verified: true,
            guidelines: true,
            active: true,
          },
        })
      : null;

  return NextResponse.json({
    persona: serializePersona(persona),
    memberSince: persona.user.createdAt.toISOString(),
    catalogArtist: persona.artist,
    labelProfile,
    links: parsePersonaLinks(persona.links),
  });
}
