/**
 * Scrape product metadata from Payhip and Gumroad product pages.
 * Uses JSON-LD structured data + OG meta tags for reliable extraction.
 * Also extracts product variants/versions (Lite, Full, Full+FLPs, etc.).
 */

export type ScrapedVariant = {
  name: string;
  priceCents: number;
  currency: string;
  description: string | null;
};

export type ScrapedPack = {
  name: string;
  description: string | null;
  imageUrl: string | null;
  seller: string | null;
  priceCents: number;
  currency: string;
  ratingAverage: number | null;
  ratingCount: number;
  salesCount: number | null;
  variants: ScrapedVariant[];
};

// ── Payhip ──────────────────────────────────────────────────────────────

const PAYHIP_PRODUCT_RE = /^https?:\/\/(www\.)?payhip\.com\/b\/[\w-]+/i;

function isPayhipUrl(url: string): boolean {
  return PAYHIP_PRODUCT_RE.test(url.trim());
}

async function scrapePayhip(url: string): Promise<ScrapedPack> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PhonkLeaderboard/1.0)" },
  });
  if (!res.ok) throw new Error(`Payhip returned ${res.status}`);
  const html = await res.text();

  // JSON-LD
  const jsonLdMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  let name = "";
  let description: string | null = null;
  let imageUrl: string | null = null;
  let priceCents = 0;
  let currency = "EUR";

  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      name = ld.name ?? "";
      description = ld.description ?? null;
      if (Array.isArray(ld.image) && ld.image.length > 0) {
        imageUrl = ld.image[0];
      } else if (typeof ld.image === "string") {
        imageUrl = ld.image;
      }
      if (ld.offers) {
        const price = parseFloat(ld.offers.price ?? "0");
        priceCents = Math.round(price * 100);
        currency = ld.offers.priceCurrency ?? "EUR";
      }
    } catch { /* ignore parse errors */ }
  }

  // Fallback: OG meta tags
  if (!name) {
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogTitle) name = decodeHtmlEntities(ogTitle[1]);
  }
  if (!description) {
    const ogDesc = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
    if (ogDesc) description = decodeHtmlEntities(ogDesc[1]);
  }
  if (!imageUrl) {
    const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
    if (ogImage) imageUrl = ogImage[1];
  }
  if (priceCents === 0) {
    const ogPrice = html.match(/<meta\s+property="og:price:amount"\s+content="([^"]+)"/i);
    if (ogPrice) priceCents = Math.round(parseFloat(ogPrice[1]) * 100);
  }

  // Seller from shop link
  let seller: string | null = null;
  const shopMatch = html.match(/href="https:\/\/payhip\.com\/([A-Za-z0-9_-]+)"/);
  if (shopMatch && !["privacy", "gdpr", "eu-vat", "b", "terms"].includes(shopMatch[1].toLowerCase())) {
    seller = shopMatch[1];
  }

  if (!name) throw new Error("Could not extract product name from Payhip page");

  // Extract variants from radio button blocks
  const variants: ScrapedVariant[] = [];
  const variantBlocks = html.matchAll(
    /<div\s+class="variant-radio-button[\s\S]*?<\/div><!--variant-radio-button-contents-->/gi
  );
  for (const block of variantBlocks) {
    const titleMatch = block[0].match(/<div\s+class="variant-title[\s\S]*?>([\s\S]*?)<\/div>/i);
    const priceMatch = block[0].match(/<div\s+class="variant-price[\s\S]*?>([\s\S]*?)<\/div>/i);
    const descMatch = block[0].match(/<div\s+class="variant-description">([\s\S]*?)<\/div>/i);
    if (!titleMatch) continue;

    const vName = decodeHtmlEntities(titleMatch[1].trim());
    const vPriceRaw = priceMatch ? priceMatch[1].trim() : "0";
    // Price can be "€15", "€0", "$10", "12,00 €", etc.
    const vPriceNum = parseFloat(vPriceRaw.replace(/[^0-9.,]/g, "").replace(",", ".") || "0");
    const vPriceCents = Math.round(vPriceNum * 100);
    const vDesc = descMatch
      ? decodeHtmlEntities(descMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim())
      : null;

    variants.push({ name: vName, priceCents: vPriceCents, currency, description: vDesc });
  }

  // If variants exist, use the highest price as the main priceCents
  if (variants.length > 0 && priceCents === 0) {
    priceCents = Math.max(...variants.map((v) => v.priceCents));
  }

  return { name, description, imageUrl, seller, priceCents, currency, ratingAverage: null, ratingCount: 0, salesCount: null, variants };
}

// ── Gumroad ─────────────────────────────────────────────────────────────

const GUMROAD_PRODUCT_RE = /^https?:\/\/([a-z0-9_-]+\.)?gumroad\.com\/l\/[\w-]+/i;

function isGumroadUrl(url: string): boolean {
  return GUMROAD_PRODUCT_RE.test(url.trim());
}

async function scrapeGumroad(url: string): Promise<ScrapedPack> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PhonkLeaderboard/1.0)" },
  });
  if (!res.ok) throw new Error(`Gumroad returned ${res.status}`);
  const raw = await res.text();
  const html = decodeHtmlEntities(raw);

  // JSON-LD (structured data)
  const jsonLdMatch = raw.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
  let name = "";
  let description: string | null = null;
  let priceCents = 0;
  let currency = "USD";
  let ratingAverage: number | null = null;
  let ratingCount = 0;

  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      name = ld.name ?? "";
      description = ld.description ?? null;
      if (ld.offers) {
        priceCents = Math.round((ld.offers.price ?? 0) * 100);
        currency = ld.offers.priceCurrency ?? "USD";
      }
      if (ld.aggregateRating) {
        ratingAverage = ld.aggregateRating.ratingValue ?? null;
        ratingCount = ld.aggregateRating.reviewCount ?? 0;
      }
    } catch { /* ignore */ }
  }

  // Embedded product data for image, seller, sales count
  let imageUrl: string | null = null;
  let seller: string | null = null;
  let salesCount: number | null = null;

  // Cover image
  const coverMatch = html.match(/"covers":\s*\[\s*\{[^}]*"url"\s*:\s*"([^"]+)"/);
  if (coverMatch) {
    imageUrl = coverMatch[1];
  }
  if (!imageUrl) {
    const thumbMatch = html.match(/"thumbnail_url"\s*:\s*"([^"]+)"/);
    if (thumbMatch) imageUrl = thumbMatch[1];
  }

  // Seller
  const sellerMatch = html.match(/"seller"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
  if (sellerMatch) seller = sellerMatch[1];

  // Sales count (often null but worth trying)
  const salesMatch = html.match(/"sales_count"\s*:\s*(\d+)/);
  if (salesMatch) salesCount = parseInt(salesMatch[1], 10);

  // Price from embedded data (more reliable)
  if (priceCents === 0) {
    const priceMatch = html.match(/"price_cents"\s*:\s*(\d+)/);
    if (priceMatch) priceCents = parseInt(priceMatch[1], 10);
  }
  const currencyMatch = html.match(/"currency_code"\s*:\s*"([^"]+)"/);
  if (currencyMatch) currency = currencyMatch[1].toUpperCase();

  // Ratings from embedded data
  if (ratingAverage == null) {
    const ratingsMatch = html.match(/"ratings"\s*:\s*\{[^}]*"count"\s*:\s*(\d+)\s*,\s*"average"\s*:\s*([\d.]+)/);
    if (ratingsMatch) {
      ratingCount = parseInt(ratingsMatch[1], 10);
      ratingAverage = parseFloat(ratingsMatch[2]);
    }
  }

  // Fallback name from OG
  if (!name) {
    const ogTitle = raw.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogTitle) name = decodeHtmlEntities(ogTitle[1]);
  }

  if (!name) throw new Error("Could not extract product name from Gumroad page");

  // Gumroad variant extraction: look for "variants" in embedded JS data
  const variants: ScrapedVariant[] = [];
  const gumVariants = html.match(/"variants"\s*:\s*(\[[\s\S]*?\])\s*[,}]/);
  if (gumVariants) {
    try {
      const parsed = JSON.parse(gumVariants[1]);
      if (Array.isArray(parsed)) {
        for (const v of parsed) {
          if (v.name) {
            variants.push({
              name: v.name,
              priceCents: v.price_difference_cents ? priceCents + v.price_difference_cents : priceCents,
              currency,
              description: v.description ?? null,
            });
          }
        }
      }
    } catch { /* ignore parse errors */ }
  }

  return { name, description, imageUrl, seller, priceCents, currency, ratingAverage, ratingCount, salesCount, variants };
}

// ── Public API ──────────────────────────────────────────────────────────

export function validatePackUrl(url: string): "payhip" | "gumroad" | null {
  if (isPayhipUrl(url)) return "payhip";
  if (isGumroadUrl(url)) return "gumroad";
  return null;
}

export async function scrapePackUrl(url: string): Promise<ScrapedPack> {
  const platform = validatePackUrl(url);
  if (platform === "payhip") return scrapePayhip(url);
  if (platform === "gumroad") return scrapeGumroad(url);
  throw new Error("URL must be a Payhip or Gumroad product link");
}

/**
 * Scrape both URLs and merge data (Gumroad takes priority where both have data,
 * since it tends to have richer metadata like ratings).
 */
export async function scrapePackUrls(payhipUrl?: string, gumroadUrl?: string): Promise<ScrapedPack> {
  const results: ScrapedPack[] = [];

  if (payhipUrl) results.push(await scrapePayhip(payhipUrl));
  if (gumroadUrl) results.push(await scrapeGumroad(gumroadUrl));

  if (results.length === 0) throw new Error("At least one URL is required");
  if (results.length === 1) return results[0];

  // Merge: prefer Gumroad for ratings/sales, Payhip for price if free on one
  const [payhip, gumroad] = results;
  // Merge variants: prefer whichever has more
  const variants = payhip.variants.length >= gumroad.variants.length ? payhip.variants : gumroad.variants;
  return {
    name: gumroad.name || payhip.name,
    description: gumroad.description || payhip.description,
    imageUrl: gumroad.imageUrl || payhip.imageUrl,
    seller: gumroad.seller || payhip.seller,
    priceCents: Math.max(payhip.priceCents, gumroad.priceCents),
    currency: gumroad.currency || payhip.currency,
    ratingAverage: gumroad.ratingAverage ?? payhip.ratingAverage,
    ratingCount: Math.max(gumroad.ratingCount, payhip.ratingCount),
    salesCount: gumroad.salesCount ?? payhip.salesCount,
    variants,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
}
