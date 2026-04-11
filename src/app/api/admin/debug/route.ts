import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSpotifyToken, fetchDeezerTopTracks, resolveDeezerId } from "@/lib/platforms";

type CheckResult = {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
  detail?: string;
};

export async function GET() {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const checks: CheckResult[] = [];

  // ── 1. Environment Variables ──
  const envVars = [
    "DATABASE_URL",
    "SPOTIFY_CLIENT_ID",
    "SPOTIFY_CLIENT_SECRET",
    "YOUTUBE_API_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "NEXTAUTH_SECRET",
    "ADMIN_EMAILS",
  ];

  for (const v of envVars) {
    const val = process.env[v];
    checks.push({
      name: `ENV: ${v}`,
      status: val ? "ok" : "error",
      message: val ? `Set (${val.length} chars)` : "NOT SET",
    });
  }

  // ── 2. Database Connection ──
  try {
    const count = await prisma.artist.count();
    checks.push({
      name: "Database Connection",
      status: "ok",
      message: `Connected — ${count} artists in DB`,
    });
  } catch (err) {
    checks.push({
      name: "Database Connection",
      status: "error",
      message: "Failed to connect",
      detail: (err as Error).message,
    });
  }

  // ── 3. Spotify API Token ──
  try {
    const token = await getSpotifyToken();
    if (token) {
      checks.push({
        name: "Spotify API Token",
        status: "ok",
        message: `Token acquired (${token.substring(0, 12)}...)`,
      });
    } else {
      checks.push({
        name: "Spotify API Token",
        status: "error",
        message: "Failed to get token — check SPOTIFY_CLIENT_ID/SECRET",
      });
    }
  } catch (err) {
    checks.push({
      name: "Spotify API Token",
      status: "error",
      message: "Token request threw error",
      detail: (err as Error).message,
    });
  }

  // ── 4. Spotify API: Test artist fetch ──
  try {
    const token = await getSpotifyToken();
    if (token) {
      const res = await fetch("https://api.spotify.com/v1/artists/4q3ewBCX7sLwd24euuV69X", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        checks.push({
          name: "Spotify API: Artist Fetch",
          status: "ok",
          message: `Fetched "${data.name}" — ${data.followers?.total} followers`,
        });
      } else {
        const text = await res.text().catch(() => "");
        checks.push({
          name: "Spotify API: Artist Fetch",
          status: "error",
          message: `HTTP ${res.status}`,
          detail: text.substring(0, 300),
        });
      }
    } else {
      checks.push({
        name: "Spotify API: Artist Fetch",
        status: "warn",
        message: "Skipped — no token",
      });
    }
  } catch (err) {
    checks.push({
      name: "Spotify API: Artist Fetch",
      status: "error",
      message: "Request failed",
      detail: (err as Error).message,
    });
  }

  // ── 5. Spotify API: Test top tracks ──
  try {
    const token = await getSpotifyToken();
    if (token) {
      const res = await fetch(
        "https://api.spotify.com/v1/artists/4q3ewBCX7sLwd24euuV69X/top-tracks?market=US",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        const trackCount = data.tracks?.length ?? 0;
        checks.push({
          name: "Spotify API: Top Tracks",
          status: trackCount > 0 ? "ok" : "warn",
          message: `${trackCount} tracks returned`,
          detail: trackCount > 0
            ? data.tracks.slice(0, 3).map((t: { name: string }) => t.name).join(", ")
            : undefined,
        });
      } else {
        const text = await res.text().catch(() => "");
        checks.push({
          name: "Spotify API: Top Tracks",
          status: "error",
          message: `HTTP ${res.status}`,
          detail: text.substring(0, 300),
        });
      }
    } else {
      checks.push({
        name: "Spotify API: Top Tracks",
        status: "warn",
        message: "Skipped — no token",
      });
    }
  } catch (err) {
    checks.push({
      name: "Spotify API: Top Tracks",
      status: "error",
      message: "Request failed",
      detail: (err as Error).message,
    });
  }

  // ── 6. YouTube API ──
  try {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=UCzDzz8pl0ACwFpBIBGRjQ6g&key=${apiKey}`
      );
      if (res.ok) {
        const data = await res.json();
        const ch = data.items?.[0];
        checks.push({
          name: "YouTube API",
          status: ch ? "ok" : "warn",
          message: ch
            ? `Working — ${ch.statistics?.subscriberCount} subs`
            : "No channel found for test ID",
        });
      } else {
        const text = await res.text().catch(() => "");
        checks.push({
          name: "YouTube API",
          status: "error",
          message: `HTTP ${res.status}`,
          detail: text.substring(0, 300),
        });
      }
    } else {
      checks.push({
        name: "YouTube API",
        status: "warn",
        message: "Skipped — YOUTUBE_API_KEY not set",
      });
    }
  } catch (err) {
    checks.push({
      name: "YouTube API",
      status: "error",
      message: "Request failed",
      detail: (err as Error).message,
    });
  }

  // ── 7. Database Stats ──
  try {
    const [artists, tracks, links, users, logs] = await Promise.all([
      prisma.artist.count(),
      prisma.track.count(),
      prisma.artistLink.count(),
      prisma.user.count(),
      prisma.updateLog.count(),
    ]);
    checks.push({
      name: "DB Stats",
      status: "ok",
      message: `${artists} artists, ${tracks} tracks, ${links} links, ${users} users, ${logs} update logs`,
    });
  } catch (err) {
    checks.push({
      name: "DB Stats",
      status: "error",
      message: "Failed to query stats",
      detail: (err as Error).message,
    });
  }

  // ── 8. Recent Update Logs Summary ──
  try {
    const recentLogs = await prisma.updateLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    const running = recentLogs.filter((l) => l.status === "running").length;
    const failed = recentLogs.filter((l) => l.status === "failed").length;
    checks.push({
      name: "Recent Updates (last 5)",
      status: running > 0 ? "warn" : failed > 0 ? "warn" : "ok",
      message: recentLogs
        .map(
          (l) =>
            `${l.updateType}/${l.status} (${new Date(l.createdAt).toLocaleString()})`
        )
        .join(" | "),
    });
  } catch (err) {
    checks.push({
      name: "Recent Updates",
      status: "error",
      message: "Failed to fetch logs",
      detail: (err as Error).message,
    });
  }

  // ── 9. Settings Persistence ──
  try {
    const settings = await prisma.siteSetting.findMany();
    if (settings.length === 0) {
      checks.push({
        name: "Settings Persistence",
        status: "warn",
        message: "No settings stored yet",
      });
    } else {
      checks.push({
        name: "Settings Persistence",
        status: "ok",
        message: settings.map((s) => `${s.key}=${s.value}`).join(", "),
      });
    }
  } catch (err) {
    checks.push({
      name: "Settings Persistence",
      status: "error",
      message: "Failed to read settings",
      detail: (err as Error).message,
    });
  }

  // ── 10. Deezer API ──
  try {
    const res = await fetch("https://api.deezer.com/artist/13/top?limit=3");
    if (res.ok) {
      const data = await res.json();
      const trackCount = data.data?.length ?? 0;
      checks.push({
        name: "Deezer API: Top Tracks",
        status: trackCount > 0 ? "ok" : "warn",
        message: `${trackCount} tracks returned (test artist: Eminem)`,
        detail: trackCount > 0
          ? data.data.slice(0, 3).map((t: { title: string }) => t.title).join(", ")
          : undefined,
      });
    } else {
      checks.push({
        name: "Deezer API: Top Tracks",
        status: "error",
        message: `HTTP ${res.status}`,
      });
    }
  } catch (err) {
    checks.push({
      name: "Deezer API: Top Tracks",
      status: "error",
      message: "Request failed",
      detail: (err as Error).message,
    });
  }

  // ── 11. Deezer ID Resolution Stats ──
  try {
    const totalArtists = await prisma.artist.count();
    const withDeezerId = await prisma.artist.count({ where: { deezerId: { not: null } } });
    checks.push({
      name: "Deezer ID Mapping",
      status: withDeezerId === 0 ? "warn" : withDeezerId < totalArtists ? "warn" : "ok",
      message: `${withDeezerId}/${totalArtists} artists have Deezer IDs`,
    });
  } catch {
    // Non-critical
  }

  // ── 12. Runtime Info ──
  checks.push({
    name: "Node.js Version",
    status: "ok",
    message: process.version,
  });
  checks.push({
    name: "Platform",
    status: "ok",
    message: `${process.platform} / ${process.arch}`,
  });
  checks.push({
    name: "Memory Usage",
    status: "ok",
    message: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB heap used / ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB RSS`,
  });

  return NextResponse.json({ checks, timestamp: new Date().toISOString() });
}

// POST — run specific debug actions
export async function POST(req: Request) {
  const session = await auth();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { action } = await req.json();

  if (action === "testSettingWrite") {
    const testKey = "_debug_test";
    const testValue = `test_${Date.now()}`;
    try {
      await prisma.siteSetting.upsert({
        where: { key: testKey },
        update: { value: testValue },
        create: { key: testKey, value: testValue },
      });
      const readBack = await prisma.siteSetting.findUnique({ where: { key: testKey } });
      // Clean up
      await prisma.siteSetting.delete({ where: { key: testKey } });

      if (readBack?.value === testValue) {
        return NextResponse.json({ status: "ok", message: `Write/read/delete cycle successful (wrote "${testValue}", read back "${readBack.value}")` });
      } else {
        return NextResponse.json({ status: "error", message: `Write succeeded but read back "${readBack?.value}" instead of "${testValue}"` });
      }
    } catch (err) {
      return NextResponse.json({ status: "error", message: (err as Error).message });
    }
  }

  if (action === "testSpotifyTopTracks") {
    try {
      const token = await getSpotifyToken();
      if (!token) {
        return NextResponse.json({ status: "error", message: "No Spotify token available" });
      }
      // Use a well-known artist to test
      const res = await fetch(
        "https://api.spotify.com/v1/artists/4q3ewBCX7sLwd24euuV69X/top-tracks?market=US",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const body = await res.text();
      return NextResponse.json({
        status: res.ok ? "ok" : "error",
        httpStatus: res.status,
        message: res.ok ? `Got ${JSON.parse(body).tracks?.length ?? 0} tracks` : "Request failed",
        detail: body.substring(0, 500),
      });
    } catch (err) {
      return NextResponse.json({ status: "error", message: (err as Error).message });
    }
  }

  if (action === "clearStaleRunning") {
    try {
      const stale = await prisma.updateLog.updateMany({
        where: { status: "running" },
        data: { status: "failed", error: "Manually cleared via debug panel" },
      });
      return NextResponse.json({ status: "ok", message: `Cleared ${stale.count} stale running logs` });
    } catch (err) {
      return NextResponse.json({ status: "error", message: (err as Error).message });
    }
  }

  if (action === "testDeezerResolve") {
    try {
      // Test Odesli resolution with a known Spotify artist
      const testSpotifyId = "4q3ewBCX7sLwd24euuV69X"; // Bas
      const deezerId = await resolveDeezerId(testSpotifyId);
      if (deezerId) {
        const tracks = await fetchDeezerTopTracks(deezerId);
        return NextResponse.json({
          status: "ok",
          message: `Resolved Spotify ${testSpotifyId} -> Deezer ${deezerId}, got ${tracks?.length ?? 0} tracks`,
          detail: tracks?.slice(0, 5).map(t => `${t.name} (${t.bpm ? Math.round(t.bpm) + ' BPM' : 'no BPM'}, preview: ${t.previewUrl ? 'yes' : 'no'})`).join("\n"),
        });
      } else {
        return NextResponse.json({
          status: "warn",
          message: "Odesli rate limited or no mapping found — may need to retry in a minute",
        });
      }
    } catch (err) {
      return NextResponse.json({ status: "error", message: (err as Error).message });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
