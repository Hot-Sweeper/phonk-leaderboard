import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchSpotifyArtist, parseSpotifyUrl, fetchPlatformStats } from "@/lib/platforms";

// POST — bulk create artists from Spotify URLs (admin/mod only)
// Streams NDJSON progress events so the client can track each artist
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const isPrivileged =
    session.user.role === "ADMIN" || session.user.role === "MODERATOR";
  if (!isPrivileged) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { urls } = await req.json() as {
    urls: string[];
  };

  if (!Array.isArray(urls) || urls.length === 0) {
    return new Response(JSON.stringify({ error: "No URLs provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (urls.length > 100) {
    return new Response(JSON.stringify({ error: "Maximum 100 URLs at a time" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = session.user.id;
  const total = urls.length;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      }

      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (let i = 0; i < urls.length; i++) {
        const rawUrl = urls[i].trim();
        const spotifyId = parseSpotifyUrl(rawUrl);

        if (!spotifyId) {
          failed++;
          send({ type: "error", index: i, url: rawUrl, error: "Invalid Spotify URL" });
          send({ type: "progress", done: created + skipped + failed, total, created, skipped, failed });
          continue;
        }

        // Check duplicate
        const existing = await prisma.artist.findUnique({
          where: { spotifyId },
        });
        if (existing) {
          skipped++;
          send({ type: "skip", index: i, url: rawUrl, name: existing.name, reason: "Already exists" });
          send({ type: "progress", done: created + skipped + failed, total, created, skipped, failed });
          continue;
        }

        try {
          // Fetch Spotify data
          const spotifyData = await fetchSpotifyArtist(rawUrl);
          const artistName = spotifyData?.name ?? "Unknown Artist";
          const artistImage = spotifyData?.imageUrl ?? null;

          await prisma.artist.create({
            data: {
              spotifyId,
              name: artistName,
              imageUrl: artistImage,
              addedById: userId,
              links: {
                create: [{
                  platform: "SPOTIFY",
                  url: rawUrl,
                  handle: null,
                  followerCount: spotifyData?.followerCount ?? 0,
                  monthlyListeners: spotifyData?.monthlyListeners ?? 0,
                  platformId: spotifyId,
                }],
              },
            },
          });

          created++;
          send({ type: "created", index: i, url: rawUrl, name: artistName });
        } catch (e) {
          failed++;
          send({
            type: "error",
            index: i,
            url: rawUrl,
            error: e instanceof Error ? e.message : "Unknown error",
          });
        }

        send({ type: "progress", done: created + skipped + failed, total, created, skipped, failed });
      }

      send({ type: "done", total, created, skipped, failed });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "Transfer-Encoding": "chunked",
    },
  });
}
