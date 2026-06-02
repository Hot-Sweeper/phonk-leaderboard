import { NextResponse } from "next/server";
import { paddleWebhookSecret, verifyPaddleWebhookSignature } from "@/lib/billing/paddle";
import { getPaddleEventIdentity, processPaddleWebhook, toPrismaJson, type PaddleWebhookPayload } from "@/lib/billing/webhooks";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("paddle-signature");

  let secret: string;
  try {
    secret = paddleWebhookSecret();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook secret is not configured.";
    return NextResponse.json({ error: message }, { status: 503 });
  }

  if (!verifyPaddleWebhookSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid Paddle webhook signature." }, { status: 401 });
  }

  let payload: PaddleWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PaddleWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const { eventId, eventType } = getPaddleEventIdentity(payload);
  const existingEvent = await prisma.billingWebhookEvent.findUnique({
    where: { provider_eventId: { provider: "PADDLE", eventId } },
  });
  if (existingEvent?.status === "PROCESSED") {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  await prisma.billingWebhookEvent.upsert({
    where: { provider_eventId: { provider: "PADDLE", eventId } },
    create: {
      provider: "PADDLE",
      eventId,
      eventType,
      status: "PENDING",
      payload: toPrismaJson(payload),
    },
    update: {
      eventType,
      status: "PENDING",
      payload: toPrismaJson(payload),
      error: null,
    },
  });

  try {
    await processPaddleWebhook(payload);
    await prisma.billingWebhookEvent.update({
      where: { provider_eventId: { provider: "PADDLE", eventId } },
      data: { status: "PROCESSED", processedAt: new Date(), error: null },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await prisma.billingWebhookEvent.update({
      where: { provider_eventId: { provider: "PADDLE", eventId } },
      data: { status: "FAILED", error: message },
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}