"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession, signIn } from "next-auth/react";
import { Music, ThumbsUp, Plus, X, ExternalLink } from "lucide-react";

type Song = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  youtubeUrl?: string;
  spotifyUrl?: string;
  coverUrl?: string;
  voteCount: number;
};

const GENRE_LABELS: Record<string, string> = {
  PHONK: "Phonk",
  FUNK: "Funk",
  DRIFT_PHONK: "Drift Phonk",
  BRAZILIAN_PHONK: "Brazilian Phonk",
  MEMPHIS: "Memphis",
  OTHER: "Other",
};

const GENRE_COLORS: Record<string, string> = {
  PHONK: "bg-purple-900/50 text-purple-300",
  FUNK: "bg-yellow-900/50 text-yellow-300",
  DRIFT_PHONK: "bg-blue-900/50 text-blue-300",
  BRAZILIAN_PHONK: "bg-green-900/50 text-green-300",
  MEMPHIS: "bg-red-900/50 text-red-300",
  OTHER: "bg-zinc-700/50 text-zinc-300",
};

export default function SongsPage() {
  const { data: session } = useSession();
  const [songs, setSongs] = useState<Song[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    title: "",
    artist: "",
    genre: "PHONK",
    youtubeUrl: "",
    spotifyUrl: "",
    coverUrl: "",
  });

  const loadSongs = useCallback(async () => {
    const res = await fetch("/api/songs");
    if (res.ok) setSongs(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSongs();
  }, [loadSongs]);

  async function vote(songId: string, hasVoted: boolean) {
    if (!session) return signIn("google");
    const res = await fetch("/api/vote", {
      method: hasVoted ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    });
    if (res.ok) {
      setVotedIds((prev) => {
        const next = new Set(prev);
        hasVoted ? next.delete(songId) : next.add(songId);
        return next;
      });
      setSongs((prev) =>
        prev.map((s) =>
          s.id === songId
            ? { ...s, voteCount: s.voteCount + (hasVoted ? -1 : 1) }
            : s
        )
      );
    }
  }

  async function submitSong(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return signIn("google");
    const res = await fetch("/api/songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const song = await res.json();
      setSongs((prev) => [song, ...prev]);
      setShowForm(false);
      setForm({ title: "", artist: "", genre: "PHONK", youtubeUrl: "", spotifyUrl: "", coverUrl: "" });
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      <div className="max-w-3xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-br from-white to-[var(--accent)]">
              <Music className="w-8 h-8 text-[var(--accent)]" />
              Top Songs
            </h1>
            <p className="text-[var(--muted-foreground)] mt-1">
              Vote for the all-time greatest Funk/Phonk tracks.
            </p>
          </div>
          <button
            onClick={() => (session ? setShowForm(true) : signIn("google"))}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white text-sm font-bold transition-all shadow-[0_0_15px_var(--accent-glow)]"
          >
            <Plus className="w-4 h-4" /> Submit Song
          </button>
        </div>

        {/* Submit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
            <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 w-full max-w-md relative">
              <button
                onClick={() => setShowForm(false)}
                className="absolute top-4 right-4 text-[var(--muted-foreground)] hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-black mb-4">Submit a Track</h2>
              <form onSubmit={submitSong} className="flex flex-col gap-3">
                <input
                  required
                  placeholder="Track title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <input
                  required
                  placeholder="Artist name"
                  value={form.artist}
                  onChange={(e) => setForm((f) => ({ ...f, artist: e.target.value }))}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <select
                  value={form.genre}
                  onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  {Object.entries(GENRE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <input
                  placeholder="YouTube URL (optional)"
                  value={form.youtubeUrl}
                  onChange={(e) => setForm((f) => ({ ...f, youtubeUrl: e.target.value }))}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <input
                  placeholder="Spotify URL (optional)"
                  value={form.spotifyUrl}
                  onChange={(e) => setForm((f) => ({ ...f, spotifyUrl: e.target.value }))}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                <button
                  type="submit"
                  className="mt-2 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all"
                >
                  Submit Track
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Songs list */}
        {loading ? (
          <div className="text-center text-[var(--muted-foreground)] py-20">Loading...</div>
        ) : songs.length === 0 ? (
          <div className="text-center py-20 text-[var(--muted-foreground)]">
            No tracks yet. Be the first to submit one!
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {songs.map((song, i) => {
              const hasVoted = votedIds.has(song.id);
              return (
                <div
                  key={song.id}
                  className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 flex items-center gap-4 hover:border-zinc-600 transition-colors"
                >
                  {/* Rank */}
                  <span className={`text-2xl font-black w-8 text-center shrink-0 ${
                    i === 0 ? "text-yellow-400" : i === 1 ? "text-zinc-300" : i === 2 ? "text-amber-600" : "text-zinc-600"
                  }`}>{i + 1}</span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base truncate">{song.title}</div>
                    <div className="text-[var(--muted-foreground)] text-sm">{song.artist}</div>
                    <span className={`mt-1 inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${GENRE_COLORS[song.genre] ?? GENRE_COLORS.OTHER}`}>
                      {GENRE_LABELS[song.genre] ?? song.genre}
                    </span>
                  </div>

                  {/* Links */}
                  <div className="flex items-center gap-2 shrink-0">
                    {song.youtubeUrl && (
                      <a href={song.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--muted-foreground)] hover:text-white transition-colors">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {song.spotifyUrl && (
                      <a href={song.spotifyUrl} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 transition-colors text-xs font-bold">
                        SPT
                      </a>
                    )}
                  </div>

                  {/* Vote */}
                  <button
                    onClick={() => vote(song.id, hasVoted)}
                    className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all shrink-0 ${
                      hasVoted
                        ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                        : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-zinc-700 hover:text-white"
                    }`}
                  >
                    <ThumbsUp className="w-4 h-4" />
                    <span className="text-xs font-black tabular-nums">{song.voteCount}</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
