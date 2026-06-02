import { NextResponse } from "next/server";
import { getCoverartApiBaseUrl } from "@/lib/coverart-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const remoteUrl = url.searchParams.get("url");
  const forceDownload = url.searchParams.get("download") === "1";

  if (!remoteUrl) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  let parsedRemoteUrl: URL;
  try {
    parsedRemoteUrl = new URL(remoteUrl);
  } catch {
    return NextResponse.json({ error: "Invalid output URL." }, { status: 400 });
  }

  const allowedOrigin = new URL(getCoverartApiBaseUrl()).origin;
  if (parsedRemoteUrl.origin !== allowedOrigin) {
    return NextResponse.json({ error: "Unsupported output host." }, { status: 400 });
  }

  const response = await fetch(parsedRemoteUrl.toString(), { cache: "no-store" });
  if (!response.ok || !response.body) {
    return NextResponse.json({ error: "Failed to fetch cover art output." }, { status: response.status || 502 });
  }

  const headers = new Headers();
  const contentType = response.headers.get("content-type");
  const contentLength = response.headers.get("content-length");
  const filename = sanitizeFilename(
    parsedRemoteUrl.searchParams.get("filename") ?? parsedRemoteUrl.pathname.split("/").pop() ?? "coverart.png"
  );

  if (contentType) headers.set("Content-Type", contentType);
  if (contentLength) headers.set("Content-Length", contentLength);
  headers.set("Cache-Control", "private, max-age=60, stale-while-revalidate=300");
  headers.set("Content-Disposition", `${forceDownload ? "attachment" : "inline"}; filename="${filename}"`);

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[\r\n"\\]/g, "_");
}