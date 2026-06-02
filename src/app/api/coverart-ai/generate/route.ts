import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  FEATURE_KEYS,
  getNumericFeatureLimit,
  getPublicPlanEntitlements,
  valueToNumber,
} from "@/lib/entitlements";
import { buildMemphisCoverartParams, isMemphisModelId, normalizeCoverartApiUrl } from "@/lib/coverart-api";
import { entitlementSchemaNotAppliedResponse, isPrismaSchemaNotAppliedError } from "@/lib/prisma-errors";

type GenerateRequestBody = {
  prompt?: unknown;
  modelId?: unknown;
  resolution?: unknown;
};

type JobSubmissionResponse = {
  job_id?: string;
  status?: string;
  queue_position?: number | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as GenerateRequestBody;
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const modelId = typeof body.modelId === "string" ? body.modelId : "";
    const resolution = Number(body.resolution);

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
    }

    if (!isMemphisModelId(modelId)) {
      return NextResponse.json({ error: "Unsupported Memphis model." }, { status: 400 });
    }

    if (!Number.isFinite(resolution) || resolution <= 0) {
      return NextResponse.json({ error: "A valid resolution is required." }, { status: 400 });
    }

    const maxResolution = await getAllowedResolution();
    if (resolution > maxResolution) {
      return NextResponse.json(
        {
          error: `Your current plan supports cover art up to ${maxResolution}px.`,
          maxResolution,
        },
        { status: 403 }
      );
    }

    const submitResponse = await fetch(normalizeCoverartApiUrl("/v1/generate/submit"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        task_type: "cover_art",
        model: "cover_art_qwen_q6_gguf",
        params: buildMemphisCoverartParams({ modelId, prompt, resolution }),
      }),
    });

    const submitPayload = (await submitResponse.json().catch(() => null)) as JobSubmissionResponse | null;
    if (!submitResponse.ok || !submitPayload?.job_id) {
      return NextResponse.json(
        { error: apiErrorMessage(submitPayload, "Failed to submit cover art job.") },
        { status: submitResponse.status || 502 }
      );
    }

    return NextResponse.json({
      jobId: submitPayload.job_id,
      status: submitPayload.status ?? "queued",
      queuePosition: submitPayload.queue_position ?? null,
    });
  } catch (error) {
    if (isPrismaSchemaNotAppliedError(error)) return entitlementSchemaNotAppliedResponse();
    const message = error instanceof Error ? error.message : "Failed to generate cover art.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function getAllowedResolution() {
  const session = await auth();
  if (session) {
    return getNumericFeatureLimit(session.user.id, FEATURE_KEYS.coverartMaxResolution, 1024);
  }

  const entitlements = await getPublicPlanEntitlements("free");
  return valueToNumber(entitlements.features[FEATURE_KEYS.coverartMaxResolution]?.value, 1024);
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;

  if ("error" in payload && typeof payload.error === "string" && payload.error.trim()) {
    return payload.error;
  }

  if ("detail" in payload && Array.isArray(payload.detail)) {
    const messages = payload.detail
      .map((entry) => (entry && typeof entry === "object" && "msg" in entry ? entry.msg : null))
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (messages.length > 0) return messages.join(" ");
  }

  return fallback;
}
