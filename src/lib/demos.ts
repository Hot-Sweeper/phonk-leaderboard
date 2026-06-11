import { prisma } from "@/lib/prisma";

export const MAX_PREVIEW_DURATION_MS = 60_000;
export const DEFAULT_PREVIEW_DURATION_MS = 45_000;

export async function getLabelProfileForUser(userId: string) {
  return prisma.labelProfile.findFirst({
    where: { userId, active: true },
  });
}

export async function requireVerifiedLabel(userId: string) {
  const label = await getLabelProfileForUser(userId);
  if (!label?.verified) return null;
  return label;
}

export function clampPreviewWindow(
  previewStartMs: number,
  previewDurationMs: number,
  durationMs: number
) {
  const maxStart = Math.max(0, durationMs - 5_000);
  const start = Math.max(0, Math.min(previewStartMs, maxStart));
  const maxDuration = Math.min(
    MAX_PREVIEW_DURATION_MS,
    Math.max(5_000, durationMs - start)
  );
  const duration = Math.max(5_000, Math.min(previewDurationMs, maxDuration));
  return { previewStartMs: start, previewDurationMs: duration };
}

export function serializeDemo(demo: {
  id: string;
  artistId: string;
  title: string;
  artists: string[];
  genre: string | null;
  releaseType: string | null;
  soundcloudUrl: string;
  artworkUrl: string | null;
  durationMs: number;
  previewStartMs: number;
  previewDurationMs: number;
  message: string | null;
  samplePackUrl: string | null;
  tags: string[];
  visibility: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  artist?: { id: string; name: string | null; image: string | null };
  interests?: Array<{
    id: string;
    status: string;
    note: string | null;
    createdAt: Date;
    label: { id: string; name: string; slug: string; verified: boolean };
  }>;
  targets?: Array<{ label: { id: string; name: string; slug: string } }>;
  _count?: { interests: number };
}) {
  return {
    id: demo.id,
    artistId: demo.artistId,
    title: demo.title,
    artists: demo.artists,
    genre: demo.genre,
    releaseType: demo.releaseType,
    soundcloudUrl: demo.soundcloudUrl,
    artworkUrl: demo.artworkUrl,
    durationMs: demo.durationMs,
    previewStartMs: demo.previewStartMs,
    previewDurationMs: demo.previewDurationMs,
    message: demo.message,
    samplePackUrl: demo.samplePackUrl,
    tags: demo.tags,
    visibility: demo.visibility,
    active: demo.active,
    interestCount: demo._count?.interests ?? demo.interests?.filter((i) => i.status === "INTERESTED" || i.status === "SHORTLISTED").length ?? 0,
    interests: demo.interests?.map((interest) => ({
      id: interest.id,
      status: interest.status,
      note: interest.note,
      createdAt: interest.createdAt.toISOString(),
      label: interest.label,
    })),
    targets: demo.targets?.map((target) => target.label),
    artist: demo.artist,
    createdAt: demo.createdAt.toISOString(),
    updatedAt: demo.updatedAt.toISOString(),
  };
}
