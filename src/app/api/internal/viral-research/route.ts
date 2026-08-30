import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getViralResearchProvider,
  getViralResearchSnapshot,
  ingestAresViralResearch,
  type AgentPayload,
} from "@/lib/viral-research-agent";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_CANDIDATES = 40;
const MAX_SEED_PLAYLISTS = 50;

function getSeedPlaylists() {
  const values = (process.env.VIRAL_RESEARCH_SEED_PLAYLISTS ?? "")
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const playlists: string[] = [];

  for (const value of values) {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\/playlist\/([A-Za-z0-9]+)\/?$/);
      if (url.protocol !== "https:" || url.hostname !== "open.spotify.com" || !match) continue;
      const canonical = `https://open.spotify.com/playlist/${match[1]}`;
      if (!playlists.includes(canonical)) playlists.push(canonical);
    } catch {
      continue;
    }
    if (playlists.length >= MAX_SEED_PLAYLISTS) break;
  }

  return playlists;
}

function isAuthorized(request: Request) {
  const secret = process.env.VIRAL_RESEARCH_INGEST_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!secret || !provided) return false;

  const expectedBuffer = Buffer.from(secret);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}

function rejectUnauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, {
    status: 401,
    headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentPayload(value: unknown): value is AgentPayload {
  if (!isRecord(value) || !Array.isArray(value.candidates) || value.candidates.length > MAX_CANDIDATES) return false;
  return value.candidates.every((candidate) => {
    if (!isRecord(candidate)
      || !Array.isArray(candidate.artistAliases)
      || candidate.artistAliases.length > 6
      || !Array.isArray(candidate.evidence)
      || candidate.evidence.length < 2
      || candidate.evidence.length > 6) return false;
    return typeof candidate.trackName === "string"
      && typeof candidate.artistName === "string"
      && typeof candidate.confidence === "number"
      && typeof candidate.rationale === "string"
      && candidate.artistAliases.every((alias) => typeof alias === "string")
      && candidate.evidence.every((evidence) => isRecord(evidence)
        && typeof evidence.url === "string"
        && typeof evidence.title === "string"
        && typeof evidence.publishedAt === "string"
        && typeof evidence.claim === "string");
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return rejectUnauthorized();
  const snapshot = await getViralResearchSnapshot();
  return NextResponse.json({
    ready: getViralResearchProvider() === "ares",
    provider: getViralResearchProvider(),
    lastAcceptedAt: snapshot?.generatedAt ?? null,
    seedPlaylists: getSeedPlaylists(),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return rejectUnauthorized();
  if (getViralResearchProvider() !== "ares") {
    return NextResponse.json({ error: "ARES is not the configured research provider." }, { status: 409 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!isRecord(body) || body.runner !== "ARES" || !isAgentPayload(body)) {
    return NextResponse.json({ error: "Invalid ARES research payload." }, { status: 400 });
  }

  try {
    const snapshot = await ingestAresViralResearch(body, typeof body.model === "string" ? body.model : "codex-cli");
    return NextResponse.json({
      accepted: snapshot.candidates.length,
      rejected: snapshot.rejectedCount,
      sourceCount: snapshot.sourceCount,
      generatedAt: snapshot.generatedAt,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[ViralResearch] ARES ingestion failed:", error);
    return NextResponse.json({ error: "Failed to ingest research snapshot." }, { status: 500 });
  }
}
