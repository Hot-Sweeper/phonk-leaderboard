import { prisma } from "@/lib/prisma";
import { getCanonicalTrackTitle } from "@/lib/track-dedupe";

const SNAPSHOT_SETTING_KEY = "viralResearchSnapshot";
const LAST_UPDATE_SETTING_KEY = "lastViralResearchUpdate";
const SNAPSHOT_CACHE_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_MAX_AGE_MS = 18 * 60 * 60 * 1000;
const RESEARCH_TIMEOUT_MS = 110_000;
const MAX_CANDIDATES = 40;

export type ViralEvidence = {
  url: string;
  title: string;
  publishedAt: string;
  claim: string;
};

export type ViralCandidate = {
  trackName: string;
  artistName: string;
  artistAliases: string[];
  confidence: number;
  score: number;
  rationale: string;
  evidence: ViralEvidence[];
  newestEvidenceAt: string;
  hasDirectTikTokEvidence: boolean;
};

export type ViralResearchSnapshot = {
  version: 1;
  generatedAt: string;
  expiresAt: string;
  model: string;
  candidates: ViralCandidate[];
  rejectedCount: number;
  sourceCount: number;
};

export type AgentCandidate = {
  trackName: string;
  artistName: string;
  artistAliases: string[];
  confidence: number;
  rationale: string;
  evidence: ViralEvidence[];
};

export type AgentPayload = {
  candidates: AgentCandidate[];
  runner?: string;
  model?: string;
};

type OpenAIResponse = {
  output?: Array<Record<string, unknown>>;
  error?: { message?: string };
};

let snapshotCache: { snapshot: ViralResearchSnapshot | null; timestamp: number } | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const pathname = parsed.pathname.replace(/\/$/, "") || "/";
    return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${pathname}`.toLowerCase();
  } catch {
    return null;
  }
}

function sourceDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isTikTokDomain(domain: string) {
  return domain === "tiktok.com" || domain.endsWith(".tiktok.com");
}

function extractResponseText(response: OpenAIResponse) {
  for (const item of response.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return "";
}

function collectUrls(value: unknown, output: Set<string>) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) collectUrls(entry, output);
    return;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.url === "string") {
    const normalized = normalizeUrl(record.url);
    if (normalized) output.add(normalized);
  }
  for (const nested of Object.values(record)) collectUrls(nested, output);
}

function collectSearchSourceUrls(response: OpenAIResponse) {
  const urls = new Set<string>();
  for (const item of response.output ?? []) {
    if (item.type === "web_search_call") {
      collectUrls(item.action ?? item, urls);
      continue;
    }

    if (item.type === "message" && Array.isArray(item.content)) {
      for (const content of item.content as Array<Record<string, unknown>>) {
        collectUrls(content.annotations, urls);
      }
    }
  }
  return urls;
}

function parsePublishedAt(value: string, now: number) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed) || parsed > now + 24 * 60 * 60 * 1000) return null;
  if (now - parsed > 45 * 24 * 60 * 60 * 1000) return null;
  return parsed;
}

function validateCandidate(candidate: AgentCandidate, citedUrls: Set<string>, now: number): ViralCandidate | null {
  const trackName = candidate.trackName?.trim();
  const artistName = candidate.artistName?.trim();
  const confidence = clamp(Number(candidate.confidence) || 0, 0, 100);
  if (!trackName || !artistName || confidence < 55) return null;

  const evidence = (candidate.evidence ?? [])
    .map((entry) => {
      const normalizedUrl = normalizeUrl(entry.url);
      const publishedAt = parsePublishedAt(entry.publishedAt, now);
      if (!normalizedUrl || !publishedAt || !citedUrls.has(normalizedUrl)) return null;
      return {
        url: entry.url,
        title: entry.title?.trim().slice(0, 180) || sourceDomain(entry.url),
        publishedAt: new Date(publishedAt).toISOString(),
        claim: entry.claim?.trim().slice(0, 240) || "Reports current TikTok momentum.",
      } satisfies ViralEvidence;
    })
    .filter((entry): entry is ViralEvidence => entry !== null)
    .filter((entry, index, entries) => entries.findIndex((other) => normalizeUrl(other.url) === normalizeUrl(entry.url)) === index);

  const domains = new Set(evidence.map((entry) => sourceDomain(entry.url)).filter(Boolean));
  const hasDirectTikTokEvidence = [...domains].some(isTikTokDomain);
  const tiktokClaimCount = evidence.filter((entry) => /tiktok|creative center/i.test(`${entry.title} ${entry.claim}`)).length;
  if (evidence.length < 2 || domains.size < 2 || (!hasDirectTikTokEvidence && tiktokClaimCount < 2)) return null;

  const newestEvidenceMs = Math.max(...evidence.map((entry) => Date.parse(entry.publishedAt)));
  const newestAgeDays = Math.max(0, (now - newestEvidenceMs) / 86_400_000);
  const score = Math.round(clamp(
    (confidence * 0.35)
      + Math.min(30, domains.size * 12)
      + (hasDirectTikTokEvidence ? 15 : 7)
      + Math.max(0, 20 - newestAgeDays * 1.5),
    0,
    100
  ));

  return {
    trackName,
    artistName,
    artistAliases: (candidate.artistAliases ?? []).map((alias) => alias.trim()).filter(Boolean).slice(0, 6),
    confidence,
    score,
    rationale: candidate.rationale?.trim().slice(0, 320) || "Multiple recent sources report current TikTok momentum.",
    evidence,
    newestEvidenceAt: new Date(newestEvidenceMs).toISOString(),
    hasDirectTikTokEvidence,
  };
}

function buildValidatedSnapshot(payload: AgentPayload, citedUrls: Set<string>, model: string, now: number) {
  const rawCandidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const candidates = rawCandidates
    .map((candidate) => validateCandidate(candidate, citedUrls, now))
    .filter((candidate): candidate is ViralCandidate => candidate !== null)
    .filter((candidate, index, entries) => {
      const key = `${normalizeName(getCanonicalTrackTitle(candidate.trackName))}|${normalizeName(candidate.artistName)}`;
      return entries.findIndex((other) => `${normalizeName(getCanonicalTrackTitle(other.trackName))}|${normalizeName(other.artistName)}` === key) === index;
    })
    .sort((left, right) => right.score - left.score || Date.parse(right.newestEvidenceAt) - Date.parse(left.newestEvidenceAt));

  const generatedAt = new Date(now).toISOString();
  return {
    version: 1,
    generatedAt,
    expiresAt: new Date(now + SNAPSHOT_MAX_AGE_MS).toISOString(),
    model,
    candidates,
    rejectedCount: Math.max(0, rawCandidates.length - candidates.length),
    sourceCount: citedUrls.size,
  } satisfies ViralResearchSnapshot;
}

async function persistSnapshot(snapshot: ViralResearchSnapshot, trigger: string, startedAt: number, logId: string, details: Record<string, unknown> = {}) {
  await prisma.$transaction([
    prisma.siteSetting.upsert({
      where: { key: SNAPSHOT_SETTING_KEY },
      update: { value: JSON.stringify(snapshot) },
      create: { key: SNAPSHOT_SETTING_KEY, value: JSON.stringify(snapshot) },
    }),
    prisma.siteSetting.upsert({
      where: { key: LAST_UPDATE_SETTING_KEY },
      update: { value: snapshot.generatedAt },
      create: { key: LAST_UPDATE_SETTING_KEY, value: snapshot.generatedAt },
    }),
    prisma.updateLog.update({
      where: { id: logId },
      data: {
        status: "completed",
        updatedCount: snapshot.candidates.length,
        failedCount: snapshot.rejectedCount,
        durationMs: Date.now() - startedAt,
        details: JSON.stringify({
          trigger,
          model: snapshot.model,
          accepted: snapshot.candidates.length,
          rejected: snapshot.rejectedCount,
          sources: snapshot.sourceCount,
          ...details,
        }),
        completedAt: new Date(),
      },
    }),
  ]);
  snapshotCache = { snapshot, timestamp: Date.now() };
}

function buildResearchRequest(model: string) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    model,
    store: false,
    max_tool_calls: 12,
    include: ["web_search_call.action.sources"],
    tools: [{ type: "web_search", search_context_size: "high" }],
    instructions: [
      "You are the evidence-gathering editor for phonk.forum's public viral music leaderboard.",
      "Find phonk, Brazilian phonk/funk, drift phonk, montagem, and closely related tracks that are demonstrably going viral on TikTok right now.",
      "Search TikTok Creative Center, current dated reporting, commercial music analytics pages, label/artist announcements, and other independent current sources.",
      "Do not treat release recency, Spotify popularity, YouTube views, playlist titles, or an undated TikTok post as proof of current virality.",
      "Do not copy or estimate play/view/use counts and do not create a derived Spotify/YouTube metric.",
      "Every candidate needs at least two independent sources from different domains published in the last 45 days; both must explicitly support current TikTok momentum.",
      "Prefer at least one direct TikTok or TikTok Creative Center source. Never invent a title, artist, date, URL, or claim.",
      `Today is ${today}. Return at most ${MAX_CANDIDATES} candidates, strongest and freshest first.`,
    ].join(" "),
    input: "Research which phonk and adjacent Brazilian funk/montagem songs are currently viral on TikTok. Return only source-backed candidates.",
    text: {
      format: {
        type: "json_schema",
        name: "viral_phonk_research",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["candidates"],
          properties: {
            candidates: {
              type: "array",
              maxItems: MAX_CANDIDATES,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["trackName", "artistName", "artistAliases", "confidence", "rationale", "evidence"],
                properties: {
                  trackName: { type: "string" },
                  artistName: { type: "string" },
                  artistAliases: { type: "array", items: { type: "string" }, maxItems: 6 },
                  confidence: { type: "number", minimum: 0, maximum: 100 },
                  rationale: { type: "string" },
                  evidence: {
                    type: "array",
                    minItems: 2,
                    maxItems: 6,
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["url", "title", "publishedAt", "claim"],
                      properties: {
                        url: { type: "string" },
                        title: { type: "string" },
                        publishedAt: { type: "string" },
                        claim: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

async function requestResearch(apiKey: string, model: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildResearchRequest(model)),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as OpenAIResponse | null;
    if (!response.ok || !body) {
      throw new Error(body?.error?.message || `OpenAI research request failed with ${response.status}.`);
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

export function getViralResearchProvider() {
  return process.env.VIRAL_RESEARCH_PROVIDER?.trim().toLowerCase() === "ares" ? "ares" : "server";
}

export function isServerViralResearchConfigured() {
  return getViralResearchProvider() === "server"
    && process.env.VIRAL_RESEARCH_ENABLED !== "false"
    && Boolean(process.env.OPENAI_API_KEY);
}

export function isViralResearchConfigured() {
  return getViralResearchProvider() === "ares"
    ? Boolean(process.env.VIRAL_RESEARCH_INGEST_SECRET)
    : isServerViralResearchConfigured();
}

export async function runViralResearchUpdate(trigger = "manual") {
  if (getViralResearchProvider() === "ares") throw new Error("Viral research is assigned to the ARES Codex runner.");
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  if (process.env.VIRAL_RESEARCH_ENABLED === "false") throw new Error("Viral research is disabled.");

  const model = process.env.VIRAL_RESEARCH_MODEL?.trim() || "gpt-5.4-nano";
  const startedAt = Date.now();
  const log = await prisma.updateLog.create({
    data: { trigger, updateType: "viral-research", status: "running", totalArtists: 0 },
  });

  try {
    const response = await requestResearch(apiKey, model);
    const text = extractResponseText(response);
    if (!text) throw new Error("The research agent returned no structured output.");
    const payload = JSON.parse(text) as AgentPayload;
    const citedUrls = collectSearchSourceUrls(response);
    const snapshot = buildValidatedSnapshot(payload, citedUrls, model, Date.now());
    await persistSnapshot(snapshot, trigger, startedAt, log.id);
    return snapshot;
  } catch (error) {
    await prisma.updateLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        failedCount: 1,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    }).catch(() => {});
    throw error;
  }
}

export async function ingestAresViralResearch(payload: AgentPayload, model: string) {
  const startedAt = Date.now();
  const log = await prisma.updateLog.create({
    data: { trigger: "ares", updateType: "viral-research", status: "running", totalArtists: 0 },
  });

  try {
    const citedUrls = new Set<string>();
    for (const candidate of Array.isArray(payload.candidates) ? payload.candidates : []) {
      for (const evidence of Array.isArray(candidate.evidence) ? candidate.evidence : []) {
        const normalized = normalizeUrl(evidence.url);
        if (normalized) citedUrls.add(normalized);
      }
    }
    const snapshot = buildValidatedSnapshot(payload, citedUrls, model.slice(0, 100) || "codex-cli", Date.now());
    await persistSnapshot(snapshot, "ares", startedAt, log.id, { runner: "ARES" });
    return snapshot;
  } catch (error) {
    await prisma.updateLog.update({
      where: { id: log.id },
      data: {
        status: "failed",
        failedCount: 1,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
      },
    }).catch(() => {});
    throw error;
  }
}

export async function getViralResearchSnapshot() {
  const now = Date.now();
  if (snapshotCache && now - snapshotCache.timestamp < SNAPSHOT_CACHE_TTL_MS) return snapshotCache.snapshot;

  const setting = await prisma.siteSetting.findUnique({ where: { key: SNAPSHOT_SETTING_KEY }, select: { value: true } });
  if (!setting?.value) {
    snapshotCache = { snapshot: null, timestamp: now };
    return null;
  }

  try {
    const snapshot = JSON.parse(setting.value) as ViralResearchSnapshot;
    const generatedAt = Date.parse(snapshot.generatedAt);
    const expiresAt = Date.parse(snapshot.expiresAt);
    if (snapshot.version !== 1 || !Array.isArray(snapshot.candidates) || Number.isNaN(generatedAt) || Number.isNaN(expiresAt) || expiresAt <= now || now - generatedAt > SNAPSHOT_MAX_AGE_MS) {
      snapshotCache = { snapshot: null, timestamp: now };
      return null;
    }
    snapshotCache = { snapshot, timestamp: now };
    return snapshot;
  } catch {
    snapshotCache = { snapshot: null, timestamp: now };
    return null;
  }
}

function artistMatches(trackArtists: string[], candidate: ViralCandidate) {
  const normalizedArtists = new Set(trackArtists.map(normalizeName).filter(Boolean));
  return [candidate.artistName, ...candidate.artistAliases].some((artist) => normalizedArtists.has(normalizeName(artist)));
}

export function resolveViralCandidateForTrack(
  track: { name: string; artist: { name: string }; featuredArtists: string[] },
  snapshot: ViralResearchSnapshot | null,
  period: "day" | "week" | "month"
) {
  if (!snapshot) return null;
  const maxAgeMs = period === "day" ? 2 * 86_400_000 : period === "week" ? 10 * 86_400_000 : 35 * 86_400_000;
  const normalizedTrackTitle = normalizeName(getCanonicalTrackTitle(track.name));
  const artists = [track.artist.name, ...track.featuredArtists];

  return snapshot.candidates.find((candidate) => {
    const evidenceAge = Date.now() - Date.parse(candidate.newestEvidenceAt);
    return evidenceAge >= 0
      && evidenceAge <= maxAgeMs
      && normalizeName(getCanonicalTrackTitle(candidate.trackName)) === normalizedTrackTitle
      && artistMatches(artists, candidate);
  }) ?? null;
}
