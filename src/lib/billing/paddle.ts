import { createHmac, timingSafeEqual } from "node:crypto";

type PaddleEnvironment = "sandbox" | "production";

export class BillingConfigError extends Error {}

function paddleEnvironment(): PaddleEnvironment {
  return process.env.PADDLE_ENVIRONMENT === "production" ? "production" : "sandbox";
}

function paddleApiBaseUrl() {
  return paddleEnvironment() === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

function paddleApiKey() {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new BillingConfigError("PADDLE_API_KEY is not configured.");
  return key;
}

export function paddleWebhookSecret() {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) throw new BillingConfigError("PADDLE_WEBHOOK_SECRET is not configured.");
  return secret;
}

async function paddleRequest<T>(path: string, init: RequestInit) {
  const response = await fetch(`${paddleApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${paddleApiKey()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => null)) as T | { error?: { detail?: string } } | null;
  if (!response.ok) {
    const detail = isObject(payload) && "error" in payload ? payload.error?.detail : null;
    throw new Error(detail ?? `Paddle request failed with ${response.status}.`);
  }
  return payload as T;
}

export async function createPaddleCheckout({
  user,
  plan,
  origin,
}: {
  user: { id: string; email?: string | null; name?: string | null };
  plan: { slug: string; name: string; paddlePriceId: string | null };
  origin: string;
}) {
  if (!plan.paddlePriceId) {
    throw new BillingConfigError(`Plan ${plan.slug} does not have a Paddle price ID.`);
  }

  const response = await paddleRequest<{
    data?: { checkout?: { url?: string }; checkout_url?: string };
  }>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: plan.paddlePriceId, quantity: 1 }],
      collection_mode: "automatic",
      customer: user.email
        ? {
            email: user.email,
            name: user.name ?? undefined,
          }
        : undefined,
      custom_data: {
        userId: user.id,
        planSlug: plan.slug,
      },
      checkout: {
        url: `${origin}/billing?checkout=success`,
      },
    }),
  });

  const checkoutUrl = response.data?.checkout?.url ?? response.data?.checkout_url;
  if (!checkoutUrl) throw new Error("Paddle did not return a checkout URL.");
  return checkoutUrl;
}

export async function createPaddleMarketplaceCheckout({
  user,
  orderId,
  priceId,
  origin,
  successPath = "/marketplace/orders",
}: {
  user: { id: string; email?: string | null; name?: string | null };
  orderId: string;
  priceId: string;
  origin: string;
  successPath?: string;
}) {
  const response = await paddleRequest<{
    data?: { checkout?: { url?: string }; checkout_url?: string; id?: string };
  }>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: "automatic",
      customer: user.email
        ? {
            email: user.email,
            name: user.name ?? undefined,
          }
        : undefined,
      custom_data: {
        userId: user.id,
        orderId,
        orderType: "cover_art_order",
      },
      checkout: {
        url: `${origin}${successPath}?checkout=success&orderId=${encodeURIComponent(orderId)}`,
      },
    }),
  });

  const checkoutUrl = response.data?.checkout?.url ?? response.data?.checkout_url;
  if (!checkoutUrl) throw new Error("Paddle did not return a checkout URL.");
  return {
    checkoutUrl,
    transactionId: response.data?.id ?? null,
  };
}

export function marketplacePriceId() {
  return process.env.PADDLE_MARKETPLACE_PRICE_ID?.trim() || null;
}

export function promotedPostPriceId() {
  return process.env.PADDLE_PROMOTED_POST_PRICE_ID?.trim() || null;
}

export function isMarketplaceCheckoutConfigured() {
  return Boolean(process.env.PADDLE_API_KEY && marketplacePriceId());
}

export function isPromotedPostCheckoutConfigured() {
  return Boolean(process.env.PADDLE_API_KEY && promotedPostPriceId());
}

export async function createPaddlePromotedPostCheckout({
  user,
  promotionId,
  priceId,
  origin,
  successPath = "/community",
}: {
  user: { id: string; email?: string | null; name?: string | null };
  promotionId: string;
  priceId: string;
  origin: string;
  successPath?: string;
}) {
  const response = await paddleRequest<{
    data?: { checkout?: { url?: string }; checkout_url?: string; id?: string };
  }>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
      collection_mode: "automatic",
      customer: user.email
        ? {
            email: user.email,
            name: user.name ?? undefined,
          }
        : undefined,
      custom_data: {
        userId: user.id,
        promotionId,
        orderType: "promoted_post",
      },
      checkout: {
        url: `${origin}${successPath}?checkout=success&promotionId=${encodeURIComponent(promotionId)}`,
      },
    }),
  });

  const checkoutUrl = response.data?.checkout?.url ?? response.data?.checkout_url;
  if (!checkoutUrl) throw new Error("Paddle did not return a checkout URL.");
  return {
    checkoutUrl,
    transactionId: response.data?.id ?? null,
  };
}

export async function createPaddlePortalSession({
  customerId,
  subscriptionId,
}: {
  customerId: string;
  subscriptionId?: string | null;
}) {
  const response = await paddleRequest<{ data?: unknown }>(`/customers/${customerId}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify({
      subscription_ids: subscriptionId ? [subscriptionId] : undefined,
    }),
  });

  const portalUrl = findFirstUrl(response.data);
  if (!portalUrl) throw new Error("Paddle did not return a customer portal URL.");
  return portalUrl;
}

export function verifyPaddleWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string) {
  if (!signatureHeader) return false;

  const parts = Object.fromEntries(
    signatureHeader
      .split(/[;,]/)
      .map((part) => part.trim().split("="))
      .filter((part): part is [string, string] => part.length === 2)
  );
  const timestamp = parts.ts ?? parts.t;
  const expected = parts.h1;
  if (!timestamp || !expected) return false;

  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;

  const signedPayload = `${timestamp}:${rawBody}`;
  const digest = createHmac("sha256", secret).update(signedPayload).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const digestBuffer = Buffer.from(digest, "hex");
  return expectedBuffer.length === digestBuffer.length && timingSafeEqual(expectedBuffer, digestBuffer);
}

function findFirstUrl(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("http")) return value;
  if (!value || typeof value !== "object") return null;
  for (const nestedValue of Object.values(value)) {
    const url = findFirstUrl(nestedValue);
    if (url) return url;
  }
  return null;
}

function isObject(value: unknown): value is { error?: { detail?: string } } {
  return Boolean(value) && typeof value === "object";
}