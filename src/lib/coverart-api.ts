export type MemphisModelId = "memphis-fast" | "memphis-2-pro";

const DEFAULT_COVERART_API_BASE_URL = "https://api.redemann-design.de";
const DEFAULT_STYLE_WEIGHTS = {
  funk: 0,
  alquimia: 100,
  funk_do_funk: 0,
} as const;

export function getCoverartApiBaseUrl() {
  return (
    process.env.MEMPHIS_COVERART_API_BASE_URL ??
    process.env.REDEMANN_DESIGN_API_BASE_URL ??
    DEFAULT_COVERART_API_BASE_URL
  ).replace(/\/+$/, "");
}

export function normalizeCoverartApiUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${getCoverartApiBaseUrl()}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

export function isMemphisModelId(value: string): value is MemphisModelId {
  return value === "memphis-fast" || value === "memphis-2-pro";
}

export function buildMemphisCoverartParams(options: {
  modelId: MemphisModelId;
  prompt: string;
  resolution: number;
}) {
  return {
    prompt: options.prompt,
    width: options.resolution,
    height: options.resolution,
    model: "cover_art_qwen_q6_gguf",
    ...DEFAULT_STYLE_WEIGHTS,
    ...(options.modelId === "memphis-fast" ? { preset: "fast" } : {}),
  };
}