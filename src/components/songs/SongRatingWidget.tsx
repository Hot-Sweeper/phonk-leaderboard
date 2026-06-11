"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { Loader2, Star } from "lucide-react";

type RatingPayload = {
  average: number | null;
  count: number;
  userRating: number | null;
};

export default function SongRatingWidget({ trackId }: { trackId: string }) {
  const { data: session } = useSession();
  const [data, setData] = useState<RatingPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/songs/${trackId}/ratings`);
      if (response.ok) setData(await response.json());
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitRating(value: number) {
    if (!session?.user) {
      signIn("google");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/songs/${trackId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: value }),
      });
      if (response.ok) setData(await response.json());
    } finally {
      setSaving(false);
    }
  }

  const display = hover ?? data?.userRating ?? 0;

  return (
    <div className="mx-4 rounded-2xl border border-[var(--muted)]/40 bg-white/[0.025] p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
          Community rating
        </h3>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--muted-foreground)]" /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              disabled={saving}
              onMouseEnter={() => setHover(value)}
              onMouseLeave={() => setHover(null)}
              onClick={() => void submitRating(value)}
              className="rounded p-0.5 transition hover:scale-110 disabled:opacity-50"
              aria-label={`Rate ${value} stars`}
            >
              <Star
                className={`h-5 w-5 ${
                  value <= display ? "fill-amber-300 text-amber-300" : "text-white/20"
                }`}
              />
            </button>
          ))}
        </div>
        <div className="text-xs text-[var(--muted-foreground)]">
          {data?.average != null ? (
            <>
              <span className="font-bold text-white">{data.average.toFixed(1)}</span>
              <span> avg · {data.count} rating{data.count === 1 ? "" : "s"}</span>
            </>
          ) : (
            <span>No ratings yet — be the first</span>
          )}
        </div>
      </div>

      {!session?.user ? (
        <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">Sign in to rate this track.</p>
      ) : data?.userRating ? (
        <p className="mt-2 text-[11px] text-white/35">Your rating: {data.userRating}/5</p>
      ) : null}
    </div>
  );
}
