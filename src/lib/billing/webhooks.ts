import { Prisma } from "@prisma/client";
import { activatePromotion } from "@/lib/community";
import { ensureDefaultEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export type PaddleWebhookPayload = {
  event_id?: string;
  notification_id?: string;
  event_type?: string;
  data?: Record<string, unknown>;
};

export function getPaddleEventIdentity(payload: PaddleWebhookPayload) {
  const eventType = payload.event_type ?? "unknown";
  const eventId = payload.event_id ?? payload.notification_id ?? `${eventType}:${Date.now()}`;
  return { eventId, eventType };
}

export async function processPaddleWebhook(payload: PaddleWebhookPayload) {
  await ensureDefaultEntitlements();

  const eventType = payload.event_type ?? "unknown";
  const data = payload.data ?? {};

  if (eventType === "transaction.completed") {
    const handledMarketplace = await processMarketplaceOrderPayment(data);
    if (handledMarketplace) return;
    const handledPromotion = await processPromotedPostPayment(data);
    if (handledPromotion) return;
  }

  if (!isSubscriptionRelevantEvent(eventType)) return;

  const customData = getObject(data.custom_data);
  const customer = getObject(data.customer);
  const providerCustomerId = getString(data.customer_id) ?? getString(customer.id);
  const providerSubscriptionId = eventType.startsWith("subscription.")
    ? getString(data.id)
    : getString(data.subscription_id);
  const userIdFromCustomData = getString(customData.userId) ?? getString(customData.user_id);
  const planSlugFromCustomData = getString(customData.planSlug) ?? getString(customData.plan_slug);
  const existingSubscription = await findExistingSubscription(providerSubscriptionId, providerCustomerId);
  const userId = userIdFromCustomData ?? existingSubscription?.userId;
  if (!userId) return;

  const plan = await findPlanForPayload(planSlugFromCustomData, data);
  const status = normalizeSubscriptionStatus(eventType, getString(data.status));
  const period = getBillingPeriod(data);
  const cancelAtPeriodEnd = getCancelAtPeriodEnd(data, eventType);

  await prisma.userSubscription.upsert({
    where: { userId },
    create: {
      userId,
      provider: "PADDLE",
      providerCustomerId,
      providerSubscriptionId,
      planId: plan?.id,
      status,
      currentPeriodStart: period.startsAt,
      currentPeriodEnd: period.endsAt,
      cancelAtPeriodEnd,
    },
    update: {
      provider: "PADDLE",
      providerCustomerId,
      providerSubscriptionId,
      planId: plan?.id,
      status,
      currentPeriodStart: period.startsAt,
      currentPeriodEnd: period.endsAt,
      cancelAtPeriodEnd,
    },
  });
}

async function processMarketplaceOrderPayment(data: Record<string, unknown>) {
  const customData = getObject(data.custom_data);
  const orderType = getString(customData.orderType) ?? getString(customData.order_type);
  if (orderType !== "cover_art_order") return false;

  const orderId = getString(customData.orderId) ?? getString(customData.order_id);
  if (!orderId) return false;

  const transactionId = getString(data.id);
  const order = await prisma.coverArtOrder.findUnique({ where: { id: orderId } });
  if (!order) return true;

  if (order.status !== "PENDING_PAYMENT" && order.status !== "CANCELLED") return true;

  await prisma.coverArtOrder.update({
    where: { id: orderId },
    data: {
      status: "PAID",
      paddleTransactionId: transactionId,
      paidAt: new Date(),
    },
  });

  return true;
}

async function processPromotedPostPayment(data: Record<string, unknown>) {
  const customData = getObject(data.custom_data);
  const orderType = getString(customData.orderType) ?? getString(customData.order_type);
  if (orderType !== "promoted_post") return false;

  const promotionId = getString(customData.promotionId) ?? getString(customData.promotion_id);
  if (!promotionId) return false;

  const transactionId = getString(data.id);
  const promotion = await prisma.promotedPost.findUnique({ where: { id: promotionId } });
  if (!promotion) return true;

  if (promotion.status === "ACTIVE" && promotion.endsAt && promotion.endsAt.getTime() > Date.now()) {
    return true;
  }

  await activatePromotion(promotionId, transactionId);
  return true;
}

function isSubscriptionRelevantEvent(eventType: string) {
  return eventType.startsWith("subscription.") || eventType === "transaction.completed";
}

async function findExistingSubscription(providerSubscriptionId?: string | null, providerCustomerId?: string | null) {
  if (providerSubscriptionId) {
    const bySubscription = await prisma.userSubscription.findUnique({
      where: { providerSubscriptionId },
      select: { userId: true },
    });
    if (bySubscription) return bySubscription;
  }

  if (providerCustomerId) {
    return prisma.userSubscription.findUnique({
      where: { providerCustomerId },
      select: { userId: true },
    });
  }

  return null;
}

async function findPlanForPayload(planSlug: string | null | undefined, data: Record<string, unknown>) {
  if (planSlug) {
    const bySlug = await prisma.plan.findUnique({ where: { slug: planSlug }, select: { id: true } });
    if (bySlug) return bySlug;
  }

  const priceId = getPriceIdFromPayload(data);
  if (!priceId) return null;
  return prisma.plan.findFirst({ where: { paddlePriceId: priceId }, select: { id: true } });
}

function getPriceIdFromPayload(data: Record<string, unknown>) {
  const items = Array.isArray(data.items) ? data.items : [];
  for (const item of items) {
    const itemObject = getObject(item);
    const price = getObject(itemObject.price);
    const priceId = getString(price.id) ?? getString(itemObject.price_id);
    if (priceId) return priceId;
  }
  return getString(data.price_id);
}

function normalizeSubscriptionStatus(eventType: string, status?: string | null) {
  if (eventType.includes("canceled") || eventType.includes("cancelled")) return "canceled";
  if (eventType.includes("paused")) return "paused";
  if (eventType.includes("past_due")) return "past_due";
  if (eventType.includes("resumed")) return "active";
  return (status ?? "active").toLowerCase();
}

function getBillingPeriod(data: Record<string, unknown>) {
  const period = getObject(data.current_billing_period);
  return {
    startsAt: parseDate(getString(period.starts_at) ?? getString(data.current_period_start)),
    endsAt: parseDate(getString(period.ends_at) ?? getString(data.current_period_end)),
  };
}

function getCancelAtPeriodEnd(data: Record<string, unknown>, eventType: string) {
  const scheduledChange = getObject(data.scheduled_change);
  const action = getString(scheduledChange.action);
  return eventType.includes("canceled") || action === "cancel" || data.cancel_at_period_end === true;
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toPrismaJson(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}