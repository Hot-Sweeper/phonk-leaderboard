import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getViralResearchSnapshot, isViralResearchConfigured, runViralResearchUpdate } from "@/lib/viral-research-agent";

async function requireAdmin() {
  const session = await auth();
  return session?.user.role === "ADMIN";
}

export async function GET() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const snapshot = await getViralResearchSnapshot();
  return NextResponse.json({
    configured: isViralResearchConfigured(),
    snapshot,
  });
}

export async function POST() {
  if (!await requireAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isViralResearchConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured or viral research is disabled." }, { status: 409 });
  }

  try {
    const snapshot = await runViralResearchUpdate("manual");
    return NextResponse.json({ success: true, snapshot });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}

