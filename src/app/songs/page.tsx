"use client";
import { Music, Flame, Clock, Play, TrendingUp } from "lucide-react";

const PLACEHOLDER_SONGS = [
  { title: "MURDER IN MY MIND", artist: "Kordhell", plays: "320M", trend: "+12%" },
  { title: "CLOSE EYES", artist: "DVRST", plays: "280M", trend: "+8%" },
  { title: "METAMORPHOSIS", artist: "INTERWORLD", plays: "210M", trend: "+15%" },
  { title: "GHOSTFACE PLAYA", artist: "PHONK", plays: "180M", trend: "+5%" },
  { title: "FUNK TOTAL", artist: "DJ FKU", plays: "150M", trend: "+22%" },
  { title: "BRAZILIAN DRIFT", artist: "RXDXVIL", plays: "130M", trend: "+9%" },
];

export default function SongsPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans relative">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-5xl mx-auto relative z-10">
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 mb-2">
          <Music className="w-8 h-8 text-green-400" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-green-400">
            Trending Songs
          </span>
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm mb-8 max-w-lg">
          Discover what's hot right now in the Phonk world. Trending tracks, curated picks, and underground gems.
        </p>

        {/* Coming soon banner */}
        <div className="rounded-2xl border border-green-500/20 bg-gradient-to-br from-green-500/10 to-transparent p-8 text-center mb-10">
          <Flame className="w-12 h-12 text-green-400 mx-auto mb-4 opacity-60" />
          <h2 className="text-xl font-black mb-2">Coming Soon</h2>
          <p className="text-[var(--muted-foreground)] text-sm max-w-md mx-auto">
            Song tracking, Spotify integration, and community playlists are on the way. Stay tuned.
          </p>
        </div>

        {/* Preview list */}
        <h3 className="text-lg font-bold text-[var(--muted-foreground)] uppercase tracking-widest text-xs mb-4">
          Preview
        </h3>
        <div className="flex flex-col gap-2">
          {PLACEHOLDER_SONGS.map((song, i) => (
            <div
              key={song.title}
              className="flex items-center gap-4 px-5 py-3.5 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 opacity-60"
            >
              <span className="w-8 text-center font-black text-lg tabular-nums text-[var(--muted-foreground)]">
                {i + 1}
              </span>
              <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center shrink-0">
                <Play className="w-4 h-4 text-[var(--muted-foreground)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-base truncate">{song.title}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{song.artist}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold tabular-nums">{song.plays}</div>
                <div className="text-xs text-green-400 flex items-center gap-0.5 justify-end">
                  <TrendingUp className="w-3 h-3" /> {song.trend}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
