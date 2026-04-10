"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { finishSpotifyAuth } from "@/lib/spotify-browser";

export default function SpotifyAuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const returnTo = await finishSpotifyAuth();
        window.location.replace(returnTo);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Spotify connection failed.");
      }
    })();
  }, []);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4">
      <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md text-center">
        {error ? (
          <p className="text-red-400 font-bold">{error}</p>
        ) : (
          <div className="flex items-center justify-center gap-3 text-[var(--muted-foreground)]">
            <Loader2 className="w-5 h-5 animate-spin" />
            Connecting Spotify...
          </div>
        )}
      </div>
    </main>
  );
}