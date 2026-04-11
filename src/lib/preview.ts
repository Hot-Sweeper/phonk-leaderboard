const ALLOWED_PREVIEW_HOST_SUFFIXES = [".dzcdn.net", ".scdn.co"];
const ALLOWED_PREVIEW_HOSTS = new Set(["p.scdn.co"]);

export function isValidPreviewUrl(previewUrl: string | null | undefined) {
  if (typeof previewUrl !== "string" || previewUrl.trim().length === 0) {
    return false;
  }

  try {
    const url = new URL(previewUrl.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    return ALLOWED_PREVIEW_HOSTS.has(url.hostname)
      || ALLOWED_PREVIEW_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export function toPreviewProxyUrl(previewUrl: string, deezerId?: string | null) {
  if (deezerId) {
    return `/api/preview?deezerId=${encodeURIComponent(deezerId)}`;
  }

  return `/api/preview?src=${encodeURIComponent(previewUrl.trim())}`;
}