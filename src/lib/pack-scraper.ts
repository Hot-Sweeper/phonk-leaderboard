/**
 * Legalized sample-pack metadata helpers.
 * No network scraping: pack previews are derived from the submitted URLs only.
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

const PAYHIP_PRODUCT_RE = /^https?:\/\/(www\.)?payhip\.com\/b\/([\w-]+)/i;
const GUMROAD_PRODUCT_RE = /^https?:\/\/([a-z0-9_-]+\.)?gumroad\.com\/l\/([\w-]+)/i;

function humanizeSlug(value: string) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function derivePackFromUrl(url: string, platform: "payhip" | "gumroad"): ScrapedPack {
  const parsed = new URL(url);
  const slugMatch = platform === "payhip"
    ? parsed.pathname.match(/^\/b\/([\w-]+)/i)
    : parsed.pathname.match(/^\/l\/([\w-]+)/i);
  const slug = slugMatch?.[1] ?? parsed.pathname.split("/").filter(Boolean).at(-1) ?? "sample-pack";
  const seller = platform === "gumroad"
    ? parsed.hostname.split(".").length > 2
      ? parsed.hostname.split(".")[0]
      : null
    : null;

  return {
    name: humanizeSlug(slug),
    description: "Manual metadata entry recommended on the legal-no-scraping branch.",
    imageUrl: null,
    seller,
    priceCents: 0,
    currency: platform === "payhip" ? "EUR" : "USD",
    ratingAverage: null,
    ratingCount: 0,
    salesCount: null,
    variants: [],
  };
}

export function validatePackUrl(url: string): "payhip" | "gumroad" | null {
  if (PAYHIP_PRODUCT_RE.test(url.trim())) return "payhip";
  if (GUMROAD_PRODUCT_RE.test(url.trim())) return "gumroad";
  return null;
}

export async function scrapePackUrl(url: string): Promise<ScrapedPack> {
  const platform = validatePackUrl(url);
  if (!platform) {
    throw new Error("URL must be a Payhip or Gumroad product link");
  }

  return derivePackFromUrl(url, platform);
}

export async function scrapePackUrls(payhipUrl?: string, gumroadUrl?: string): Promise<ScrapedPack> {
  if (gumroadUrl) {
    return derivePackFromUrl(gumroadUrl, "gumroad");
  }

  if (payhipUrl) {
    return derivePackFromUrl(payhipUrl, "payhip");
  }

  throw new Error("At least one URL is required");
}
