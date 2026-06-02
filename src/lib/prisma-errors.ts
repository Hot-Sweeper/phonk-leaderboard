import { NextResponse } from "next/server";

export function isPrismaSchemaNotAppliedError(error: unknown) {
  const maybeCode = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  const message = error instanceof Error ? error.message : String(error);

  return (
    maybeCode === "ENTITLEMENT_SCHEMA_NOT_APPLIED" ||
    maybeCode === "P2021" ||
    maybeCode === "P2022" ||
    /relation .* does not exist/i.test(message) ||
    /table .* does not exist/i.test(message) ||
    /column .* does not exist/i.test(message)
  );
}

export function entitlementSchemaNotAppliedResponse() {
  return NextResponse.json(
    {
      error: "The subscription/tier database tables are not available yet.",
      action: "Confirm the active DATABASE_URL target, then apply the Prisma schema before using billing and tier management.",
      command: "npx prisma db push",
    },
    { status: 503 }
  );
}