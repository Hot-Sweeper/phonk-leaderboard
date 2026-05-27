import { NextResponse } from "next/server";
import { isValidPreviewUrl } from "@/lib/preview";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const src = searchParams.get("src")?.trim() ?? null;

  const previewUrl = isValidPreviewUrl(src) ? src : null;

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