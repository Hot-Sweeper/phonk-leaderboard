import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapePackUrls, validatePackUrl } from "@/lib/pack-scraper";

/**
 * GET /api/sample-packs — list sample packs (admins see all, public sees published only)
 */
export async function GET() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const packs = await prisma.samplePack.findMany({
    where: isAdmin ? {} : { published: true },
    orderBy: { createdAt: "desc" },
    include: {
      versions: {
        orderBy: { priceCents: "asc" },
        select: { id: true, name: true, priceCents: true, currency: true, description: true, sortOrder: true },
      },
    },
  });

  return NextResponse.json(packs, {
    headers: {
      "Cache-Control": isAdmin
        ? "private, max-age=15, stale-while-revalidate=60"
        : "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

/**
 * POST /api/sample-packs — create a new sample pack (admin only)
 * Body: { payhipUrl?, gumroadUrl?, tags?, published? }
 * At least one URL is required. Metadata is scraped automatically.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const payhipUrl: string | undefined = body.payhipUrl?.trim() || undefined;
  const gumroadUrl: string | undefined = body.gumroadUrl?.trim() || undefined;
  const tags: string[] = Array.isArray(body.tags) ? body.tags : [];
  const published: boolean = body.published !== false;

  if (!payhipUrl && !gumroadUrl) {
    return NextResponse.json({ error: "At least one URL (Payhip or Gumroad) is required" }, { status: 400 });
  }
  if (payhipUrl && !validatePackUrl(payhipUrl)) {
    return NextResponse.json({ error: "Invalid Payhip URL" }, { status: 400 });
  }
  if (gumroadUrl && !validatePackUrl(gumroadUrl)) {
    return NextResponse.json({ error: "Invalid Gumroad URL" }, { status: 400 });
  }

  // Check for duplicates
  const existing = await prisma.samplePack.findFirst({
    where: {
      OR: [
        ...(payhipUrl ? [{ payhipUrl }] : []),
        ...(gumroadUrl ? [{ gumroadUrl }] : []),
      ],
    },
  });
  if (existing) {
    return NextResponse.json({ error: "A sample pack with this URL already exists" }, { status: 409 });
  }

  let scraped;
  try {
    scraped = await scrapePackUrls(payhipUrl, gumroadUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to scrape URL";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  try {
    const pack = await prisma.samplePack.create({
      data: {
        name: scraped.name,
        description: scraped.description,
        imageUrl: scraped.imageUrl,
        seller: scraped.seller,
        payhipUrl: payhipUrl ?? null,
        gumroadUrl: gumroadUrl ?? null,
        priceCents: scraped.priceCents,
        currency: scraped.currency,
        ratingAverage: scraped.ratingAverage,
        ratingCount: scraped.ratingCount,
        salesCount: scraped.salesCount,
        tags,
        published,
        addedById: session.user.id,
        versions: scraped.variants.length > 0 ? {
          create: scraped.variants.map((v, i) => ({
            name: v.name,
            priceCents: v.priceCents,
            currency: v.currency,
            description: v.description,
            sortOrder: i,
          })),
        } : undefined,
      },
      include: { versions: { orderBy: { priceCents: "asc" } } },
    });

    return NextResponse.json(pack, { status: 201 });
  } catch (err) {
    console.error("Failed to create sample pack:", err);
    const message = err instanceof Error ? err.message : "Database error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
