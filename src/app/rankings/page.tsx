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
import { SpotifyIcon, YouTubeIcon, InstagramIcon, TikTokIcon } from "@/components/platform-icons";

type Entity = "artists" | "songs";
type ViewMode = "list" | "bubbles";
type SongMode = "popularity" | "day" | "week" | "month";
type TrendDisplayMode = "current" | "relative" | "absolute";
type RankingModel = "standard" | "legal";

const ARTIST_PLATFORMS: Array<{ key: string; Icon: React.FC<{ className?: string; style?: React.CSSProperties }>; color: string; label: string }> = [
  { key: "",          Icon: SpotifyIcon,   color: "#1DB954", label: "Spotify Listeners" },
  { key: "YOUTUBE",   Icon: YouTubeIcon,   color: "#FF0000", label: "YouTube" },
  { key: "INSTAGRAM", Icon: InstagramIcon, color: "#E4405F", label: "Instagram" },
  { key: "TIKTOK",    Icon: TikTokIcon,    color: "#00f2ea", label: "TikTok" },
];

const SONG_MODES: Array<{ key: SongMode; label: string }> = [
  { key: "popularity", label: "Pop" },
  { key: "day", label: "24H" },
  { key: "week", label: "7D" },
  { key: "month", label: "30D" },
];

const LEGAL_SONG_MODES: Array<{ key: SongMode; label: string }> = [
  { key: "popularity", label: "Audience" },
  { key: "day", label: "24H" },
];

const TREND_DISPLAY_MODES: Array<{ key: TrendDisplayMode; label: string }> = [
  { key: "relative", label: "% Change" },
  { key: "absolute", label: "Abs Change" },
  { key: "current", label: "Current" },
];

const SONG_TREND_DISPLAY_MODES: Array<{ key: Exclude<TrendDisplayMode, "current">; label: string }> = [
  { key: "relative", label: "% Change" },
  { key: "absolute", label: "Abs Change" },
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

  // Read initial state from URL params
  const [entity, setEntity] = useState<Entity>((searchParams.get("entity") as Entity) || "artists");
  const [viewMode, setViewMode] = useState<ViewMode>((searchParams.get("view") as ViewMode) || "list");
  const [platform, setPlatform] = useState(searchParams.get("platform") || "");
  const [songMode, setSongMode] = useState<SongMode>((searchParams.get("mode") as SongMode) || "popularity");
  const [rankingModel, setRankingModel] = useState<RankingModel>(searchParams.get("model") === "legal" ? "legal" : "standard");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Bubble-specific
  const [metric, setMetric] = useState(searchParams.get("metric") || "listeners");
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
      if (s.songMode) setSongMode(s.songMode as SongMode);
      if (s.rankingModel === "legal" || s.rankingModel === "standard") setRankingModel(s.rankingModel);
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
      if (bubbleMode !== "current") setBubbleMode("current");
      if (entity === "songs" && songMode !== "popularity" && songMode !== "day") {
        setSongMode("day");
      }
    }
  }, [rankingModel, entity, platform, bubbleMode, songMode]);

  useEffect(() => {
    if (rankingModel === "legal") {
      if (entity === "songs" && bubbleMode !== "current") {
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
  }, [entity, songMode, bubbleMode, rankingModel]);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (entity !== "artists") params.set("entity", entity);
    if (viewMode !== "list") params.set("view", viewMode);
    if (rankingModel === "legal") params.set("model", "legal");
    if (viewMode === "list" && entity === "artists" && platform) params.set("platform", platform);
    if (entity === "songs" && songMode !== "popularity") params.set("mode", songMode);
    if (!collapseVersions) params.set("grouped", "false");
    if (viewMode === "bubbles") {
      if (entity === "artists") {
        if (metric !== "listeners") params.set("metric", metric);
        if (bubbleMode !== "current") params.set("bmode", bubbleMode);
        if (period !== "day") params.set("period", period);
        if (bubbleMode !== "current" && changeSortOrder !== "desc") params.set("sort", changeSortOrder);
      }
      if (entity === "songs") {
        if (bubbleMode !== "current") params.set("bmode", bubbleMode);
        if (songMode !== "popularity" && bubbleMode !== "current" && changeSortOrder !== "desc") params.set("sort", changeSortOrder);
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
        songMode,
        bubbleMode,
        period,
        collapseVersions,
        changeSortOrder,
      }));
    } catch { /**/ }
  }, [entity, viewMode, rankingModel, platform, songMode, metric, bubbleMode, period, collapseVersions, changeSortOrder, router]);

  const isBubbles = viewMode === "bubbles";
  const isArtists = entity === "artists";
  const [artistListMounted, setArtistListMounted] = useState(true);
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

          <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
            <button onClick={() => setRankingModel("standard")} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${rankingModel === "standard" ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
              Standard
            </button>
            <button onClick={() => setRankingModel("legal")} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${rankingModel === "legal" ? "bg-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.45)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
              Legal Mode
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

          {/* Platform icons — artists */}
          {isArtists && rankingModel === "standard" && (
            <div className="flex gap-1">
              {ARTIST_PLATFORMS.map((p) => {
                const platformMetricMap: Record<string, string> = { "": "listeners", YOUTUBE: "youtube", TIKTOK: "tiktok", INSTAGRAM: "instagram" };
                const active = isBubbles ? metric === platformMetricMap[p.key] : platform === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => { setPlatform(p.key); if (isBubbles) setMetric(platformMetricMap[p.key]); }}
                    title={p.label}
                    aria-label={p.label}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all border ${active ? "border-white/30 bg-white/10" : "border-[var(--muted)] bg-[var(--secondary)] hover:bg-white/10"}`}
                  >
                    <p.Icon className="w-3.5 h-3.5" style={{ color: active ? p.color : undefined }} />
                  </button>
                );
              })}
            </div>
          )}

          {/* Divider */}
          {isArtists && rankingModel === "standard" && <div className="w-px h-5 bg-[var(--muted)]" />}

          {/* Change/Current toggle — artists */}
          {isArtists && rankingModel === "standard" && (
            <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
              {TREND_DISPLAY_MODES.map((m) => (
                <button key={m.key} onClick={() => setBubbleMode(m.key)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${bubbleMode === m.key ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Period — artists change mode */}
          {isArtists && rankingModel === "standard" && bubbleMode !== "current" && (
            <div className="flex gap-0.5 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
              {ALL_PERIODS.map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${period === p ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>
                  {PERIOD_LABELS[p] ?? p}
                </button>
              ))}
            </div>
          )}

          {/* Sort order — artists change mode */}
          {isArtists && rankingModel === "standard" && bubbleMode !== "current" && (
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
              {(rankingModel === "legal" ? LEGAL_SONG_MODES : SONG_MODES).map((m) => (
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
                ? "Audience Score is driven mostly by stored song strength, with YouTube and internal signals only acting as light tie-breakers."
                : songMode === "popularity"
                  ? "Legal Audience ranks songs by stored track strength only."
                  : "Legal 24H Hype ranks songs by stored change over time, rewards early breakouts, and decays hype as songs age."}
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
              songMode={songMode}
              searchQuery={debouncedSearch}
              sortOrder={changeSortOrder}
              rankingModel={rankingModel}
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
              songMode={songMode}
              searchQuery={debouncedSearch}
              collapseVersions={collapseVersions}
              sortOrder={changeSortOrder}
              rankingModel={rankingModel}
            />
          </div>
        )}
      </div>

      <div className={isBubbles ? "hidden" : "flex-1 relative z-10"}>
        <div className="px-6 pb-12">
          {artistListMounted && (
            <div className={!isArtists ? "hidden" : ""}>
              <ArtistListView platform={platform} search={debouncedSearch} sortMode={bubbleMode} period={period} changeSortOrder={changeSortOrder} rankingModel={rankingModel} />
            </div>
          )}
          {songListMounted && (
            <div className={isArtists ? "hidden" : ""}>
              <SongListView mode={songMode} search={debouncedSearch} collapseVersions={collapseVersions} sortOrder={changeSortOrder} valueMode={bubbleMode === "relative" ? "relative" : "absolute"} rankingModel={rankingModel} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
