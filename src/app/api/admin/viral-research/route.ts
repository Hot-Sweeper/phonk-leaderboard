import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getViralResearchProvider, getViralResearchSnapshot, isViralResearchConfigured, runViralResearchUpdate } from "@/lib/viral-research-agent";

async function requireAdmin() {
  const session = await auth();
  return session?.user.role === "ADMIN";
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const snapshot = await getViralResearchSnapshot();
  return NextResponse.json({
    configured: isViralResearchConfigured(),
    provider: getViralResearchProvider(),
    snapshot,
  });
}

export async function POST() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isViralResearchConfigured()) {
    return NextResponse.json({ error: "The configured viral research provider is not ready." }, { status: 409 });
  }
  if (getViralResearchProvider() === "ares") {
    return NextResponse.json({ error: "Viral research runs on ARES and cannot be started from Railway." }, { status: 409 });
  }

  try {
    const snapshot = await runViralResearchUpdate("manual");
    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
