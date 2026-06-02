import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function getUtcMonthPeriod(date = new Date()) {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { periodStart, periodEnd, resetAt: periodEnd };
}

export async function incrementFeatureUsage(
  userId: string,
  featureKey: string,
  amount = 1,
  client: Pick<Prisma.TransactionClient, "featureUsage"> = prisma
) {
  const { periodStart, periodEnd, resetAt } = getUtcMonthPeriod();

  return client.featureUsage.upsert({
    where: {
      userId_featureKey_periodStart: {
        userId,
        featureKey,
        periodStart,
      },
    },
    create: {
      userId,
      featureKey,
      periodStart,
      periodEnd,
      resetAt,
      used: amount,
    },
    update: {
      used: { increment: amount },
      periodEnd,
      resetAt,
    },
  });
}