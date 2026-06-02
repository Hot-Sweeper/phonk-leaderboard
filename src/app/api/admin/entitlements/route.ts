import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDefaultEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { entitlementSchemaNotAppliedResponse, isPrismaSchemaNotAppliedError } from "@/lib/prisma-errors";

type EntityType = "plan" | "feature" | "planFeature";

async function requireAdmin() {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "ADMIN") return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  try {
    await ensureDefaultEntitlements();
    const [plans, features, recentWebhookEvents] = await Promise.all([
      prisma.plan.findMany({
        orderBy: [{ rank: "asc" }, { name: "asc" }],
        include: {
          features: { include: { feature: true }, orderBy: { feature: { sortOrder: "asc" } } },
          _count: { select: { subscriptions: true } },
        },
      }),
      prisma.feature.findMany({
        orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.billingWebhookEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 12,
        select: { id: true, eventType: true, status: true, error: true, createdAt: true, processedAt: true },
      }),
    ]);

    return NextResponse.json({ plans, features, recentWebhookEvents });
  } catch (error) {
    if (isPrismaSchemaNotAppliedError(error)) return entitlementSchemaNotAppliedResponse();
    throw error;
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  try {
    await ensureDefaultEntitlements();
    const body = await req.json();
    const type = body.type as EntityType;

    if (type === "plan") {
    const slug = normalizeKey(body.slug);
    if (!slug) return NextResponse.json({ error: "Plan slug is required." }, { status: 400 });

    const plan = await prisma.plan.create({
      data: {
        slug,
        name: text(body.name) || slug,
        description: optionalText(body.description),
        rank: numberValue(body.rank, 0),
        active: body.active !== false,
        public: body.public !== false,
        paddleProductId: optionalText(body.paddleProductId),
        paddlePriceId: optionalText(body.paddlePriceId),
      },
    });

    const features = await prisma.feature.findMany();
    await prisma.planFeature.createMany({
      data: features.map((feature) => ({
        planId: plan.id,
        featureId: feature.id,
        value: (feature.defaultValue ?? defaultValueForType(feature.valueType)) as Prisma.InputJsonValue,
      })),
      skipDuplicates: true,
    });

      return NextResponse.json(plan, { status: 201 });
    }

    if (type === "feature") {
    const key = normalizeKey(body.key);
    if (!key) return NextResponse.json({ error: "Feature key is required." }, { status: 400 });
    const valueType = normalizeValueType(body.valueType);
    const defaultValue = normalizeFeatureValue(body.defaultValue, valueType);

    const feature = await prisma.feature.create({
      data: {
        key,
        name: text(body.name) || key,
        description: optionalText(body.description),
        category: text(body.category) || "General",
        valueType,
        unit: optionalText(body.unit),
        defaultValue,
        active: body.active !== false,
        sortOrder: numberValue(body.sortOrder, 100),
      },
    });

    const plans = await prisma.plan.findMany({ select: { id: true } });
    await prisma.planFeature.createMany({
      data: plans.map((plan) => ({ planId: plan.id, featureId: feature.id, value: defaultValue })),
      skipDuplicates: true,
    });

      return NextResponse.json(feature, { status: 201 });
    }

    return NextResponse.json({ error: "Unsupported entity type." }, { status: 400 });
  } catch (error) {
    if (isPrismaSchemaNotAppliedError(error)) return entitlementSchemaNotAppliedResponse();
    throw error;
  }
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;

  try {
    await ensureDefaultEntitlements();
    const body = await req.json();
    const type = body.type as EntityType;

    if (type === "plan") {
    if (!body.id) return NextResponse.json({ error: "Plan id is required." }, { status: 400 });
    const slug = body.slug === undefined ? undefined : normalizeKey(body.slug);
    if (body.slug !== undefined && !slug) return NextResponse.json({ error: "Invalid plan slug." }, { status: 400 });

    const plan = await prisma.plan.update({
      where: { id: body.id },
      data: {
        slug,
        name: body.name === undefined ? undefined : text(body.name),
        description: body.description === undefined ? undefined : optionalText(body.description),
        rank: body.rank === undefined ? undefined : numberValue(body.rank, 0),
        active: body.active,
        public: body.public,
        paddleProductId: body.paddleProductId === undefined ? undefined : optionalText(body.paddleProductId),
        paddlePriceId: body.paddlePriceId === undefined ? undefined : optionalText(body.paddlePriceId),
      },
    });
      return NextResponse.json(plan);
    }

    if (type === "feature") {
    if (!body.id) return NextResponse.json({ error: "Feature id is required." }, { status: 400 });
    const existing = await prisma.feature.findUnique({ where: { id: body.id } });
    if (!existing) return NextResponse.json({ error: "Feature not found." }, { status: 404 });

    const key = body.key === undefined ? undefined : normalizeKey(body.key);
    if (body.key !== undefined && !key) return NextResponse.json({ error: "Invalid feature key." }, { status: 400 });
    const valueType = body.valueType === undefined ? existing.valueType : normalizeValueType(body.valueType);
    const feature = await prisma.feature.update({
      where: { id: body.id },
      data: {
        key,
        name: body.name === undefined ? undefined : text(body.name),
        description: body.description === undefined ? undefined : optionalText(body.description),
        category: body.category === undefined ? undefined : text(body.category) || "General",
        valueType,
        unit: body.unit === undefined ? undefined : optionalText(body.unit),
        defaultValue: body.defaultValue === undefined ? undefined : normalizeFeatureValue(body.defaultValue, valueType),
        active: body.active,
        sortOrder: body.sortOrder === undefined ? undefined : numberValue(body.sortOrder, 0),
      },
    });
      return NextResponse.json(feature);
    }

    if (type === "planFeature") {
    const planId = text(body.planId);
    const featureId = text(body.featureId);
    if (!planId || !featureId) {
      return NextResponse.json({ error: "Plan id and feature id are required." }, { status: 400 });
    }
    const feature = await prisma.feature.findUnique({ where: { id: featureId } });
    if (!feature) return NextResponse.json({ error: "Feature not found." }, { status: 404 });

    const value = normalizeFeatureValue(body.value, feature.valueType);
    const planFeature = await prisma.planFeature.upsert({
      where: { planId_featureId: { planId, featureId } },
      create: { planId, featureId, value },
      update: { value },
      include: { feature: true },
    });
      return NextResponse.json(planFeature);
    }

    return NextResponse.json({ error: "Unsupported entity type." }, { status: 400 });
  } catch (error) {
    if (isPrismaSchemaNotAppliedError(error)) return entitlementSchemaNotAppliedResponse();
    throw error;
  }
}

function normalizeKey(value: unknown) {
  const key = text(value).toLowerCase().replace(/[^a-z0-9_/-]+/g, "_").replace(/^_+|_+$/g, "");
  return /^[a-z0-9][a-z0-9_/-]*$/.test(key) ? key : "";
}

function normalizeValueType(value: unknown) {
  return ["BOOLEAN", "NUMBER", "STRING", "JSON"].includes(String(value))
    ? (String(value) as "BOOLEAN" | "NUMBER" | "STRING" | "JSON")
    : "BOOLEAN";
}

function normalizeFeatureValue(value: unknown, valueType: string): Prisma.InputJsonValue {
  if (valueType === "BOOLEAN") return value === true || value === "true" || value === "1";
  if (valueType === "NUMBER") return numberValue(value, 0);
  if (valueType === "STRING") return text(value);
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Prisma.InputJsonValue;
    } catch {
      return value;
    }
  }
  return (value ?? {}) as Prisma.InputJsonValue;
}

function defaultValueForType(valueType: string): Prisma.InputJsonValue {
  if (valueType === "NUMBER") return 0;
  if (valueType === "STRING") return "";
  if (valueType === "JSON") return {};
  return false;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
  const trimmed = text(value);
  return trimmed || null;
}

function numberValue(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}