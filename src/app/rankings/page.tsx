"use client";
import React, { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
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
type ArtistMode = "popularity" | "hype";
type SongMode = "popularity" | "spotify" | "youtube" | "hype-pop" | "day" | "week" | "month";
type TrendDisplayMode = "current" | "relative" | "absolute";
type RankingModel = "standard" | "legal";

function getInitialArtistMode(rawMode: string | null, rankingModel: RankingModel): ArtistMode {
  if (rankingModel !== "legal") return "popularity";
  if (rawMode === "hype" || rawMode === "youtube") return "hype";
  return "popularity";
}

function getInitialSongMode(rawMode: string | null, rankingModel: RankingModel, preferHype = false): SongMode {
  if (rankingModel === "legal") {
    if (rawMode === "day" || rawMode === "week" || rawMode === "month") return rawMode;
    if (rawMode === "youtube" || rawMode === "hype-trend" || preferHype) return "week";
    return "hype-pop";
  }

  if (rawMode === "day" || rawMode === "week" || rawMode === "month") return rawMode;
  return "popularity";
}

const LEGAL_ARTIST_MODES: Array<{ key: ArtistMode; label: string }> = [
  { key: "popularity", label: "Popularity" },
  { key: "hype", label: "Hype" },
];

const LEGAL_SONG_MODES: Array<{ key: SongMode; label: string }> = [
  { key: "hype-pop", label: "Spotify Chart" },
  { key: "day", label: "24H" },
  { key: "week", label: "7D" },
  { key: "month", label: "30D" },
];

const SONG_TREND_DISPLAY_MODES: Array<{ key: Exclude<TrendDisplayMode, "current">; label: string }> = [
  { key: "relative", label: "% Change" },
  { key: "absolute", label: "Abs Change" },
];

const LEGAL_BUBBLE_DISPLAY_MODES: Array<{ key: Extract<TrendDisplayMode, "current" | "relative">; label: string }> = [
  { key: "current", label: "Current" },
  { key: "relative", label: "% Change" },
];

const PERIOD_LABELS: Record<string, string> = {
  day: "24H",
  week: "7D",
  month: "30D",
  year: "1Y",
};

const ALL_PERIODS = ["day", "week", "month", "year"];

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
  const initialSort = searchParams.get("sort");
  const hasHypeShortcut = searchParams.has("hype");
  const initialEntity = hasHypeShortcut ? "songs" : (searchParams.get("entity") as Entity) || "artists";
  const initialRankingModel: RankingModel = "legal";
  const initialViewMode = (searchParams.get("view") as ViewMode) || "list";

  // Read initial state from URL params
  const [entity, setEntity] = useState<Entity>(initialEntity);
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);
  const [platform, setPlatform] = useState(searchParams.get("platform") || "");
  const [artistMode, setArtistMode] = useState<ArtistMode>(getInitialArtistMode(searchParams.get("mode"), initialRankingModel));
  const [songMode, setSongMode] = useState<SongMode>(getInitialSongMode(searchParams.get("mode"), initialRankingModel, hasHypeShortcut));
  const [rankingModel] = useState<RankingModel>(initialRankingModel);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Bubble-specific
  const [metric] = useState(searchParams.get("metric") || "listeners");
  const initialBubbleMode = searchParams.get("bmode");
  const [bubbleMode, setBubbleMode] = useState<TrendDisplayMode>(
    initialBubbleMode === "relative" || initialBubbleMode === "absolute" || initialBubbleMode === "current"
      ? initialBubbleMode
      : "current"
  );
  const [period, setPeriod] = useState(searchParams.get("period") || "day");

  // Song options
  const [collapseVersions, setCollapseVersions] = useState(searchParams.get("grouped") !== "false");

  // Change sort order (artists, change mode)
  const [changeSortOrder, setChangeSortOrder] = useState<"desc" | "asc" | "abs">(
    initialSort === "asc" || initialSort === "abs" || initialSort === "desc" ? initialSort : "desc"
  );

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore from localStorage on first mount if no URL params present
  useEffect(() => {
    if (searchParams.toString()) return;
    try {
      const s = JSON.parse(localStorage.getItem("rankings:state") ?? "{}");
      if (s.entity) setEntity(s.entity as Entity);
      if (s.viewMode) setViewMode(s.viewMode as ViewMode);
      if ("platform" in s) setPlatform(s.platform);
      if (s.artistMode === "popularity" || s.artistMode === "hype") setArtistMode(s.artistMode);
      if (s.songMode) setSongMode(s.songMode as SongMode);
      if (s.bubbleMode === "relative" || s.bubbleMode === "absolute" || s.bubbleMode === "current") {
        setBubbleMode(s.bubbleMode);
      }
      if (s.period) setPeriod(s.period);
      if (typeof s.collapseVersions === "boolean") setCollapseVersions(s.collapseVersions);
      if (s.changeSortOrder === "asc" || s.changeSortOrder === "abs" || s.changeSortOrder === "desc") {
        setChangeSortOrder(s.changeSortOrder);
      }
    } catch { /**/ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  useEffect(() => {
    if (rankingModel === "legal") {
      if (platform) setPlatform("");
      if (entity === "songs") {
        if (songMode === "hype-pop" || songMode === "day" || songMode === "week" || songMode === "month") return;
        setSongMode("hype-pop");
      }
    }
  }, [rankingModel, entity, platform, songMode]);

  useEffect(() => {
    if (rankingModel === "legal") {
      if (viewMode !== "bubbles" && bubbleMode !== "current") {
        setBubbleMode("current");
        return;
      }
      if (viewMode === "bubbles" && bubbleMode === "absolute") {
        setBubbleMode("relative");
        return;
      }
      if (viewMode === "bubbles" && entity === "songs" && songMode === "hype-pop" && bubbleMode !== "current") {
        setBubbleMode("current");
      }
      return;
    }
    if (entity === "songs" && songMode === "popularity" && bubbleMode !== "current") {
      setBubbleMode("current");
      return;
    }
    if (entity === "songs" && songMode !== "popularity" && bubbleMode === "current") {
      setBubbleMode("absolute");
    }
  }, [entity, songMode, bubbleMode, rankingModel, viewMode]);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (entity !== "artists") params.set("entity", entity);
    if (viewMode !== "list") params.set("view", viewMode);
    if (rankingModel === "legal") params.set("model", "legal");
    if (viewMode === "list" && entity === "artists" && platform) params.set("platform", platform);
    if (entity === "artists" && rankingModel === "legal" && artistMode !== "popularity") params.set("mode", artistMode);
    if (entity === "songs") {
      if (rankingModel === "legal") {
        if (songMode !== "hype-pop") params.set("mode", songMode);
      } else if (songMode !== "popularity") {
        params.set("mode", songMode);
      }
    }
    if (!collapseVersions) params.set("grouped", "false");
    if (viewMode === "bubbles") {
      if (entity === "artists") {
        if (rankingModel === "standard" && metric !== "listeners") params.set("metric", metric);
        if (bubbleMode !== "current") params.set("bmode", bubbleMode);
        if (period !== "day") params.set("period", period);
        if (bubbleMode !== "current" && changeSortOrder !== "desc") params.set("sort", changeSortOrder);
      }
      if (entity === "songs") {
        if (bubbleMode !== "current") params.set("bmode", bubbleMode);
        if ((rankingModel === "legal" || songMode !== "popularity") && bubbleMode !== "current" && changeSortOrder !== "desc") params.set("sort", changeSortOrder);
      }
    }
    const qs = params.toString();
    const target = `/rankings${qs ? `?${qs}` : ""}`;
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== target) {
      router.replace(target, { scroll: false });
    }
    // Persist to localStorage
    try {
      localStorage.setItem("rankings:state", JSON.stringify({
        entity,
        viewMode,
        rankingModel,
        platform,
        artistMode,
        songMode,
        bubbleMode,
        period,
        collapseVersions,
        changeSortOrder,
      }));
    } catch { /**/ }
  }, [entity, viewMode, rankingModel, platform, artistMode, songMode, metric, bubbleMode, period, collapseVersions, changeSortOrder, router]);

  const isBubbles = viewMode === "bubbles";
  const isArtists = entity === "artists";
  const [artistListMounted, setArtistListMounted] = useState(entity === "artists" && viewMode === "list");
  const [songListMounted, setSongListMounted] = useState(entity === "songs" && viewMode === "list");
  const [artistBubblesMounted, setArtistBubblesMounted] = useState(entity === "artists" && viewMode === "bubbles");
  const [songBubblesMounted, setSongBubblesMounted] = useState(entity === "songs" && viewMode === "bubbles");

  useEffect(() => {
    if (viewMode === "list") {
      if (entity === "artists") setArtistListMounted(true);
      if (entity === "songs") setSongListMounted(true);
      return;
    }
    if (entity === "artists") setArtistBubblesMounted(true);
    if (entity === "songs") setSongBubblesMounted(true);
  }, [entity, viewMode]);

  return (
    <main className={`bg-[var(--background)] text-[var(--foreground)] font-sans flex flex-col ${isBubbles ? "h-full overflow-hidden" : "min-h-full"}`}>
      {/* Grid overlay (list only) */}
      {!isBubbles && (
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      )}

      {/* Filter header */}
      <div className="shrink-0 relative z-10 px-4 pt-3 pb-0 border-b border-[var(--muted)]">

        {/* Row 1: What you're viewing + Search */}
        <div className="flex items-center gap-2 pb-2.5">
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

          {/* Search — right side */}
          <div className="relative flex-1 min-w-[160px] ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={isBubbles ? (isArtists ? "Find artist..." : "Find song...") : (isArtists ? "Search artists..." : "Search songs...")}
              className="w-full bg-[var(--secondary)] border border-[var(--muted)] rounded-lg pl-9 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600"
            />
          </div>
        </div>

        {/* Row 2: Contextual filters */}
        <div className="flex items-center gap-2 pb-2.5 flex-wrap">
          {isArtists && rankingModel === "legal" && (
            <div className="flex gap-1">
              {LEGAL_ARTIST_MODES.map((m) => (
                <button key={m.key} onClick={() => setArtistMode(m.key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${artistMode === m.key ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-white border border-[var(--muted)]"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {rankingModel === "legal" && isBubbles && (isArtists || (!isArtists && songMode !== "hype-pop")) && (
            <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
              {LEGAL_BUBBLE_DISPLAY_MODES.map((m) => (
                <button key={m.key} onClick={() => setBubbleMode(m.key)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${bubbleMode === m.key ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {isArtists && rankingModel === "legal" && isBubbles && bubbleMode !== "current" && (
            <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
              {ALL_PERIODS.map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${period === p ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                  {PERIOD_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          )}

          {rankingModel === "legal" && isBubbles && bubbleMode !== "current" && (
            <>
              <div className="w-px h-5 bg-[var(--muted)]" />
              <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                {(["desc", "abs", "asc"] as const).map((o) => {
                  const label = o === "desc" ? "Gainers" : o === "asc" ? "Losers" : "Biggest";
                  return (
                    <button key={o} onClick={() => setChangeSortOrder(o)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${changeSortOrder === o ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Song modes */}
          {!isArtists && (
            <div className="flex gap-1">
              {LEGAL_SONG_MODES.map((m) => (
                <button key={m.key} onClick={() => setSongMode(m.key)} className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${songMode === m.key ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-white border border-[var(--muted)]"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Song bubble current/% change */}
          {!isArtists && rankingModel === "standard" && songMode !== "popularity" && (
            <>
              <div className="w-px h-5 bg-[var(--muted)]" />
              <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                {SONG_TREND_DISPLAY_MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setBubbleMode(m.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${bubbleMode === m.key ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Song sort order — bubble trends */}
          {!isArtists && rankingModel === "standard" && isBubbles && songMode !== "popularity" && bubbleMode !== "current" && (
            <>
              <div className="w-px h-5 bg-[var(--muted)]" />
              <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                {(["desc", "abs", "asc"] as const).map((o) => {
                  const label = o === "desc" ? "Gainers" : o === "asc" ? "Losers" : "Biggest";
                  return (
                    <button key={o} onClick={() => setChangeSortOrder(o)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${changeSortOrder === o ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Song sort order — list trends */}
          {!isArtists && rankingModel === "standard" && !isBubbles && songMode !== "popularity" && bubbleMode !== "current" && (
            <>
              <div className="w-px h-5 bg-[var(--muted)]" />
              <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                {(["desc", "abs", "asc"] as const).map((o) => {
                  const label = o === "desc" ? "Gainers" : o === "asc" ? "Losers" : "Biggest";
                  return (
                    <button key={o} onClick={() => setChangeSortOrder(o)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${changeSortOrder === o ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Group toggle — songs */}
          {!isArtists && (
            <button
              type="button"
              onClick={() => setCollapseVersions(c => !c)}
              aria-label={collapseVersions ? "Grouped song versions enabled" : "Grouped song versions disabled"}
              title="Group song versions together"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--muted)] bg-[var(--secondary)] transition-all text-[var(--muted-foreground)] hover:text-white"
            >
              <span>Group</span>
              <span className={`relative inline-flex h-[14px] w-[26px] items-center rounded-full transition-colors shrink-0 ${collapseVersions ? "bg-[var(--accent)]" : "bg-[var(--muted)]"}`}>
                <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${collapseVersions ? "translate-x-[13px]" : "translate-x-0.5"}`} />
              </span>
            </button>
          )}

          {rankingModel === "legal" && (
            <div className="px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              {isArtists
                ? artistMode === "popularity"
                  ? "Popularity uses internal catalog ordering. Numeric values stay hidden and only the rank order is shown."
                  : "Hype uses internal movement signals. Numeric values stay hidden and only the rank order is shown."
                : songMode === "hype-pop"
                  ? "Spotify Chart uses Spotify popularity only. Numeric scores stay hidden and only the rank order is shown."
                  : `${PERIOD_LABELS[songMode] ?? songMode} Hype favors fresh songs and fast growers; older catalog fades quickly.`}
            </div>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className={isBubbles ? "flex-1 min-h-0" : "hidden"}>
        {artistBubblesMounted && (
          <div className={isBubbles && isArtists ? "h-full" : "hidden"}>
            <BubbleView
              entity="artists"
              metric={metric}
              mode={bubbleMode}
              period={period}
              artistMode={artistMode}
              songMode={songMode}
              searchQuery={debouncedSearch}
              sortOrder={changeSortOrder}
              rankingModel={rankingModel}
              active={isBubbles && isArtists}
            />
          </div>
        )}
        {songBubblesMounted && (
          <div className={isBubbles && !isArtists ? "h-full" : "hidden"}>
            <BubbleView
              entity="songs"
              metric={metric}
              mode={bubbleMode}
              period={period}
              artistMode={artistMode}
              songMode={songMode}
              searchQuery={debouncedSearch}
              collapseVersions={collapseVersions}
              sortOrder={changeSortOrder}
              rankingModel={rankingModel}
              active={isBubbles && !isArtists}
            />
          </div>
        )}
      </div>

      <div className={isBubbles ? "hidden" : "flex-1 relative z-10"}>
        <div className="px-6 pb-12">
          {artistListMounted && (
            <div className={!isArtists ? "hidden" : ""}>
              <ArtistListView platform={platform} artistMode={artistMode} search={debouncedSearch} sortMode={bubbleMode} period={period} changeSortOrder={changeSortOrder} rankingModel={rankingModel} active={!isBubbles && isArtists} />
            </div>
          )}
          {songListMounted && (
            <div className={isArtists ? "hidden" : ""}>
              <SongListView mode={songMode} search={debouncedSearch} collapseVersions={collapseVersions} sortOrder={changeSortOrder} valueMode={bubbleMode === "relative" ? "relative" : "absolute"} rankingModel={rankingModel} active={!isBubbles && !isArtists} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
