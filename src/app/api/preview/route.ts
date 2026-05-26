import { NextResponse } from "next/server";
import { isValidPreviewUrl } from "@/lib/preview";

export const dynamic = "force-dynamic";

type PreviewCacheEntry = {
  url: string;
  timestamp: number;
};

const previewRedirectCache = new Map<string, PreviewCacheEntry>();
const PREVIEW_REDIRECT_CACHE_TTL = 900_000; // 15 minutes
const DEEZER_PREVIEW_REFRESH_BUFFER_SECONDS = 120;

function shouldRefreshDeezerPreviewUrl(src: string | null, deezerId: string | null) {
  if (!deezerId || !isValidPreviewUrl(src)) {
    return false;
  }

  try {
    const url = new URL(src!);
    if (!url.hostname.endsWith(".dzcdn.net")) {
      return false;
    }

    const token = url.searchParams.get("hdnea");
    if (!token) {
      return false;
    }

    const expPart = token.split("~").find((part) => part.startsWith("exp="));
    if (!expPart) {
      return false;
    }

    const exp = Number.parseInt(expPart.slice(4), 10);
    if (!Number.isFinite(exp)) {
      return false;
    }

    return exp <= Math.floor(Date.now() / 1000) + DEEZER_PREVIEW_REFRESH_BUFFER_SECONDS;
  } catch {
    return false;
  }
}

async function resolvePreviewUrl(src: string | null, deezerId: string | null) {
  const canUseSourceUrl = isValidPreviewUrl(src) && !shouldRefreshDeezerPreviewUrl(src, deezerId);

  if (canUseSourceUrl) {
    return src;
  }

  if (!deezerId) {
    return isValidPreviewUrl(src) ? src : null;
  }

  const now = Date.now();
  const cachedPreview = previewRedirectCache.get(deezerId);
  if (cachedPreview && now - cachedPreview.timestamp < PREVIEW_REDIRECT_CACHE_TTL) {
    return cachedPreview.url;
  }

  const deezerResponse = await fetch(`https://api.deezer.com/track/${encodeURIComponent(deezerId)}`, {
    cache: "no-store",
  }).catch(() => null);

  if (!deezerResponse?.ok) {
    return null;
  }

  const deezerTrack = await deezerResponse.json().catch(() => null) as { preview?: string | null } | null;
  const freshPreviewUrl = deezerTrack?.preview ?? null;

  if (!isValidPreviewUrl(freshPreviewUrl)) {
    return isValidPreviewUrl(src) ? src : null;
  }

  previewRedirectCache.set(deezerId, { url: freshPreviewUrl!, timestamp: now });
  return freshPreviewUrl;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deezerId = searchParams.get("deezerId")?.trim();
  const src = searchParams.get("src")?.trim() ?? null;

  const previewUrl = await resolvePreviewUrl(src, deezerId ?? null);

  if (!previewUrl) {
    return NextResponse.json({ error: "Invalid preview source" }, { status: 400 });
  }

  return NextResponse.redirect(previewUrl, {
    status: 307,
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
    },
  });
}