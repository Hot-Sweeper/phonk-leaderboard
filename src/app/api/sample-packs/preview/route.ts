import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { scrapePackUrls, validatePackUrl } from "@/lib/pack-scraper";

/**
 * POST /api/sample-packs/preview — scrape metadata without saving (admin only)
 * Body: { payhipUrl?, gumroadUrl? }
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const payhipUrl: string | undefined = body.payhipUrl?.trim() || undefined;
  const gumroadUrl: string | undefined = body.gumroadUrl?.trim() || undefined;

  if (!payhipUrl && !gumroadUrl) {
    return NextResponse.json({ error: "At least one URL is required" }, { status: 400 });
  }
  if (payhipUrl && !validatePackUrl(payhipUrl)) {
    return NextResponse.json({ error: "Invalid Payhip URL" }, { status: 400 });
  }
  if (gumroadUrl && !validatePackUrl(gumroadUrl)) {
    return NextResponse.json({ error: "Invalid Gumroad URL" }, { status: 400 });
  }

  try {
    const scraped = await scrapePackUrls(payhipUrl, gumroadUrl);
    return NextResponse.json(scraped);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scrape URL";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
