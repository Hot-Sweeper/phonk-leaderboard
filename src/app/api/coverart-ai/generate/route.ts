import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  FEATURE_KEYS,
  getNumericFeatureLimit,
  getPublicPlanEntitlements,
  valueToNumber,
} from "@/lib/entitlements";
import {
  buildMemphisCoverartParams,
  isMemphisModelId,
  normalizeCoverartApiUrl,
} from "@/lib/coverart-api";
import { entitlementSchemaNotAppliedResponse, isPrismaSchemaNotAppliedError } from "@/lib/prisma-errors";

const JOB_POLL_INTERVAL_MS = 1500;
const JOB_TIMEOUT_MS = 90000;

type GenerateRequestBody = {
  prompt?: unknown;
  modelId?: unknown;
  resolution?: unknown;
};

type JobSubmissionResponse = {
  job_id?: string;
  status?: string;
};

type JobDetailResponse = {
  status?: string;
  output_url?: string | null;
  result?: {
    output_url?: string | null;
  } | null;
  error?: string | null;
  detail?: Array<{ msg?: string }>;
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

    const job = await waitForCompletedJob(submitPayload.job_id);
    const outputUrl = job.result?.output_url ?? job.output_url;

    if (!outputUrl) {
      return NextResponse.json(
        { error: "The cover art job completed without an output URL." },
        { status: 502 }
      );
    }

    const normalizedOutputUrl = normalizeCoverartApiUrl(outputUrl);

    return NextResponse.json({
      jobId: submitPayload.job_id,
      resultUrl: `/api/coverart-ai/output?url=${encodeURIComponent(normalizedOutputUrl)}`,
      remoteUrl: normalizedOutputUrl,
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

async function waitForCompletedJob(jobId: string) {
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let lastStatus = "queued";

  while (Date.now() < deadline) {
    const response = await fetch(normalizeCoverartApiUrl(`/v1/jobs/${jobId}`), {
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as JobDetailResponse | null;

    if (!response.ok) {
      throw new Error(apiErrorMessage(payload, "Failed to poll cover art job."));
    }

    lastStatus = payload?.status ?? lastStatus;

    if (payload?.status === "completed") {
      return payload;
    }

    if (payload?.status === "failed" || payload?.status === "cancelled" || payload?.status === "timeout") {
      throw new Error(apiErrorMessage(payload, "Cover art generation failed."));
    }

    await delay(JOB_POLL_INTERVAL_MS);
  }

  throw new Error(`Cover art generation timed out while job was ${lastStatus}.`);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
