import { NextResponse } from "next/server";

/**
 * POST /api/soundcloud/preview — scrape SoundCloud track metadata
 * Body: { url: string }
 * Returns: { title, artist, artworkUrl, duration, genre, description, permalinkUrl }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const url = body?.url?.trim();

  if (!url || !url.includes("soundcloud.com/")) {
    return NextResponse.json({ error: "Valid SoundCloud URL required" }, { status: 400 });
  }

  try {
    // Use oEmbed API to get basic metadata (no API key required)
    const oembedUrl = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`;
    const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });
    if (!oembedRes.ok) {
      return NextResponse.json({ error: "Could not fetch SoundCloud track. Check the URL." }, { status: 422 });
    }
    const oembed = await oembedRes.json();

    // Scrape the actual page for more metadata (artwork, duration, etc.)
    const pageRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(10000),
    });
    const html = await pageRes.text();

    // Extract high-res artwork from meta tags
    let artworkUrl = extractMeta(html, "og:image") || extractMeta(html, "twitter:image");
    // SoundCloud artwork URLs can be upgraded to higher resolution
    if (artworkUrl) {
      artworkUrl = artworkUrl.replace("-t500x500.", "-t500x500.").replace("-large.", "-t500x500.");
    }

    // Extract desc and other meta
    const description = extractMeta(html, "og:description") || "";
    const title = extractMeta(html, "og:title") || oembed.title || "";
    const genre = extractMetaProperty(html, "music:genre") || "";

    // Parse title: SoundCloud format is usually "Artist - Title" or just "Title" by "Author"
    let artist = oembed.author_name || "";
    let trackTitle = title;

    // Try to split "Artist - Title" format
    const dashMatch = title.match(/^(.+?)\s*[-\u2013\u2014]\s*(.+)$/);
    if (dashMatch) {
      artist = dashMatch[1].trim();
      trackTitle = dashMatch[2].trim();
    }

    // Extract duration from meta or hydration data
    let duration = 0;
    const durationMatch = html.match(/"duration":(\d+)/);
    if (durationMatch) {
      duration = parseInt(durationMatch[1], 10);
    }

    return NextResponse.json({
      title: trackTitle,
      artist,
      artworkUrl,
      duration,
      genre,
      description: description.slice(0, 500),
      permalinkUrl: url,
      embedHtml: oembed.html || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scrape SoundCloud";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}

function extractMeta(html: string, property: string): string | null {
  // Match both property= and name= attributes
  const regex = new RegExp(
    `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(regex);
  if (match) return match[1];

  // Try reversed attribute order
  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    "i"
  );
  const match2 = html.match(regex2);
  return match2 ? match2[1] : null;
}

function extractMetaProperty(html: string, property: string): string | null {
  return extractMeta(html, property);
}
