import { NextResponse } from "next/server";
import { normalizeCoverartApiUrl } from "@/lib/coverart-api";

type JobRouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

type RemoteJobDetail = {
  status?: string;
  output_url?: string | null;
  preview_url?: string | null;
  download_url?: string | null;
  result?: {
    output_url?: string | null;
    output_path?: string | null;
    preview_url?: string | null;
    download_url?: string | null;
  } | null;
  error?: string | null;
  progress?: number | null;
  current_step?: string | null;
  queue_position?: number | null;
  elapsed_seconds?: number | null;
  detail?: Array<{ msg?: string }>;
};

export async function GET(_request: Request, context: JobRouteContext) {
  const { jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const response = await fetch(normalizeCoverartApiUrl(`/v1/jobs/${encodeURIComponent(jobId)}`), {
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as RemoteJobDetail | null;

  if (!response.ok) {
    return NextResponse.json(
      { error: apiErrorMessage(payload, "Failed to poll cover art job.") },
      { status: response.status || 502 }
    );
  }

  const remoteOutputUrl = payload?.result?.output_url ?? payload?.output_url ?? null;
  const remotePreviewUrl = payload?.result?.preview_url ?? payload?.preview_url ?? remoteOutputUrl;
  const remoteDownloadUrl = payload?.result?.download_url ?? payload?.download_url ?? remoteOutputUrl;

  const previewUrl = remotePreviewUrl
    ? `/api/coverart-ai/output?url=${encodeURIComponent(normalizeCoverartApiUrl(remotePreviewUrl))}`
    : null;
  const downloadUrl = remoteDownloadUrl
    ? `/api/coverart-ai/output?download=1&url=${encodeURIComponent(normalizeCoverartApiUrl(remoteDownloadUrl))}`
    : null;

  return NextResponse.json({
    status: payload?.status ?? "queued",
    progress: payload?.progress ?? null,
    currentStep: payload?.current_step ?? null,
    queuePosition: payload?.queue_position ?? null,
    elapsedSeconds: payload?.elapsed_seconds ?? null,
    error: payload?.error ?? null,
    resultUrl: previewUrl,
    previewUrl,
    downloadUrl,
    outputPath: payload?.result?.output_path ?? null,
  });
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