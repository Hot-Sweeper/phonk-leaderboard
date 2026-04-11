import { NextResponse } from "next/server";
import { isValidPreviewUrl } from "@/lib/preview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deezerId = searchParams.get("deezerId")?.trim();
  const src = searchParams.get("src");

  if (deezerId) {
    const deezerResponse = await fetch(`https://api.deezer.com/track/${encodeURIComponent(deezerId)}`, {
      cache: "no-store",
    }).catch(() => null);

    if (!deezerResponse?.ok) {
      return NextResponse.json({ error: "Preview unavailable" }, { status: 502 });
    }

    const deezerTrack = await deezerResponse.json().catch(() => null) as { preview?: string | null } | null;
    const freshPreviewUrl = deezerTrack?.preview ?? null;

    if (isValidPreviewUrl(freshPreviewUrl)) {
      return NextResponse.redirect(freshPreviewUrl!, { status: 307 });
    }
  }

  if (!isValidPreviewUrl(src)) {
    return NextResponse.json({ error: "Invalid preview source" }, { status: 400 });
  }

  return NextResponse.redirect(src!, { status: 307 });
}