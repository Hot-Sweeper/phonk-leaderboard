"use client";
import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Flame,
  Search,
  List,
  Circle,
  Users,
  Music,
} from "lucide-react";
import ArtistListView from "@/components/rankings/ArtistListView";
import SongListView from "@/components/rankings/SongListView";
import BubbleView from "@/components/rankings/BubbleView";

type Entity = "artists" | "songs";
type ViewMode = "list" | "bubbles";
type SongMode = "popularity" | "day" | "week" | "month";

const ARTIST_PLATFORMS = [
  { key: "", label: "Spotify Listeners" },
  { key: "YOUTUBE", label: "YouTube" },
  { key: "INSTAGRAM", label: "Instagram" },
  { key: "TIKTOK", label: "TikTok" },
];

const SONG_MODES: Array<{ key: SongMode; label: string }> = [
  { key: "popularity", label: "Pop" },
  { key: "day", label: "24H" },
  { key: "week", label: "7D" },
  { key: "month", label: "30D" },
];

const BUBBLE_METRICS = [
  { key: "listeners", label: "Listeners" },
  { key: "followers", label: "Followers" },
  { key: "youtube", label: "YouTube" },
  { key: "tiktok", label: "TikTok" },
  { key: "instagram", label: "Instagram" },
];

const BUBBLE_MODES = [
  { key: "change", label: "% Change" },
  { key: "current", label: "Current" },
];

const PERIOD_LABELS: Record<string, string> = {
  hour: "1H",
  day: "24H",
  week: "7D",
  month: "30D",
  year: "1Y",
};

const ALL_PERIODS = ["hour", "day", "week", "month", "year"];

export default function RankingsPage() {
  return (
    <Suspense>
      <RankingsInner />
    </Suspense>
  );
}

function RankingsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read initial state from URL params
  const [entity, setEntity] = useState<Entity>((searchParams.get("entity") as Entity) || "artists");
  const [viewMode, setViewMode] = useState<ViewMode>((searchParams.get("view") as ViewMode) || "list");
  const [platform, setPlatform] = useState(searchParams.get("platform") || "");
  const [songMode, setSongMode] = useState<SongMode>((searchParams.get("mode") as SongMode) || "popularity");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Bubble-specific
  const [metric, setMetric] = useState(searchParams.get("metric") || "listeners");
  const [bubbleMode, setBubbleMode] = useState(searchParams.get("bmode") || "change");
  const [period, setPeriod] = useState(searchParams.get("period") || "hour");

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (entity !== "artists") params.set("entity", entity);
    if (viewMode !== "list") params.set("view", viewMode);
    if (viewMode === "list" && entity === "artists" && platform) params.set("platform", platform);
    if (entity === "songs" && songMode !== "popularity") params.set("mode", songMode);
    if (viewMode === "bubbles") {
      if (entity === "artists") {
        if (metric !== "listeners") params.set("metric", metric);
        if (bubbleMode !== "change") params.set("bmode", bubbleMode);
        if (period !== "hour") params.set("period", period);
      }
    }
    const qs = params.toString();
    const target = `/rankings${qs ? `?${qs}` : ""}`;
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== target) {
      router.replace(target, { scroll: false });
    }
  }, [entity, viewMode, platform, songMode, metric, bubbleMode, period, router]);

  const isBubbles = viewMode === "bubbles";
  const isArtists = entity === "artists";

  return (
    <main className={`bg-[var(--background)] text-[var(--foreground)] font-sans flex flex-col ${isBubbles ? "h-[calc(100vh-3.5rem)] overflow-hidden" : "min-h-screen"}`}>
      {/* Grid overlay (list only) */}
      {!isBubbles && (
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      )}

      {/* Unified header + filter bar */}
      <div className={`shrink-0 relative z-10 ${isBubbles ? "px-4 pt-3 pb-2" : "px-4 pt-8 md:pt-12 pb-0"}`}>
        <div className={isBubbles ? "max-w-[1400px] mx-auto" : "max-w-5xl mx-auto"}>
          {/* Title */}
          <div className={isBubbles ? "mb-2" : "mb-6"}>
            <h1 className={`font-black tracking-tighter flex items-center gap-3 ${isBubbles ? "text-2xl" : "text-3xl md:text-5xl"}`}>
              <Flame className={`text-[var(--accent)] ${isBubbles ? "w-7 h-7" : "w-9 h-9 md:w-12 md:h-12"}`} />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
                Phonk Rankings
              </span>
            </h1>
          </div>

          {/* Filter bar */}
          <div className={`flex items-center gap-2 flex-wrap ${isBubbles ? "" : "mb-8"}`}>
            {/* Entity toggle */}
            <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
              <button onClick={() => setEntity("artists")} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${isArtists ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                <Users className="w-3.5 h-3.5" /> Artists
              </button>
              <button onClick={() => setEntity("songs")} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${!isArtists ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                <Music className="w-3.5 h-3.5" /> Songs
              </button>
            </div>

            {/* View mode toggle */}
            <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
              <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${!isBubbles ? "bg-white/10 text-white" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                <List className="w-3.5 h-3.5" /> List
              </button>
              <button onClick={() => setViewMode("bubbles")} className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 transition-all ${isBubbles ? "bg-white/10 text-white" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                <Circle className="w-3.5 h-3.5" /> Bubbles
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-[var(--muted)] hidden sm:block" />

            {/* Context filters */}
            {!isBubbles && isArtists && (
              <div className="flex gap-1 overflow-x-auto">
                {ARTIST_PLATFORMS.map((p) => (
                  <button key={p.key} onClick={() => setPlatform(p.key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${platform === p.key ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-white border border-[var(--muted)]"}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            )}

            {!isBubbles && !isArtists && (
              <div className="flex gap-1">
                {SONG_MODES.map((m) => (
                  <button key={m.key} onClick={() => setSongMode(m.key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${songMode === m.key ? "border-green-500/50 bg-green-500/15 text-green-300 border" : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-white border border-[var(--muted)]"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {isBubbles && isArtists && (
              <>
                <select value={metric} onChange={(e) => setMetric(e.target.value)} className="bg-[var(--secondary)] border border-[var(--muted)] rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent)] text-white">
                  {BUBBLE_METRICS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select>

                <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                  {BUBBLE_MODES.map((m) => (
                    <button key={m.key} onClick={() => setBubbleMode(m.key)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${bubbleMode === m.key ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                      {m.label}
                    </button>
                  ))}
                </div>

                {bubbleMode === "change" && (
                  <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                    {ALL_PERIODS.map((p) => (
                      <button key={p} onClick={() => setPeriod(p)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${period === p ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                        {PERIOD_LABELS[p] ?? p}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {isBubbles && !isArtists && (
              <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                {SONG_MODES.map((m) => (
                  <button key={m.key} onClick={() => setSongMode(m.key)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${songMode === m.key ? "bg-green-500/80 text-white" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            {/* Search (list mode only) */}
            {!isBubbles && (
              <>
                <div className="w-px h-6 bg-[var(--muted)] hidden sm:block" />
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={isArtists ? "Search artists..." : "Search songs..."}
                    className="w-full bg-[var(--secondary)] border border-[var(--muted)] rounded-lg pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Content area */}
      {isBubbles ? (
        <div className="flex-1 min-h-0">
          <BubbleView
            entity={entity}
            metric={metric}
            mode={bubbleMode}
            period={period}
            songMode={songMode}
          />
        </div>
      ) : (
        <div className="flex-1 relative z-10">
          <div className="max-w-5xl mx-auto px-4 pb-12">
            {isArtists ? (
              <ArtistListView platform={platform} search={debouncedSearch} />
            ) : (
              <SongListView mode={songMode} search={debouncedSearch} />
            )}
          </div>
        </div>
      )}
    </main>
  );
}
