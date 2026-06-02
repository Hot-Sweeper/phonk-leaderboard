import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BillingConfigError, createPaddlePortalSession } from "@/lib/billing/paddle";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await prisma.userSubscription.findUnique({ where: { userId: session.user.id } });
  if (!subscription?.providerCustomerId) {
    return NextResponse.json({ error: "No billing customer found for this account." }, { status: 404 });
  }

  try {
    const portalUrl = await createPaddlePortalSession({
      customerId: subscription.providerCustomerId,
      subscriptionId: subscription.providerSubscriptionId,
    });
    return NextResponse.json({ portalUrl });
  } catch (error) {
    const status = error instanceof BillingConfigError ? 503 : 500;
    const message = error instanceof Error ? error.message : "Failed to open billing portal.";
    return NextResponse.json({ error: message }, { status });
  }
}