import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUtcMonthPeriod } from "@/lib/usage";

export const UNLIMITED_LIMIT = -1;

export const FEATURE_KEYS = {
  artistSubmissionsPerMonth: "artist_submissions_per_month",
  watchlistLimit: "watchlist_limit",
  samplePackUploads: "sample_pack_uploads",
  coverartMaxResolution: "coverart_max_resolution",
  priorityReview: "priority_review",
  advancedAnalytics: "advanced_analytics",
} as const;

type FeatureValueType = "BOOLEAN" | "NUMBER" | "STRING" | "JSON";

type FeatureDefinition = {
  key: string;
  name: string;
  description: string;
  category: string;
  valueType: FeatureValueType;
  unit?: string;
  defaultValue: Prisma.InputJsonValue;
  sortOrder: number;
};

type PlanDefinition = {
  slug: string;
  name: string;
  description: string;
  rank: number;
  public: boolean;
  features: Record<string, Prisma.InputJsonValue>;
};

export type EntitlementFeature = {
  key: string;
  name: string;
  description: string | null;
  category: string;
  valueType: FeatureValueType;
  unit: string | null;
  value: Prisma.JsonValue;
  enabled: boolean;
  unlimited: boolean;
  sortOrder: number;
};

export type EntitlementUsage = {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  periodStart: string;
  periodEnd: string;
};

export type EntitlementSummary = {
  authenticated: boolean;
  plan: {
    slug: string;
    name: string;
    rank: number;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  };
  features: Record<string, EntitlementFeature>;
  usage: Record<string, EntitlementUsage>;
};

const DEFAULT_FEATURES: FeatureDefinition[] = [
  {
    key: FEATURE_KEYS.artistSubmissionsPerMonth,
    name: "Artist submissions",
    description: "How many artist add requests a user can submit each calendar month.",
    category: "Community",
    valueType: "NUMBER",
    unit: "per month",
    defaultValue: 5,
    sortOrder: 10,
  },
  {
    key: FEATURE_KEYS.watchlistLimit,
    name: "Artist watchlist limit",
    description: "Maximum number of artists a user can keep on their watchlist.",
    category: "Community",
    valueType: "NUMBER",
    unit: "artists",
    defaultValue: 50,
    sortOrder: 20,
  },
  {
    key: FEATURE_KEYS.samplePackUploads,
    name: "Sample pack uploads",
    description: "Allows users to submit sample packs for moderation and publishing.",
    category: "Creator tools",
    valueType: "BOOLEAN",
    defaultValue: false,
    sortOrder: 30,
  },
  {
    key: FEATURE_KEYS.coverartMaxResolution,
    name: "Coverart AI max resolution",
    description: "Largest generated cover art size available to the user.",
    category: "Creator tools",
    valueType: "NUMBER",
    unit: "px",
    defaultValue: 1024,
    sortOrder: 40,
  },
  {
    key: FEATURE_KEYS.priorityReview,
    name: "Priority review badge",
    description: "Marks requests from this plan as priority in review queues.",
    category: "Community",
    valueType: "BOOLEAN",
    defaultValue: false,
    sortOrder: 50,
  },
  {
    key: FEATURE_KEYS.advancedAnalytics,
    name: "Advanced analytics",
    description: "Unlocks richer artist and sample-pack analytics surfaces.",
    category: "Analytics",
    valueType: "BOOLEAN",
    defaultValue: false,
    sortOrder: 60,
  },
];

const DEFAULT_PLANS: PlanDefinition[] = [
  {
    slug: "free",
    name: "Free",
    description: "Default account tier with community basics.",
    rank: 0,
    public: true,
    features: {
      [FEATURE_KEYS.artistSubmissionsPerMonth]: 5,
      [FEATURE_KEYS.watchlistLimit]: 50,
      [FEATURE_KEYS.samplePackUploads]: false,
      [FEATURE_KEYS.coverartMaxResolution]: 1024,
      [FEATURE_KEYS.priorityReview]: false,
      [FEATURE_KEYS.advancedAnalytics]: false,
    },
  },
  {
    slug: "premium",
    name: "Premium",
    description: "Paid tier for creators and power users.",
    rank: 10,
    public: true,
    features: {
      [FEATURE_KEYS.artistSubmissionsPerMonth]: UNLIMITED_LIMIT,
      [FEATURE_KEYS.watchlistLimit]: UNLIMITED_LIMIT,
      [FEATURE_KEYS.samplePackUploads]: true,
      [FEATURE_KEYS.coverartMaxResolution]: 4096,
      [FEATURE_KEYS.priorityReview]: true,
      [FEATURE_KEYS.advancedAnalytics]: true,
    },
  },
  {
    slug: "enterprise",
    name: "Enterprise",
    description: "Hidden custom tier for manual deals and future team plans.",
    rank: 20,
    public: false,
    features: {
      [FEATURE_KEYS.artistSubmissionsPerMonth]: UNLIMITED_LIMIT,
      [FEATURE_KEYS.watchlistLimit]: UNLIMITED_LIMIT,
      [FEATURE_KEYS.samplePackUploads]: true,
      [FEATURE_KEYS.coverartMaxResolution]: 4096,
      [FEATURE_KEYS.priorityReview]: true,
      [FEATURE_KEYS.advancedAnalytics]: true,
    },
  },
];

const REQUIRED_ENTITLEMENT_TABLES = [
  "Plan",
  "Feature",
  "PlanFeature",
  "UserSubscription",
  "FeatureUsage",
  "UserEntitlementOverride",
  "BillingWebhookEvent",
] as const;

export class EntitlementSchemaNotAppliedError extends Error {
  code = "ENTITLEMENT_SCHEMA_NOT_APPLIED";

  constructor(missingTables: string[]) {
    super(`The subscription/tier database tables are not available yet: ${missingTables.join(", ")}.`);
    this.name = "EntitlementSchemaNotAppliedError";
  }
}

let seedPromise: Promise<void> | null = null;

function normalizeStatus(status: string | null | undefined) {
  return (status ?? "free").toLowerCase();
}

export function isUnlimitedLimit(value: Prisma.JsonValue | number | null | undefined) {
  return typeof value === "number" && value === UNLIMITED_LIMIT;
}

export function valueToNumber(value: Prisma.JsonValue | null | undefined, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function valueToBoolean(value: Prisma.JsonValue | null | undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return false;
}

export function isSubscriptionEntitled(
  status: string | null | undefined,
  currentPeriodEnd?: Date | string | null,
  graceEndsAt?: Date | string | null,
  now = new Date()
) {
  const normalized = normalizeStatus(status);
  if (["active", "trialing", "paid"].includes(normalized)) return true;

  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const graceEnd = graceEndsAt ? new Date(graceEndsAt) : null;
  if (["canceled", "cancelled", "past_due"].includes(normalized)) {
    return Boolean((graceEnd && graceEnd > now) || (periodEnd && periodEnd > now));
  }

  return false;
}

export async function ensureDefaultEntitlements() {
  seedPromise ??= seedDefaultEntitlements().catch((error) => {
    seedPromise = null;
    throw error;
  });
  return seedPromise;
}

async function seedDefaultEntitlements() {
  await assertEntitlementSchemaReady();

  const features = new Map<string, { id: string }>();

  for (const feature of DEFAULT_FEATURES) {
    const savedFeature = await prisma.feature.upsert({
      where: { key: feature.key },
      create: {
        key: feature.key,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        valueType: feature.valueType,
        unit: feature.unit,
        defaultValue: feature.defaultValue,
        sortOrder: feature.sortOrder,
      },
      update: {
        name: feature.name,
        description: feature.description,
        category: feature.category,
        valueType: feature.valueType,
        unit: feature.unit,
        defaultValue: feature.defaultValue,
        sortOrder: feature.sortOrder,
      },
      select: { id: true },
    });
    features.set(feature.key, savedFeature);
  }

  for (const plan of DEFAULT_PLANS) {
    const savedPlan = await prisma.plan.upsert({
      where: { slug: plan.slug },
      create: {
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        rank: plan.rank,
        public: plan.public,
      },
      update: {
        name: plan.name,
        description: plan.description,
        rank: plan.rank,
        public: plan.public,
      },
      select: { id: true },
    });

    for (const [featureKey, value] of Object.entries(plan.features)) {
      const feature = features.get(featureKey);
      if (!feature) continue;

      await prisma.planFeature.upsert({
        where: {
          planId_featureId: {
            planId: savedPlan.id,
            featureId: feature.id,
          },
        },
        create: {
          planId: savedPlan.id,
          featureId: feature.id,
          value,
        },
        update: {},
      });
    }
  }
}

async function assertEntitlementSchemaReady() {
  const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('Plan', 'Feature', 'PlanFeature', 'UserSubscription', 'FeatureUsage', 'UserEntitlementOverride', 'BillingWebhookEvent')
  `;
  const existingTables = new Set(rows.map((row) => row.table_name));
  const missingTables = REQUIRED_ENTITLEMENT_TABLES.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new EntitlementSchemaNotAppliedError(missingTables);
  }
}

export function bypassesProductLimits(role: string | null | undefined) {
  return role === "ADMIN" || role === "MODERATOR";
}

export async function getPublicPlanEntitlements(planSlug = "free"): Promise<EntitlementSummary> {
  await ensureDefaultEntitlements();
  const plan = await getPlanWithFeatures(planSlug);
  return buildEntitlementSummary({
    authenticated: false,
    plan,
    status: plan.slug,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    userId: null,
  });
}

export async function getUserEntitlements(userId: string): Promise<EntitlementSummary> {
  await ensureDefaultEntitlements();

  const now = new Date();
  const [freePlan, subscription, activePlanOverride, featureOverrides] = await Promise.all([
    getPlanWithFeatures("free"),
    prisma.userSubscription.findUnique({
      where: { userId },
      include: { plan: { include: { features: { include: { feature: true } } } } },
    }),
    prisma.userEntitlementOverride.findFirst({
      where: {
        userId,
        active: true,
        planId: { not: null },
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: { createdAt: "desc" },
      include: { plan: { include: { features: { include: { feature: true } } } } },
    }),
    prisma.userEntitlementOverride.findMany({
      where: {
        userId,
        active: true,
        featureKey: { not: null },
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const subscriptionPlan = subscription?.plan;
  const hasPaidAccess = isSubscriptionEntitled(
    subscription?.status,
    subscription?.currentPeriodEnd,
    subscription?.graceEndsAt,
    now
  );
  const plan = activePlanOverride?.plan ?? (hasPaidAccess && subscriptionPlan ? subscriptionPlan : freePlan);

  return buildEntitlementSummary({
    authenticated: true,
    plan,
    status: subscription?.status ?? plan.slug,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
    userId,
    featureOverrides,
  });
}

export async function getFeatureValue(userId: string, featureKey: string) {
  const entitlements = await getUserEntitlements(userId);
  return entitlements.features[featureKey]?.value ?? null;
}

export async function getNumericFeatureLimit(userId: string, featureKey: string, fallback = 0) {
  return valueToNumber(await getFeatureValue(userId, featureKey), fallback);
}

export async function hasFeature(userId: string, featureKey: string) {
  const value = await getFeatureValue(userId, featureKey);
  return valueToBoolean(value) || isUnlimitedLimit(value) || valueToNumber(value, 0) > 0;
}

async function getPlanWithFeatures(slug: string) {
  const plan = await prisma.plan.findUnique({
    where: { slug },
    include: { features: { include: { feature: true } } },
  });
  if (!plan) throw new Error(`Missing entitlement plan: ${slug}`);
  return plan;
}

async function buildEntitlementSummary({
  authenticated,
  plan,
  status,
  currentPeriodEnd,
  cancelAtPeriodEnd,
  userId,
  featureOverrides = [],
}: {
  authenticated: boolean;
  plan: Awaited<ReturnType<typeof getPlanWithFeatures>>;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  userId: string | null;
  featureOverrides?: Array<{ featureKey: string | null; value: Prisma.JsonValue | null }>;
}): Promise<EntitlementSummary> {
  const allFeatures = await prisma.feature.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  const planValues = new Map(plan.features.map((planFeature) => [planFeature.feature.key, planFeature.value]));
  const overrideValues = new Map(
    featureOverrides
      .filter((override) => override.featureKey && override.value !== null)
      .map((override) => [override.featureKey!, override.value as Prisma.JsonValue])
  );

  const features: Record<string, EntitlementFeature> = {};
  for (const feature of allFeatures) {
    const value = overrideValues.get(feature.key) ?? planValues.get(feature.key) ?? feature.defaultValue ?? null;
    features[feature.key] = {
      key: feature.key,
      name: feature.name,
      description: feature.description,
      category: feature.category,
      valueType: feature.valueType as FeatureValueType,
      unit: feature.unit,
      value,
      enabled: feature.valueType === "BOOLEAN" ? valueToBoolean(value) : valueToNumber(value, 0) !== 0,
      unlimited: isUnlimitedLimit(value),
      sortOrder: feature.sortOrder,
    };
  }

  const usage = userId ? await getCurrentUsage(userId, features) : {};

  return {
    authenticated,
    plan: {
      slug: plan.slug,
      name: plan.name,
      rank: plan.rank,
      status,
      currentPeriodEnd: currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd,
    },
    features,
    usage,
  };
}

async function getCurrentUsage(userId: string, features: Record<string, EntitlementFeature>) {
  const { periodStart, periodEnd } = getUtcMonthPeriod();
  const [artistSubmissionsUsed, watchlistUsed, trackedUsage] = await Promise.all([
    prisma.artistRequest.count({
      where: {
        userId,
        type: "ADD",
        createdAt: { gte: periodStart, lt: periodEnd },
      },
    }),
    prisma.watchlist.count({ where: { userId } }),
    prisma.featureUsage.findMany({
      where: { userId, periodStart },
      select: { featureKey: true, used: true },
    }),
  ]);

  const trackedByFeature = new Map(trackedUsage.map((usage) => [usage.featureKey, usage.used]));
  const explicitUsage: Record<string, number> = {
    [FEATURE_KEYS.artistSubmissionsPerMonth]: artistSubmissionsUsed,
    [FEATURE_KEYS.watchlistLimit]: watchlistUsed,
  };

  const usage: Record<string, EntitlementUsage> = {};
  for (const [featureKey, feature] of Object.entries(features)) {
    if (feature.valueType !== "NUMBER") continue;
    const used = explicitUsage[featureKey] ?? trackedByFeature.get(featureKey) ?? 0;
    const limit = valueToNumber(feature.value, 0);
    const unlimited = isUnlimitedLimit(limit);
    usage[featureKey] = {
      used,
      limit: unlimited ? null : limit,
      remaining: unlimited ? null : Math.max(limit - used, 0),
      unlimited,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
  }

  return usage;
}