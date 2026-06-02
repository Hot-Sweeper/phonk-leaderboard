import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPublicPlanEntitlements, getUserEntitlements } from "@/lib/entitlements";
import { entitlementSchemaNotAppliedResponse, isPrismaSchemaNotAppliedError } from "@/lib/prisma-errors";

export async function GET() {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json(await getPublicPlanEntitlements("free"));
    }

    return NextResponse.json(await getUserEntitlements(session.user.id));
  } catch (error) {
    if (isPrismaSchemaNotAppliedError(error)) return entitlementSchemaNotAppliedResponse();
    throw error;
  }
}