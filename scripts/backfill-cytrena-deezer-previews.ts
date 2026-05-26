import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { fetchDeezerFullCatalog, resolveArtistToDeezer } from "../src/lib/platforms";

function norm(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  const artist = await prisma.artist.findFirst({
    where: { name: { equals: "Cytrena", mode: "insensitive" } },
    include: { links: true },
  });

  if (!artist) {
    throw new Error("Cytrena not found");
  }

  const resolved = await resolveArtistToDeezer(artist.name, artist.spotifyId);
  if (!resolved.deezerId) {
    throw new Error("Unable to resolve Deezer artist ID for Cytrena");
  }

  const deezerId = resolved.deezerId;

  await prisma.artist.update({
    where: { id: artist.id },
    data: { deezerId },
  });

  const deezerCatalog = await fetchDeezerFullCatalog(deezerId);
  if (!deezerCatalog || deezerCatalog.length === 0) {
    throw new Error("No Deezer catalog found");
  }

  const localTracks = await prisma.track.findMany({
    where: { artistId: artist.id },
    select: { id: true, name: true, releaseDate: true, deezerId: true, previewUrl: true, albumImageUrl: true },
  });

  const byName = new Map<string, typeof deezerCatalog>();
  for (const track of deezerCatalog) {
    const key = norm(track.name);
    const list = byName.get(key) ?? [];
    list.push(track);
    byName.set(key, list);
  }

  let updated = 0;
  for (const local of localTracks) {
    const candidates = byName.get(norm(local.name)) ?? [];
    if (candidates.length === 0) continue;

    const preferred = candidates.find((c) => c.releaseDate && local.releaseDate && c.releaseDate.startsWith(local.releaseDate.slice(0, 4)))
      ?? candidates[0];

    const deezerIdStr = preferred.deezerId ? String(preferred.deezerId) : null;

    await prisma.track.update({
      where: { id: local.id },
      data: {
        deezerId: deezerIdStr,
        previewUrl: local.previewUrl ?? preferred.previewUrl ?? null,
        albumImageUrl: local.albumImageUrl ?? preferred.album.imageUrl ?? null,
        deezerUrl: preferred.deezerUrl ?? null,
      },
    });
    updated++;
  }

  const withPreview = await prisma.track.count({
    where: {
      artistId: artist.id,
      OR: [{ previewUrl: { not: null } }, { deezerId: { not: null } }],
    },
  });

  console.log(JSON.stringify({
    ok: true,
    artist: artist.name,
    deezerId,
    localTracks: localTracks.length,
    deezerCatalogTracks: deezerCatalog.length,
    updatedTracks: updated,
    playableOrResolvableTracks: withPreview,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
