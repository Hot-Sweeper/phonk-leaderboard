import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  fetchSpotifyArtistDetails,
  fetchSpotifyFullCatalog,
  parseSpotifyUrl,
} from "../src/lib/platforms";

type ArtistWithLinks = {
  id: string;
  name: string;
  spotifyId: string | null;
  links: { platform: string; url: string; platformId: string | null }[];
};

function getSpotifyId(artist: ArtistWithLinks): string | null {
  if (artist.spotifyId) return artist.spotifyId;

  const spotifyLink = artist.links.find((link) => link.platform === "SPOTIFY");
  if (!spotifyLink) return null;

  return spotifyLink.platformId ?? parseSpotifyUrl(spotifyLink.url);
}

async function main() {
  const targetArtistName = process.argv[2] ?? "Cytrena";

  const artist = (await prisma.artist.findFirst({
    where: { name: { equals: targetArtistName, mode: "insensitive" } },
    include: { links: true },
  })) as ArtistWithLinks | null;

  if (!artist) {
    throw new Error(`Artist "${targetArtistName}" not found in database.`);
  }

  const spotifyId = getSpotifyId(artist);
  if (!spotifyId) {
    throw new Error(`Artist "${targetArtistName}" has no usable Spotify ID/link.`);
  }

  const artistDetails = await fetchSpotifyArtistDetails(spotifyId);
  const fullCatalog = await fetchSpotifyFullCatalog(spotifyId);

  if (!fullCatalog) {
    throw new Error("Spotify catalog fetch returned null.");
  }

  if (artistDetails) {
    await prisma.artist.update({
      where: { id: artist.id },
      data: {
        imageUrl: artistDetails.images[0]?.url ?? null,
        genres: artistDetails.genres,
        spotifyPopularity: artistDetails.popularity ?? 0,
      },
    });
  }

  let upserted = 0;
  for (const track of fullCatalog) {
    const featuredArtists = (track.artists ?? [])
      .map((a) => a.name)
      .filter((name) => name.toLowerCase() !== artist.name.toLowerCase());

    if (!track.id) continue;

    await prisma.track.upsert({
      where: { spotifyId: track.id },
      create: {
        spotifyId: track.id,
        artistId: artist.id,
        name: track.name,
        albumName: track.album.name,
        albumImageUrl: track.album.imageUrl,
        previewUrl: track.previewUrl,
        durationMs: track.durationMs ?? 0,
        popularity: track.popularity ?? 0,
        spotifyPopularity: track.popularity ?? 0,
        trackNumber: track.trackNumber ?? 0,
        discNumber: track.discNumber ?? 0,
        explicit: track.explicit ?? false,
        releaseDate: track.album.releaseDate,
        spotifyUrl: track.spotifyUrl,
        featuredArtists,
        contributorIds: [],
      },
      update: {
        artistId: artist.id,
        name: track.name,
        albumName: track.album.name,
        albumImageUrl: track.album.imageUrl,
        previewUrl: track.previewUrl,
        durationMs: track.durationMs ?? 0,
        popularity: track.popularity ?? 0,
        spotifyPopularity: track.popularity ?? 0,
        trackNumber: track.trackNumber ?? 0,
        discNumber: track.discNumber ?? 0,
        explicit: track.explicit ?? false,
        releaseDate: track.album.releaseDate,
        spotifyUrl: track.spotifyUrl,
        featuredArtists,
      },
    });
    upserted++;
  }

  const withPopularity = await prisma.track.count({
    where: { artistId: artist.id, spotifyPopularity: { gt: 0 } },
  });

  const withCoverArt = await prisma.track.count({
    where: { artistId: artist.id, albumImageUrl: { not: null } },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        artist: artist.name,
        spotifyId,
        totalCatalogTracksFetched: fullCatalog.length,
        tracksUpserted: upserted,
        tracksWithSpotifyPopularity: withPopularity,
        tracksWithCoverArt: withCoverArt,
        artistProfileImage: artistDetails?.images?.[0]?.url ?? null,
        artistGenres: artistDetails?.genres ?? [],
        artistPopularity: artistDetails?.popularity ?? 0,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
