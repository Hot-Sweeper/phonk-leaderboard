"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useDetailPanel } from "@/lib/detail-panel";

/**
 * Shareable artist URLs: /artistname
 * Slugifies the name, does a lookup, then opens the detail panel and redirects to /rankings.
 */
export default function ArtistSlugPage() {
  const params = useParams();
  const router = useRouter();
  const { openArtist } = useDetailPanel();
  const slug = typeof params.slug === "string" ? params.slug : "";

  useEffect(() => {
    if (!slug) { router.replace("/rankings"); return; }
    fetch(`/api/artists/lookup?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { id: string } | null) => {
        if (data?.id) {
          openArtist(data.id);
          router.replace("/rankings");
        } else {
          router.replace("/rankings");
        }
      })
      .catch(() => router.replace("/rankings"));
  }, [slug, openArtist, router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
