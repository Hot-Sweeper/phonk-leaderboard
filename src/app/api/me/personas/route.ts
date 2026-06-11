import { NextResponse } from "next/server";
import { PersonaType } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  GENRE_SUGGESTIONS,
  PERSONA_TYPES,
  getUserPersonas,
  serializePersona,
  uniqueLabelSlug,
  uniquePersonaSlug,
  userNeedsOnboarding,
} from "@/lib/personas";

const IS_DEV = process.env.NODE_ENV === "development";

async function ensureSessionUser(session: {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: string;
}) {
  const existing = await prisma.user.findUnique({ where: { id: session.id } });
  if (existing) return existing;

  if (!IS_DEV) return null;

  return prisma.user.upsert({
    where: { id: session.id },
    create: {
      id: session.id,
      email: session.email ?? "dev@local",
      name: session.name ?? "Dev Admin",
      image: session.image ?? null,
      role: (session.role as "USER" | "MODERATOR" | "ADMIN") ?? "ADMIN",
    },
    update: {},
  });
}

type OnboardingBody = {
  personas?: unknown;
  displayName?: unknown;
  bio?: unknown;
  genres?: unknown;
  links?: unknown;
};

function parseLinks(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const links: Record<string, string> = {};
  for (const key of ["spotify", "soundcloud", "instagram", "behance", "website"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      links[key] = record[key].trim();
    }
  }
  return links;
}

function parseGenres(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ authenticated: false, personas: [], needsOnboarding: false });
  }

  const user = await ensureSessionUser(session.user);
  if (!user) {
    return NextResponse.json({ authenticated: true, personas: [], needsOnboarding: true });
  }

  const [personas, needsOnboarding] = await Promise.all([
    getUserPersonas(user.id),
    userNeedsOnboarding(user.id),
  ]);

  return NextResponse.json({
    authenticated: true,
    needsOnboarding,
    personas,
    primarySlug: personas[0]?.slug ?? null,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const user = await ensureSessionUser(session.user);
  if (!user) {
    return NextResponse.json({ error: "User account not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as OnboardingBody;
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : session.user.name?.trim() ?? "";

  if (!displayName) {
    return NextResponse.json({ error: "Display name is required." }, { status: 400 });
  }

  const rawPersonas = Array.isArray(body.personas) ? body.personas : [];
  const personaTypes = rawPersonas.filter(
    (value): value is PersonaType => typeof value === "string" && PERSONA_TYPES.includes(value as PersonaType)
  );

  if (personaTypes.length === 0) {
    return NextResponse.json({ error: "Pick at least one role." }, { status: 400 });
  }

  const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 2000) : "";
  const genres = parseGenres(body.genres);
  const links = parseLinks(body.links);
  const avatarUrl = session.user.image ?? null;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const results: PersonaType[] = [];

      for (const type of personaTypes) {
        const slug = await uniquePersonaSlug(displayName, user.id);
        await tx.userPersona.upsert({
          where: {
            userId_type: {
              userId: user.id,
              type,
            },
          },
          create: {
            userId: user.id,
            type,
            slug,
            displayName,
            bio: bio || null,
            avatarUrl,
            genres,
            links,
          },
          update: {
            displayName,
            bio: bio || null,
            avatarUrl,
            genres,
            links,
          },
        });
        results.push(type);

        if (type === "LABEL") {
          const labelSlug = await uniqueLabelSlug(displayName);
          await tx.labelProfile.upsert({
            where: { userId: user.id },
            create: {
              slug: labelSlug,
              name: displayName,
              email: session.user.email ?? "",
              iconUrl: avatarUrl,
              userId: user.id,
              addedById: user.id,
              verified: false,
              active: true,
              guidelines: bio || null,
            },
            update: {
              name: displayName,
              email: session.user.email ?? undefined,
              iconUrl: avatarUrl,
              guidelines: bio || null,
            },
          });
        }
      }

      await tx.user.update({
        where: { id: user.id },
        data: { onboardingCompletedAt: new Date() },
      });

      return results;
    });

    const personas = await getUserPersonas(user.id);
    return NextResponse.json({
      ok: true,
      personas,
      genreSuggestions: GENRE_SUGGESTIONS,
      createdCount: created.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save onboarding.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as OnboardingBody & { type?: unknown };
  const type = typeof body.type === "string" ? (body.type as PersonaType) : null;
  if (!type || !PERSONA_TYPES.includes(type)) {
    return NextResponse.json({ error: "Valid persona type is required." }, { status: 400 });
  }

  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
  if (!displayName) {
    return NextResponse.json({ error: "Display name is required." }, { status: 400 });
  }

  const existing = await prisma.userPersona.findUnique({
    where: { userId_type: { userId: session.user.id, type } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Persona not found." }, { status: 404 });
  }

  const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 2000) : existing.bio;
  const genres = body.genres ? parseGenres(body.genres) : existing.genres;
  const links = body.links ? parseLinks(body.links) : parseLinks(existing.links);

  const persona = await prisma.userPersona.update({
    where: { id: existing.id },
    data: {
      displayName,
      bio,
      genres,
      links,
    },
  });

  if (type === "LABEL") {
    await prisma.labelProfile.updateMany({
      where: { userId: session.user.id },
      data: {
        name: displayName,
        guidelines: bio,
      },
    });
  }

  return NextResponse.json({ persona: serializePersona(persona) });
}
