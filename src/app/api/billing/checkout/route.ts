import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { BillingConfigError, createPaddleCheckout } from "@/lib/billing/paddle";
import { ensureDefaultEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureDefaultEntitlements();
  const body = await req.json().catch(() => ({}));
  const planSlug = typeof body.planSlug === "string" ? body.planSlug : "premium";
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan || !plan.active || !plan.public) {
    return NextResponse.json({ error: "Plan not available." }, { status: 404 });
  }

  try {
    const origin = new URL(req.url).origin;
    const checkoutUrl = await createPaddleCheckout({
      origin,
      user: session.user,
      plan,
    });
    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    const status = error instanceof BillingConfigError ? 503 : 500;
    const message = error instanceof Error ? error.message : "Failed to create checkout.";
    return NextResponse.json({ error: message }, { status });
  }
}