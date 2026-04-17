"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { fetchJsonWithSessionCache } from "@/lib/client-cache";
import { useDetailPanel } from "@/lib/detail-panel";

type BubbleItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  value: number;
  changeValue: number;
  changePercent: number;
  hasData: boolean;
  rank: number;
  isWatchlisted: boolean;
};

type Bubble = BubbleItem & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  targetR: number;
  imgLoaded: boolean;
  img: HTMLImageElement | null;
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const PAGE_SIZE = 100;
const SONG_BUBBLE_CACHE_VERSION = "v4";

const ARTIST_METRICS = [
  { key: "listeners", label: "Monthly Listeners" },
  { key: "followers", label: "Spotify Followers" },
  { key: "youtube", label: "YouTube Subs" },
  { key: "tiktok", label: "TikTok Followers" },
  { key: "instagram", label: "Instagram Followers" },
];

interface BubbleViewProps {
  entity: "artists" | "songs";
  metric: string;
  mode: "current" | "relative" | "absolute";
  period: string;
  songMode?: string;
  searchQuery?: string;
  collapseVersions?: boolean;
  sortOrder?: "desc" | "abs" | "asc";
  rankingModel?: "standard" | "legal";
}

export default function BubbleView({ entity, metric, mode, period, songMode, searchQuery, collapseVersions = true, sortOrder = "desc", rankingModel = "standard" }: BubbleViewProps) {
  const { openArtist, openSong } = useDetailPanel();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRef = useRef<Bubble | null>(null);
  const dragRef = useRef<{ bubble: Bubble; offsetX: number; offsetY: number } | null>(null);

  const [items, setItems] = useState<BubbleItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Bubble | null>(null);
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [searchStatus, setSearchStatus] = useState<"not-found" | null>(null);
  const searchMatchIdsRef = useRef<Set<string>>(new Set());

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Search query: highlight matching bubbles and auto-jump to correct page
  useEffect(() => {
    if (!searchQuery?.trim()) {
      searchMatchIdsRef.current = new Set();
      setSearchStatus(null);
      return;
    }
    const q = searchQuery.toLowerCase().trim();

    // Check currently loaded items first
    const matches = items.filter(item => item.name.toLowerCase().includes(q));
    if (matches.length > 0) {
      searchMatchIdsRef.current = new Set(matches.map(m => m.id));
      setSearchStatus(null);
      return;
    }

    // Not on current page — search across pages
    searchMatchIdsRef.current = new Set();
    setSearchStatus(null);

    if (entity === "songs") {
      const sMode = songMode || "popularity";
      const params = new URLSearchParams({
        search: q,
        skip: "0",
        take: "1",
        mode: sMode,
        collapseVersions: collapseVersions ? "true" : "false",
        sort: sortOrder,
        valueMode: mode === "relative" ? "relative" : "absolute",
      });
      if (rankingModel === "legal") params.set("rankingModel", "legal");
      fetch(`/api/songs?${params.toString()}`)
        .then(r => r.json())
        .then((data: { tracks?: Array<{ rank?: number }> }) => {
          const track = data.tracks?.[0];
          if (track?.rank != null) {
            const targetPage = Math.floor((track.rank - 1) / PAGE_SIZE);
            if (targetPage !== page) setPage(targetPage);
          } else {
            setSearchStatus("not-found");
          }
        })
        .catch(() => { setSearchStatus("not-found"); });
    } else {
      // Artists: scan pages sequentially up to 5
      const scan = async () => {
        for (let p = 0; p < Math.min(totalPages, 5); p++) {
          if (p === page) continue;
          const skip = p * PAGE_SIZE;
          const params = new URLSearchParams({
            period,
            metric: rankingModel === "legal" ? "audience" : metric,
            mode,
            sort: sortOrder,
            skip: String(skip),
            take: String(PAGE_SIZE),
          });
          if (rankingModel === "legal") params.set("rankingModel", "legal");
          const url = `/api/artists/changes?${params.toString()}`;
          const data = await fetch(url).then(r => r.json()).catch(() => null);
          if (!data) continue;
          const artists: Array<{ name: string }> = data.artists ?? [];
          if (artists.some(a => a.name.toLowerCase().includes(q))) {
            setPage(p);
            return;
          }
        }
        setSearchStatus("not-found");
      };
      scan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, items]);

  // Load watchlist
  useEffect(() => {
    if (entity !== "artists") return;
    const loadWatchlist = () => {
      fetchJsonWithSessionCache<string[]>("watchlist:ids", "/api/watchlist", 30_000)
        .then((ids) => setWatchlist(new Set(ids)))
        .catch(() => {});
    };
    loadWatchlist();
    window.addEventListener("watchlist-changed", loadWatchlist);
    return () => window.removeEventListener("watchlist-changed", loadWatchlist);
  }, [entity]);

  // Fetch data
  useEffect(() => {
    setLoading(true);
    const skip = page * PAGE_SIZE;

    if (entity === "artists") {
      const params = new URLSearchParams({
        period,
        metric: rankingModel === "legal" ? "audience" : metric,
        mode,
        sort: sortOrder,
        skip: String(skip),
        take: String(PAGE_SIZE),
      });
      if (rankingModel === "legal") params.set("rankingModel", "legal");
      const url = `/api/artists/changes?${params.toString()}`;
      fetchJsonWithSessionCache<{ artists?: Array<{ id: string; name: string; imageUrl: string | null; currentValue: number; changeValue: number; changePercent: number; hasData: boolean }>; totalCount?: number }>(
        `rank:bubbles:artists:${period}:${metric}:${mode}:${sortOrder}:${skip}`,
        url,
        45_000
      )
        .then((data) => {
          const artists = (data.artists ?? []).map((a: { id: string; name: string; imageUrl: string | null; currentValue: number; changeValue: number; changePercent: number; hasData: boolean }, idx: number) => ({
            id: a.id,
            name: a.name,
            imageUrl: a.imageUrl,
            value: a.currentValue,
            changeValue: a.changeValue,
            changePercent: a.changePercent,
            hasData: a.hasData,
            rank: skip + idx + 1,
            isWatchlisted: false,
          }));
          setItems(artists);
          setTotalCount(data.totalCount ?? 0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      // Songs bubble mode
      const sMode = songMode || "popularity";
      const params = new URLSearchParams({
        skip: String(skip),
        take: String(PAGE_SIZE),
        mode: sMode,
        collapseVersions: collapseVersions ? "true" : "false",
        sort: sortOrder,
        valueMode: mode === "relative" ? "relative" : "absolute",
      });
      if (rankingModel === "legal") params.set("rankingModel", "legal");
      const url = `/api/songs?${params.toString()}`;
      fetchJsonWithSessionCache<{ tracks?: Array<{ id: string; name: string; albumImageUrl: string | null; popularity: number; metricValue: number; trendPercent: number; hasTrendData: boolean; audienceScore?: number }>; totalCount?: number }>(
        `rank:bubbles:songs:${SONG_BUBBLE_CACHE_VERSION}:${rankingModel}:${sMode}:${mode}:${sortOrder}:${collapseVersions}:${skip}`,
        url,
        45_000
      )
        .then((data) => {
          const tracks = (data.tracks ?? []).map((t: { id: string; name: string; albumImageUrl: string | null; popularity: number; metricValue: number; trendPercent: number; hasTrendData: boolean; audienceScore?: number }, idx: number) => ({
            id: t.id,
            name: t.name,
            imageUrl: t.albumImageUrl,
            value: rankingModel === "legal"
              ? (sMode === "popularity" ? (t.audienceScore ?? t.metricValue) : t.metricValue)
              : (sMode === "popularity" ? t.popularity : Math.abs(mode === "relative" ? t.trendPercent : t.metricValue)),
            changeValue: t.metricValue,
            changePercent: t.trendPercent,
            hasData: t.hasTrendData,
            rank: skip + idx + 1,
            isWatchlisted: false,
          }));
          setItems(tracks);
          setTotalCount(data.totalCount ?? 0);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [entity, page, period, metric, mode, songMode, collapseVersions, sortOrder, rankingModel]);

  // Build bubbles from items
  useEffect(() => {
    if (items.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const canvasArea = w * h;

    const isCurrentMode = mode === "current" || (entity === "songs" && songMode === "popularity");
    const isRelativeMode = mode === "relative";
    const sizeValues = items.map((a) => isCurrentMode ? a.value : Math.abs(isRelativeMode ? a.changePercent : a.changeValue));
    const maxVal = Math.max(0.01, ...sizeValues);

    const fillRatio = 0.55;
    const normalizedSum = sizeValues.reduce((s, v) => s + v / maxVal, 0);
    const scale = Math.sqrt((fillRatio * canvasArea) / (Math.PI * Math.max(0.01, normalizedSum)));

    const minR = Math.max(12, Math.min(w, h) * 0.015);
    const maxR = Math.min(w, h) * 0.4;

    const newBubbles: Bubble[] = items.map((item) => {
      const sizeVal = isCurrentMode ? item.value : Math.abs(isRelativeMode ? item.changePercent : item.changeValue);
      const rawR = scale * Math.sqrt(sizeVal / maxVal);
      const targetR = Math.max(minR, Math.min(maxR, rawR));

      let img: HTMLImageElement | null = null;
      const imgLoaded = false;
      if (item.imageUrl) {
        img = new window.Image();
        img.crossOrigin = "anonymous";
        const imgSize = targetR > 60 ? 256 : 128;
        img.src = `/_next/image?url=${encodeURIComponent(item.imageUrl)}&w=${imgSize}&q=75`;
        img.onload = () => {
          const b = bubblesRef.current.find((b) => b.id === item.id);
          if (b) b.imgLoaded = true;
        };
      }

      return {
        ...item,
        isWatchlisted: watchlist.has(item.id),
        x: minR + Math.random() * (w - 2 * minR),
        y: minR + Math.random() * (h - 2 * minR),
        vx: 0,
        vy: 0,
        r: 0,
        targetR,
        imgLoaded,
        img,
      };
    });

    bubblesRef.current = newBubbles;
  }, [items, mode, watchlist, entity, songMode]);

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    }
    resize();
    window.addEventListener("resize", resize);

    function tick() {
      if (!canvas || !ctx) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const bubbles = bubblesRef.current;
      const drag = dragRef.current;

      for (const b of bubbles) b.r += (b.targetR - b.r) * 0.08;

      // Physics
      for (let i = 0; i < bubbles.length; i++) {
        const a = bubbles[i];
        if (drag && a === drag.bubble) continue;
        for (let j = i + 1; j < bubbles.length; j++) {
          const b = bubbles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const desiredDist = a.r + b.r + 3;
          if (dist < desiredDist && dist > 0.1) {
            const overlap = desiredDist - dist;
            const force = overlap / dist * 0.25;
            const nx = dx * force;
            const ny = dy * force;
            if (!(drag && a === drag.bubble)) { a.vx -= nx; a.vy -= ny; }
            if (!(drag && b === drag.bubble)) { b.vx += nx; b.vy += ny; }
          }
        }
      }

      for (const b of bubbles) {
        if (drag && b === drag.bubble) continue;
        const pad = b.r + 1;
        if (b.x < pad) b.vx += (pad - b.x) * 0.2;
        if (b.x > w - pad) b.vx += (w - pad - b.x) * 0.2;
        if (b.y < pad) b.vy += (pad - b.y) * 0.2;
        if (b.y > h - pad) b.vy += (h - pad - b.y) * 0.2;
        b.vx *= 0.88;
        b.vy *= 0.88;
        b.x += b.vx;
        b.y += b.vy;
        b.x = Math.max(b.r, Math.min(w - b.r, b.x));
        b.y = Math.max(b.r, Math.min(h - b.r, b.y));
      }

      // Hover detection
      const mouse = mouseRef.current;
      let newHovered: Bubble | null = null;
      if (mouse && !drag) {
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          const dx = mouse.x - b.x;
          const dy = mouse.y - b.y;
          if (dx * dx + dy * dy < b.r * b.r) { newHovered = b; break; }
        }
      }
      if (newHovered !== hoveredRef.current) {
        hoveredRef.current = newHovered;
        setHovered(newHovered);
      }

      const sorted = [...bubbles].sort((a, b) => b.r - a.r);

      // Draw
      for (const b of sorted) {
        const isHov = b === newHovered || (drag && b === drag.bubble);
        const drawR = isHov ? b.r * 1.06 : b.r;
        const maxBubbleR = Math.max(1, ...bubbles.map((bb) => bb.targetR));
        const sizeRatio = Math.min(1, b.targetR / maxBubbleR);
        const saturation = 0.3 + sizeRatio * 0.7;

        const isPodium = b.rank >= 1 && b.rank <= 3;
        const isTrendMode = mode !== "current" && b.hasData;
        const displayChange = mode === "relative" ? b.changePercent : b.changeValue;
        const isPositive = displayChange >= 0;

        const podiumColors: Record<number, { r: number; g: number; b: number }> = {
          1: { r: 255, g: 215, b: 0 },
          2: { r: 192, g: 192, b: 192 },
          3: { r: 205, g: 127, b: 50 },
        };

        let borderColor: string;
        let glowColor: string;
        let overlayColor: string;

        if (isPodium) {
          const pc = podiumColors[b.rank];
          borderColor = `rgba(${pc.r}, ${pc.g}, ${pc.b}, ${0.6 + saturation * 0.4})`;
          glowColor = `rgba(${pc.r}, ${pc.g}, ${pc.b}, ${0.3 + saturation * 0.4})`;
          overlayColor = `rgba(${Math.floor(pc.r * 0.15)}, ${Math.floor(pc.g * 0.15)}, ${Math.floor(pc.b * 0.1)}, ${0.45 + saturation * 0.15})`;
        } else if (isTrendMode) {
          const alpha = 0.3 + saturation * 0.5;
          const intensity = Math.min(1, Math.abs(displayChange) / (mode === "relative" ? 20 : Math.max(1, Math.abs(displayChange))));
          if (isPositive) {
            borderColor = `rgba(34, 197, 94, ${alpha + intensity * 0.2})`;
            glowColor = `rgba(34, 197, 94, ${0.15 + saturation * 0.3})`;
            overlayColor = `rgba(0, 40, 0, ${0.4 + saturation * 0.25})`;
          } else {
            borderColor = `rgba(239, 68, 68, ${alpha + intensity * 0.2})`;
            glowColor = `rgba(239, 68, 68, ${0.15 + saturation * 0.3})`;
            overlayColor = `rgba(40, 0, 0, ${0.4 + saturation * 0.25})`;
          }
        } else {
          borderColor = `rgba(168, 85, 247, ${0.3 + saturation * 0.4})`;
          glowColor = `rgba(168, 85, 247, ${0.2 + saturation * 0.3})`;
          overlayColor = `rgba(20, 0, 40, ${0.45 + saturation * 0.15})`;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);

        if (b.img && b.imgLoaded) {
          ctx.save();
          ctx.clip();
          ctx.drawImage(b.img, b.x - drawR, b.y - drawR, drawR * 2, drawR * 2);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
          ctx.fillStyle = overlayColor;
          ctx.fill();
        } else {
          const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, drawR);
          if (isPodium) {
            const pc = podiumColors[b.rank];
            grad.addColorStop(0, `rgba(${pc.r}, ${pc.g}, ${pc.b}, ${0.3 + saturation * 0.3})`);
            grad.addColorStop(1, `rgba(${Math.floor(pc.r * 0.3)}, ${Math.floor(pc.g * 0.3)}, ${Math.floor(pc.b * 0.3)}, ${0.5 + saturation * 0.3})`);
          } else if (isTrendMode) {
            if (isPositive) {
              grad.addColorStop(0, `rgba(34, 197, 94, ${0.3 + saturation * 0.3})`);
              grad.addColorStop(1, `rgba(20, 83, 45, ${0.5 + saturation * 0.3})`);
            } else {
              grad.addColorStop(0, `rgba(239, 68, 68, ${0.3 + saturation * 0.3})`);
              grad.addColorStop(1, `rgba(127, 29, 29, ${0.5 + saturation * 0.3})`);
            }
          } else {
            grad.addColorStop(0, `rgba(168, 85, 247, ${0.3 + saturation * 0.2})`);
            grad.addColorStop(1, `rgba(88, 28, 135, ${0.5 + saturation * 0.2})`);
          }
          ctx.fillStyle = grad;
          ctx.fill();
        }

        if (b.isWatchlisted) {
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawR + 3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(236, 72, 153, ${0.6 + saturation * 0.3})`;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isPodium ? (isHov ? 3.5 : 2.5) : (isHov ? 2.5 : 1.5);
        ctx.stroke();

        if (isHov || isPodium) {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = isPodium ? 15 + saturation * 15 : 20;
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        if (drawR > 14) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const fontSize = Math.max(7, Math.min(22, drawR * 0.32));
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.fillStyle = "#fff";
          const maxNameW = drawR * 1.6;
          let displayName = b.name;
          while (ctx.measureText(displayName).width > maxNameW && displayName.length > 3) displayName = displayName.slice(0, -1);
          if (displayName !== b.name) displayName += "\u2026";
          ctx.fillText(displayName, b.x, b.y - fontSize * 0.6);

          const smallSize = Math.max(6, fontSize * 0.75);
          ctx.font = `bold ${smallSize}px sans-serif`;
          if (isTrendMode) {
            const changeText = mode === "relative"
              ? `${b.changePercent >= 0 ? "+" : ""}${b.changePercent.toFixed(1)}%`
              : `${b.changeValue > 0 ? "+" : b.changeValue < 0 ? "-" : ""}${formatCount(Math.abs(b.changeValue))}`;
            ctx.fillStyle = isPositive ? "#4ade80" : "#f87171";
            ctx.fillText(changeText, b.x, b.y + fontSize * 0.5);
          } else {
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fillText(formatCount(b.value), b.x, b.y + fontSize * 0.5);
          }
        }

        ctx.restore();
      }

      // === Search match pulse rings ===
      const sMatchIds = searchMatchIdsRef.current;
      if (sMatchIds.size > 0) {
        const pulse = Math.sin(Date.now() * 0.006) * 0.5 + 0.5;
        for (const b of bubbles) {
          if (!sMatchIds.has(b.id)) continue;
          // Outer glow ring
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 5 + pulse * 8, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(192, 38, 211, ${0.45 + pulse * 0.55})`;
          ctx.lineWidth = 2;
          ctx.shadowColor = "rgba(192, 38, 211, 0.9)";
          ctx.shadowBlur = 10 + pulse * 20;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();
          // Inner shimmer ring
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 2 + pulse * 3, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + pulse * 0.3})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [items, mode]);

  // Mouse handlers
  const getCanvasPos = useCallback((e: React.MouseEvent | MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    if (!pos) return;
    mouseRef.current = pos;
    const drag = dragRef.current;
    if (drag) {
      drag.bubble.x = pos.x - drag.offsetX;
      drag.bubble.y = pos.y - drag.offsetY;
      drag.bubble.vx = 0;
      drag.bubble.vy = 0;
    }
  }, [getCanvasPos]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPos(e);
    if (!pos) return;
    const bubbles = bubblesRef.current;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      if (dx * dx + dy * dy < b.r * b.r) {
        dragRef.current = { bubble: b, offsetX: dx, offsetY: dy };
        return;
      }
    }
  }, [getCanvasPos]);

  const handleMouseUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
    hoveredRef.current = null;
    dragRef.current = null;
    setHovered(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    for (let i = bubblesRef.current.length - 1; i >= 0; i--) {
      const b = bubblesRef.current[i];
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      if (dx * dx + dy * dy < b.r * b.r) {
        if (entity === "artists") {
          openArtist(b.id);
        } else {
          openSong(b.id);
        }
        return;
      }
    }
  }, [getCanvasPos, entity, openArtist, openSong]);

  const wasDragging = useRef(false);
  const handleMouseDownWrap = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    wasDragging.current = false;
    handleMouseDown(e);
  }, [handleMouseDown]);

  const handleMouseMoveWrap = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) wasDragging.current = true;
    handleMouseMove(e);
  }, [handleMouseMove]);

  const handleClickWrap = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (wasDragging.current) { handleMouseUp(); return; }
    handleMouseUp();
    handleClick(e);
  }, [handleClick, handleMouseUp]);

  const metricLabel = entity === "artists"
    ? (rankingModel === "legal" ? "audience score" : (ARTIST_METRICS.find((m) => m.key === metric)?.label ?? metric).toLowerCase())
    : songMode === "popularity"
      ? (rankingModel === "legal" ? "audience score" : "popularity")
      : rankingModel === "legal"
        ? "hype score"
      : mode === "relative"
        ? `${songMode ?? "trend"} % change`
        : mode === "absolute"
          ? `${songMode ?? "trend"} abs change`
        : `${songMode ?? "trend"} hype`;

  return (
    <div className="flex flex-col h-full">
      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative px-2 pb-1 min-h-0">
        {loading && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2 bg-[var(--secondary)]/80 border border-[var(--muted)] rounded-full px-3 py-1.5 pointer-events-none">
            <span className="w-3 h-3 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin shrink-0" />
            <span className="text-xs text-[var(--muted-foreground)]">Loading...</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full rounded-2xl border border-[var(--muted)] bg-[#050507]"
          style={{ cursor: dragRef.current ? "grabbing" : hovered ? "grab" : "default" }}
          onMouseMove={handleMouseMoveWrap}
          onMouseDown={handleMouseDownWrap}
          onMouseUp={handleClickWrap}
          onMouseLeave={handleMouseLeave}
        />
        {/* Search not-found badge */}
        {searchStatus === "not-found" && searchQuery && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[var(--secondary)] border border-[var(--muted)] rounded-full px-3 py-1 text-xs text-[var(--muted-foreground)] pointer-events-none z-20 whitespace-nowrap">
            Not found in top {totalPages * PAGE_SIZE}
          </div>
        )}

        {/* Tooltip */}
        {hovered && !dragRef.current && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[var(--secondary)] border border-[var(--muted)] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-2xl pointer-events-none z-20">
            <div>
              <div className="font-bold text-sm flex items-center gap-2">
                {hovered.name}
                {hovered.rank === 1 && <span className="text-yellow-400 text-xs">1st</span>}
                {hovered.rank === 2 && <span className="text-gray-300 text-xs">2nd</span>}
                {hovered.rank === 3 && <span className="text-amber-600 text-xs">3rd</span>}
                {hovered.isWatchlisted && <span className="text-pink-400 text-xs">Watchlist</span>}
              </div>
              <div className="flex items-center gap-3 text-xs">
                {hovered.value > 0 && (
                  <span className="text-[var(--muted-foreground)] tabular-nums">{formatCount(hovered.value)} {metricLabel}</span>
                )}
                {hovered.hasData && (mode === "relative" ? hovered.changePercent !== 0 : hovered.changeValue !== 0) && (
                  <span className={`font-bold tabular-nums ${(mode === "relative" ? hovered.changePercent : hovered.changeValue) >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {mode === "relative"
                      ? `${hovered.changePercent >= 0 ? "+" : ""}${hovered.changePercent.toFixed(2)}%`
                      : `${hovered.changeValue > 0 ? "+" : hovered.changeValue < 0 ? "-" : ""}${formatCount(Math.abs(hovered.changeValue))}`}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-2 shrink-0 flex justify-center">
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Previous page"
              aria-label="Previous page"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1.5 rounded-lg border border-[var(--muted)] hover:border-[var(--accent)] bg-[var(--secondary)] disabled:opacity-30 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${page === i ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]" : "bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--muted)] hover:text-white"}`}
              >
                {i * PAGE_SIZE + 1}-{Math.min((i + 1) * PAGE_SIZE, totalCount)}
              </button>
            ))}
            <button
              type="button"
              title="Next page"
              aria-label="Next page"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-1.5 rounded-lg border border-[var(--muted)] hover:border-[var(--accent)] bg-[var(--secondary)] disabled:opacity-30 transition-all"
            >
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
