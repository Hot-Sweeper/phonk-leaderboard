"use client";
import { useState, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Check,
  X,
  Loader2,
  Upload,
  Trash2,
  RefreshCw,
  Plus,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type SpotifyResult = {
  name: string | null;
  imageUrl: string | null;
  followerCount: number;
  platformId: string | null;
  url: string;
};

type YouTubeInfo = {
  name: string;
  handle: string | null;
  imageUrl: string | null;
  subscriberCount: number;
  platformId: string | null;
  url: string;
};

type ImportEntry = {
  id: string;
  status: "loading" | "ready" | "error";
  error?: string;
  youtube: YouTubeInfo | null;
  spotifyMatch: SpotifyResult | null;
  spotifySuggestions: SpotifyResult[];
  selectedSpotify: SpotifyResult | null;
  spotifyConfirmed: boolean;
  showSpotifySearch: boolean;
  spotifySearchQuery: string;
  spotifySearchResults: SpotifyResult[];
  spotifySearching: boolean;
  spotifyError?: string;
};

export default function ImportPage() {
  const { data: session, status } = useSession();
  const [entries, setEntries] = useState<ImportEntry[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    errors: { name: string; error: string }[];
  } | null>(null);
  const [showYTSearch, setShowYTSearch] = useState(false);
  const [ytSearchQuery, setYtSearchQuery] = useState("");
  const [ytSearching, setYtSearching] = useState(false);
  const [ytSearchResults, setYtSearchResults] = useState<YouTubeInfo[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  if (status === "loading")
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  if (!session || !isPrivileged) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <AlertCircle className="w-16 h-16 text-[var(--accent)]" />
        <h1 className="text-2xl font-black">Admin / Moderator only</h1>
        {!session && (
          <button
            onClick={() => signIn("google")}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white font-bold"
          >
            Sign In
          </button>
        )}
      </main>
    );
  }

  // Parse URLs from input and look them up
  async function handleAddUrls() {
    const urls = urlInput
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter(
        (u) =>
          u &&
          (u.includes("youtube.com") ||
            u.includes("youtu.be"))
      );
    if (urls.length === 0) return;
    setUrlInput("");

    const newEntries: ImportEntry[] = urls.map((url) => ({
      id: crypto.randomUUID(),
      status: "loading",
      youtube: null,
      spotifyMatch: null,
      spotifySuggestions: [],
      selectedSpotify: null,
      spotifyConfirmed: false,
      showSpotifySearch: false,
      spotifySearchQuery: "",
      spotifySearchResults: [],
      spotifySearching: false,
    }));

    setEntries((prev) => [...prev, ...newEntries]);

    // Look up each URL
    for (let i = 0; i < urls.length; i++) {
      const entry = newEntries[i];
      try {
        const res = await fetch("/api/artists/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urls[i] }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          updateEntry(entry.id, {
            status: "error",
            error: err.error || "Lookup failed",
          });
          continue;
        }
        const data = await res.json();
        const noSpotifyFound =
          !data.spotifyMatch &&
          (!data.spotifySuggestions || data.spotifySuggestions.length === 0);
        updateEntry(entry.id, {
          status: "ready",
          youtube: data.youtube,
          spotifyMatch: data.spotifyMatch,
          spotifySuggestions: data.spotifySuggestions ?? [],
          selectedSpotify: data.spotifyMatch ?? null,
          spotifyConfirmed: !!data.spotifyMatch,
          spotifySearchQuery: data.youtube?.name ?? "",
          showSpotifySearch: noSpotifyFound,
          spotifyError: data.spotifyError ?? undefined,
        });
      } catch {
        updateEntry(entry.id, { status: "error", error: "Network error" });
      }
    }
  }

  function addFromYTSearch(channel: YouTubeInfo) {
    const entry: ImportEntry = {
      id: crypto.randomUUID(),
      status: "loading",
      youtube: channel,
      spotifyMatch: null,
      spotifySuggestions: [],
      selectedSpotify: null,
      spotifyConfirmed: false,
      showSpotifySearch: false,
      spotifySearchQuery: channel.name,
      spotifySearchResults: [],
      spotifySearching: false,
    };
    setEntries((prev) => [...prev, entry]);
    setShowYTSearch(false);
    setYtSearchQuery("");
    setYtSearchResults([]);

    // Look up the channel URL to find Spotify
    (async () => {
      try {
        const res = await fetch("/api/artists/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://youtube.com/@${channel.handle ?? channel.platformId}`,
          }),
        });
        if (!res.ok) {
          updateEntry(entry.id, { status: "ready" });
          return;
        }
        const data = await res.json();
        updateEntry(entry.id, {
          status: "ready",
          spotifyMatch: data.spotifyMatch,
          spotifySuggestions: data.spotifySuggestions ?? [],
          selectedSpotify: data.spotifyMatch ?? null,
          spotifyConfirmed: !!data.spotifyMatch,
        });
      } catch {
        updateEntry(entry.id, { status: "ready" });
      }
    })();
  }

  async function searchYouTube(q: string) {
    setYtSearchQuery(q);
    if (!q.trim()) {
      setYtSearchResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setYtSearching(true);
      try {
        const res = await fetch("/api/artists/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "search", q }),
        });
        if (res.ok) {
          const channels = await res.json();
          setYtSearchResults(
            channels.map(
              (c: { name: string; handle: string | null; imageUrl: string | null; subscriberCount: number; platformId: string | null }) => ({
                ...c,
                url: `https://youtube.com/${c.handle ? `@${c.handle}` : `channel/${c.platformId}`}`,
              })
            )
          );
        }
      } finally {
        setYtSearching(false);
      }
    }, 400);
  }

  function updateEntry(id: string, updates: Partial<ImportEntry>) {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...updates } : e))
    );
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function searchSpotify(entryId: string, query: string) {
    updateEntry(entryId, { spotifySearching: true, spotifyError: undefined });

    // Detect if it's a Spotify URL
    const isUrl = query.includes("open.spotify.com/");
    const body = isUrl ? { url: query.trim() } : { q: query.trim() };

    try {
      const res = await fetch("/api/artists/search-spotify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const results = await res.json();
        if (isUrl && results.length > 0) {
          // Auto-select when pasting a URL
          updateEntry(entryId, {
            selectedSpotify: results[0],
            spotifyConfirmed: true,
            showSpotifySearch: false,
            spotifySearching: false,
          });
        } else {
          updateEntry(entryId, {
            spotifySearchResults: results,
            spotifySearching: false,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        updateEntry(entryId, {
          spotifySearching: false,
          spotifyError: err.error || `Failed (${res.status})`,
        });
      }
    } catch {
      updateEntry(entryId, {
        spotifySearching: false,
        spotifyError: "Network error",
      });
    }
  }

  function selectSpotify(entryId: string, spotify: SpotifyResult) {
    updateEntry(entryId, {
      selectedSpotify: spotify,
      spotifyConfirmed: true,
      showSpotifySearch: false,
    });
  }

  function rejectSpotify(entryId: string) {
    updateEntry(entryId, {
      selectedSpotify: null,
      spotifyConfirmed: false,
      spotifyMatch: null,
      showSpotifySearch: true,
    });
  }

  async function submitAll() {
    const readyEntries = entries.filter(
      (e) => e.status === "ready" && e.youtube
    );
    if (readyEntries.length === 0) return;

    setSubmitting(true);
    const artists = readyEntries.map((e) => {
      const links: {
        platform: string;
        url: string;
        handle?: string | null;
        followerCount?: number;
        platformId?: string | null;
      }[] = [
        {
          platform: "YOUTUBE",
          url: e.youtube!.url,
          handle: e.youtube!.handle,
          followerCount: e.youtube!.subscriberCount,
          platformId: e.youtube!.platformId,
        },
      ];
      if (e.spotifyConfirmed && e.selectedSpotify) {
        links.push({
          platform: "SPOTIFY",
          url: e.selectedSpotify.url,
          handle: null,
          followerCount: e.selectedSpotify.followerCount,
          platformId: e.selectedSpotify.platformId,
        });
      }
      return {
        name: e.youtube!.name,
        imageUrl: e.youtube!.imageUrl,
        links,
      };
    });

    try {
      const res = await fetch("/api/artists/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artists }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        setEntries([]);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const readyCount = entries.filter(
    (e) => e.status === "ready" && e.youtube
  ).length;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-4xl mx-auto relative z-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[var(--muted-foreground)] hover:text-white text-sm mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to leaderboard
        </Link>

        <h1 className="text-3xl md:text-4xl font-black tracking-tighter mb-2 flex items-center gap-3">
          <Upload className="w-8 h-8 text-[var(--accent)]" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
            Bulk Import
          </span>
        </h1>
        <p className="text-[var(--muted-foreground)] mb-8">
          Paste YouTube links to auto-discover artist info and Spotify profiles.
        </p>

        {/* Result toast */}
        {result && (
          <div className="mb-6 bg-green-950/60 border border-green-800/50 rounded-2xl p-5">
            <p className="text-green-300 font-bold">
              {result.created} artist{result.created !== 1 ? "s" : ""} imported!
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2 text-sm text-red-300">
                {result.errors.map((e, i) => (
                  <p key={i}>
                    {e.name}: {e.error}
                  </p>
                ))}
              </div>
            )}
            <button
              onClick={() => setResult(null)}
              className="mt-3 text-xs text-[var(--muted-foreground)] hover:text-white"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6">
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => setShowYTSearch(!showYTSearch)}
              className="px-4 py-2 rounded-xl text-sm font-bold border border-[var(--muted)] hover:border-[var(--accent)] transition-all flex items-center gap-2"
            >
              <Search className="w-4 h-4" /> Search YouTube
            </button>
          </div>

          {/* YouTube search */}
          {showYTSearch && (
            <div className="mb-4 bg-[var(--muted)]/50 rounded-xl p-4">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
                <input
                  type="text"
                  value={ytSearchQuery}
                  onChange={(e) => searchYouTube(e.target.value)}
                  placeholder="Search YouTube channels..."
                  className="w-full bg-[var(--muted)] rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
                {ytSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-[var(--muted-foreground)]" />
                )}
              </div>
              {ytSearchResults.length > 0 && (
                <div className="flex flex-col gap-2">
                  {ytSearchResults.map((ch) => (
                    <button
                      key={ch.platformId}
                      onClick={() => addFromYTSearch(ch)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] hover:border-[var(--accent)] transition-all text-left"
                    >
                      {ch.imageUrl ? (
                        <img
                          src={ch.imageUrl}
                          alt={ch.name}
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[var(--muted)] shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-sm truncate">
                          {ch.name}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {ch.handle ? `@${ch.handle}` : ""}{" "}
                          {ch.subscriberCount > 0 &&
                            `${formatCount(ch.subscriberCount)} subs`}
                        </div>
                      </div>
                      <Plus className="w-5 h-5 text-[var(--accent)] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="text-xs font-bold uppercase text-[var(--muted-foreground)] block mb-2">
            Or paste YouTube URLs (one per line)
          </label>
          <textarea
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            rows={4}
            placeholder={
              "https://youtube.com/@example1\nhttps://youtube.com/@example2\nhttps://youtube.com/@example3"
            }
            className="w-full bg-[var(--muted)] rounded-lg px-4 py-3 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600 mb-3"
          />
          <button
            onClick={handleAddUrls}
            disabled={!urlInput.trim()}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <Search className="w-4 h-4" /> Look Up Channels
          </button>
        </div>

        {/* Entries */}
        {entries.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black">
                {entries.length} channel{entries.length !== 1 ? "s" : ""} queued
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setEntries([])}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 mb-8">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onRemove={() => removeEntry(entry.id)}
                  onConfirmSpotify={() =>
                    updateEntry(entry.id, { spotifyConfirmed: true })
                  }
                  onRejectSpotify={() => rejectSpotify(entry.id)}
                  onSelectSpotify={(s) => selectSpotify(entry.id, s)}
                  onToggleSearch={() =>
                    updateEntry(entry.id, {
                      showSpotifySearch: !entry.showSpotifySearch,
                    })
                  }
                  onSearchSpotify={(q) => searchSpotify(entry.id, q)}
                  onUpdateSearchQuery={(q) =>
                    updateEntry(entry.id, { spotifySearchQuery: q })
                  }
                />
              ))}
            </div>

            {/* Submit */}
            <div className="sticky bottom-4 bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 flex items-center justify-between shadow-2xl">
              <span className="text-sm text-[var(--muted-foreground)]">
                <strong className="text-white">{readyCount}</strong> artist
                {readyCount !== 1 ? "s" : ""} ready to import
              </span>
              <button
                onClick={submitAll}
                disabled={readyCount === 0 || submitting}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-40 flex items-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Import {readyCount} Artist{readyCount !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

/* ─── Entry Card ─── */
function EntryCard({
  entry,
  onRemove,
  onConfirmSpotify,
  onRejectSpotify,
  onSelectSpotify,
  onToggleSearch,
  onSearchSpotify,
  onUpdateSearchQuery,
}: {
  entry: ImportEntry;
  onRemove: () => void;
  onConfirmSpotify: () => void;
  onRejectSpotify: () => void;
  onSelectSpotify: (s: SpotifyResult) => void;
  onToggleSearch: () => void;
  onSearchSpotify: (q: string) => void;
  onUpdateSearchQuery: (q: string) => void;
}) {
  if (entry.status === "loading") {
    return (
      <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 flex items-center gap-4">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
        <span className="text-[var(--muted-foreground)] text-sm">
          Looking up channel...
        </span>
      </div>
    );
  }

  if (entry.status === "error") {
    return (
      <div className="bg-red-950/30 border border-red-800/40 rounded-2xl p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-300">{entry.error}</span>
        </div>
        <button onClick={onRemove} className="text-[var(--muted-foreground)] hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const yt = entry.youtube!;

  return (
    <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5">
      {/* YouTube row */}
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          {yt.imageUrl ? (
            <img
              src={yt.imageUrl}
              alt={yt.name}
              className="w-12 h-12 rounded-full object-cover shrink-0 border border-[var(--muted)]"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[var(--muted)] shrink-0" />
          )}
          <div className="min-w-0">
            <div className="font-bold truncate">{yt.name}</div>
            <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              {yt.handle ? `@${yt.handle}` : "YouTube"}
              {yt.subscriberCount > 0 && (
                <span className="tabular-nums">
                  {formatCount(yt.subscriberCount)} subs
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onRemove}
          className="text-[var(--muted-foreground)] hover:text-red-400 transition-colors shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Spotify section */}
      <div className="border-t border-[var(--muted)] pt-4">
        {entry.spotifyConfirmed && entry.selectedSpotify ? (
          /* Confirmed Spotify match */
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {entry.selectedSpotify.imageUrl ? (
                <img
                  src={entry.selectedSpotify.imageUrl}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-green-950/60 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-bold text-sm truncate flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
                  {entry.selectedSpotify.name}
                </div>
                <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                  {formatCount(entry.selectedSpotify.followerCount)} followers
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <span className="text-green-400 text-xs font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Linked
              </span>
              <button
                onClick={onRejectSpotify}
                className="text-xs text-[var(--muted-foreground)] hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-950/30 transition-colors"
              >
                Change
              </button>
            </div>
          </div>
        ) : entry.spotifyMatch && !entry.spotifyConfirmed ? (
          /* Found in description - confirm or reject */
          <div>
            <p className="text-xs text-green-400 font-bold mb-2 flex items-center gap-1">
              <Check className="w-3 h-3" /> Found Spotify in channel description
            </p>
            <div className="flex items-center justify-between gap-3 bg-green-950/20 border border-green-800/30 rounded-xl p-3">
              <div className="flex items-center gap-3 min-w-0">
                {entry.spotifyMatch.imageUrl ? (
                  <img
                    src={entry.spotifyMatch.imageUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-green-950/60 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">
                    {entry.spotifyMatch.name}
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                    {formatCount(entry.spotifyMatch.followerCount)} followers
                  </div>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={onConfirmSpotify}
                  className="p-2 rounded-lg bg-green-600 hover:bg-green-500 text-white transition-colors"
                  title="Confirm"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={onRejectSpotify}
                  className="p-2 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors"
                  title="Wrong match"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : !entry.spotifyConfirmed &&
          entry.spotifySuggestions.length > 0 &&
          !entry.showSpotifySearch ? (
          /* Spotify search results from name match */
          <div>
            <p className="text-xs text-yellow-300 font-bold mb-2">
              No Spotify link in description. Is one of these correct?
            </p>
            <div className="flex flex-col gap-2">
              {entry.spotifySuggestions.map((s) => (
                <button
                  key={s.platformId}
                  onClick={() => onSelectSpotify(s)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--muted)]/50 border border-[var(--muted)] hover:border-green-600 transition-all text-left"
                >
                  {s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-green-950/60 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm truncate">{s.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                      {formatCount(s.followerCount)} followers
                    </div>
                  </div>
                  <Check className="w-4 h-4 text-[var(--muted-foreground)] shrink-0" />
                </button>
              ))}
            </div>
            <button
              onClick={onToggleSearch}
              className="mt-2 text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              <Search className="w-3 h-3" /> None of these — search manually
            </button>
          </div>
        ) : (
          /* Manual Spotify search or no results */
          <div>
            {entry.spotifyError && !entry.spotifySearchResults.length && (
              <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />
                {entry.spotifyError}
              </p>
            )}
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-[var(--muted-foreground)] font-bold">
                {entry.showSpotifySearch
                  ? "Link Spotify"
                  : "No Spotify linked"}
              </p>
              {!entry.showSpotifySearch && (
                <button
                  onClick={onToggleSearch}
                  className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
                >
                  <Search className="w-3 h-3" /> Link Spotify
                </button>
              )}
            </div>
            {entry.showSpotifySearch && (
              <div>
                <a
                  href={`https://open.spotify.com/search/${encodeURIComponent(entry.spotifySearchQuery || entry.youtube?.name || "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mb-3 px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-bold transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Search on Spotify
                </a>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={entry.spotifySearchQuery}
                    onChange={(e) => onUpdateSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        onSearchSpotify(entry.spotifySearchQuery);
                    }}
                    placeholder="Paste Spotify artist URL here..."
                    className="flex-1 bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-600 placeholder:text-zinc-500"
                  />
                  <button
                    onClick={() => onSearchSpotify(entry.spotifySearchQuery)}
                    disabled={entry.spotifySearching}
                    className="px-3 py-2 rounded-lg bg-green-700 hover:bg-green-600 text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1"
                  >
                    {entry.spotifySearching ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
                {entry.spotifyError && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {entry.spotifyError}
                  </p>
                )}
                {entry.spotifySearchResults.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {entry.spotifySearchResults.map((s) => (
                      <button
                        key={s.platformId}
                        onClick={() => onSelectSpotify(s)}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-[var(--muted)]/30 hover:bg-[var(--muted)] border border-transparent hover:border-green-600 transition-all text-left"
                      >
                        {s.imageUrl ? (
                          <img
                            src={s.imageUrl}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-green-950/60 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold truncate">
                            {s.name}
                          </div>
                          <div className="text-[10px] text-[var(--muted-foreground)] tabular-nums">
                            {formatCount(s.followerCount)} followers
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={onToggleSearch}
                  className="mt-2 text-xs text-[var(--muted-foreground)] hover:text-white"
                >
                  Skip Spotify for this artist
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
