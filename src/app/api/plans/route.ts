import { NextResponse } from "next/server";
import { ensureDefaultEntitlements } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import { entitlementSchemaNotAppliedResponse, isPrismaSchemaNotAppliedError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    await ensureDefaultEntitlements();
    const plans = await prisma.plan.findMany({
      where: { active: true, public: true },
      orderBy: [{ rank: "asc" }, { name: "asc" }],
      include: {
        features: {
          include: { feature: true },
          orderBy: { feature: { sortOrder: "asc" } },
        },
      },
    });

    return NextResponse.json(plans);
  } catch (error) {
    if (isPrismaSchemaNotAppliedError(error)) return entitlementSchemaNotAppliedResponse();
    throw error;
  }
}