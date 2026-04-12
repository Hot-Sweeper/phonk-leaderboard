import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapePackUrls } from "@/lib/pack-scraper";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/sample-packs/[id] — get a single pack
 */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const pack = await prisma.samplePack.findUnique({
    where: { id },
    include: {
      versions: { orderBy: { priceCents: "asc" } },
    },
  });

  if (!pack || (!pack.published && !(await auth())?.user)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(pack, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

/**
 * DELETE /api/sample-packs/[id] — remove a pack (admin only)
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.samplePack.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/sample-packs/[id] — update a pack's tags, published status, or re-scrape (admin only)
 * Body: { tags?, published?, rescrape? }
 */
export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.samplePack.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (Array.isArray(body.tags)) data.tags = body.tags;
  if (typeof body.published === "boolean") data.published = body.published;
  if (typeof body.payhipUrl === "string") data.payhipUrl = body.payhipUrl || null;
  if (typeof body.gumroadUrl === "string") data.gumroadUrl = body.gumroadUrl || null;
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();

  // Re-scrape metadata from stored URLs
  if (body.rescrape) {
    try {
      const scraped = await scrapePackUrls(
        existing.payhipUrl ?? undefined,
        existing.gumroadUrl ?? undefined,
      );
      data.name = scraped.name;
      data.description = scraped.description;
      data.imageUrl = scraped.imageUrl;
      data.seller = scraped.seller;
      data.priceCents = scraped.priceCents;
      data.currency = scraped.currency;
      data.ratingAverage = scraped.ratingAverage;
      data.ratingCount = scraped.ratingCount;
      data.salesCount = scraped.salesCount;

      // Re-create versions: delete old ones, add new scraped ones
      if (scraped.variants.length > 0) {
        await prisma.packVersion.deleteMany({ where: { packId: id } });
        await prisma.packVersion.createMany({
          data: scraped.variants.map((v, i) => ({
            packId: id,
            name: v.name,
            priceCents: v.priceCents,
            currency: v.currency,
            description: v.description,
            sortOrder: i,
          })),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to re-scrape";
      return NextResponse.json({ error: message }, { status: 422 });
    }
  }

  const updated = await prisma.samplePack.update({
    where: { id },
    data,
    include: { versions: { orderBy: { priceCents: "asc" } } },
  });
  return NextResponse.json(updated);
}
