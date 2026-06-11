import { PersonaType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GENRE_SUGGESTIONS, PERSONA_TYPES } from "@/lib/persona-constants";

export { GENRE_SUGGESTIONS, PERSONA_LABELS, PERSONA_TYPES } from "@/lib/persona-constants";

export type PersonaLinks = {
  spotify?: string;
  soundcloud?: string;
  instagram?: string;
  behance?: string;
  website?: string;
};

export function slugifyPersona(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "user";
}

export async function uniquePersonaSlug(base: string, excludeUserId?: string) {
  const root = slugifyPersona(base);
  let candidate = root;
  let suffix = 1;

  while (true) {
    const existing = await prisma.userPersona.findUnique({
      where: { slug: candidate },
      select: { userId: true },
    });
    if (!existing || existing.userId === excludeUserId) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

export async function uniqueLabelSlug(base: string, excludeId?: string) {
  const root = slugifyPersona(base);
  let candidate = root;
  let suffix = 1;

  while (true) {
    const existing = await prisma.labelProfile.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

export function parsePersonaLinks(value: Prisma.JsonValue | null | undefined): PersonaLinks {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const links: PersonaLinks = {};
  for (const key of ["spotify", "soundcloud", "instagram", "behance", "website"] as const) {
    if (typeof record[key] === "string" && record[key].trim()) {
      links[key] = record[key].trim();
    }
  }
  return links;
}

export function serializePersona(persona: {
  id: string;
  userId: string;
  type: PersonaType;
  slug: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  genres: string[];
  links: Prisma.JsonValue | null;
  verified: boolean;
  artistId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...persona,
    links: parsePersonaLinks(persona.links),
    createdAt: persona.createdAt.toISOString(),
    updatedAt: persona.updatedAt.toISOString(),
  };
}

export async function getUserPersonas(userId: string) {
  const personas = await prisma.userPersona.findMany({
    where: { userId },
    orderBy: { type: "asc" },
  });
  return personas.map(serializePersona);
}

export async function userNeedsOnboarding(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      onboardingCompletedAt: true,
      personas: { select: { id: true }, take: 1 },
    },
  });
  if (!user) return false;
  return !user.onboardingCompletedAt && user.personas.length === 0;
}
