"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, ArrowRight, Circle, Loader2 } from "lucide-react";

type ChangeArtist = {
  id: string;
  name: string;
  imageUrl: string | null;
  currentValue: number;
  changePercent: number;
  hasData: boolean;
  metric: string;
};

type Bubble = {
  id: string;
  name: string;
  imageUrl: string | null;
  value: number;
  changePercent: number;
  hasData: boolean;
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
const PERIOD_LABELS: Record<string, string> = {
  hour: "1H",
  day: "24H",
  week: "7D",
  month: "30D",
  year: "1Y",
};

const METRICS = [
  { key: "listeners", label: "Monthly Listeners" },
  { key: "followers", label: "Spotify Followers" },
  { key: "youtube", label: "YouTube Subs" },
  { key: "tiktok", label: "TikTok Followers" },
  { key: "instagram", label: "Instagram Followers" },
];

const MODES = [
  { key: "change", label: "% Change" },
  { key: "current", label: "Current" },
];

export default function BubblesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRef = useRef<Bubble | null>(null);
  const dragRef = useRef<{ bubble: Bubble; offsetX: number; offsetY: number } | null>(null);

  const [artists, setArtists] = useState<ChangeArtist[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [period, setPeriod] = useState("hour");
  const [metric, setMetric] = useState("listeners");
  const [mode, setMode] = useState("change");
  const [availablePeriods, setAvailablePeriods] = useState<string[]>(["hour"]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Bubble | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Load artist changes for current page, period, metric, mode
  useEffect(() => {
    setLoading(true);
    const skip = page * PAGE_SIZE;
    fetch(`/api/artists/changes?period=${period}&metric=${metric}&mode=${mode}&skip=${skip}&take=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((data) => {
        setArtists(data.artists ?? []);
        setTotalCount(data.totalCount ?? 0);
        if (data.availablePeriods?.length) {
          setAvailablePeriods(data.availablePeriods);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, period, metric, mode]);

  // Init bubbles when artists change
  useEffect(() => {
    if (artists.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // In "current" mode, size = absolute value. In "change" mode, size = |changePercent|
    const isCurrentMode = mode === "current";
    const sizeValues = artists.map((a) =>
      isCurrentMode ? a.currentValue : Math.abs(a.changePercent)
    );
    const maxVal = Math.max(0.01, ...sizeValues);

    const minR = Math.max(16, Math.min(w, h) * 0.02);
    const maxR = Math.min(65, Math.min(w, h) * 0.085);

    const newBubbles: Bubble[] = artists.map((artist) => {
      const sizeVal = isCurrentMode ? artist.currentValue : Math.abs(artist.changePercent);
      // sqrt scale for area-proportional sizing
      const ratio = Math.sqrt(sizeVal / maxVal);
      const targetR = minR + ratio * (maxR - minR);

      // Load image
      let img: HTMLImageElement | null = null;
      let imgLoaded = false;
      if (artist.imageUrl) {
        img = new window.Image();
        img.crossOrigin = "anonymous";
        img.src = `/_next/image?url=${encodeURIComponent(artist.imageUrl)}&w=128&q=75`;
        img.onload = () => {
          const b = bubblesRef.current.find((b) => b.id === artist.id);
          if (b) b.imgLoaded = true;
        };
      }

      return {
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
        value: artist.currentValue,
        changePercent: artist.changePercent,
        hasData: artist.hasData,
        x: targetR + Math.random() * (w - 2 * targetR),
        y: targetR + Math.random() * (h - 2 * targetR),
        vx: 0,
        vy: 0,
        r: 0,
        targetR,
        imgLoaded,
        img,
      };
    });

    bubblesRef.current = newBubbles;
  }, [artists, mode]);

  // Animation loop with repulsion physics
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

      // Animate radius
      for (const b of bubbles) {
        b.r += (b.targetR - b.r) * 0.08;
      }

      // Physics: repulsion between overlapping bubbles + spacing
      for (let i = 0; i < bubbles.length; i++) {
        const a = bubbles[i];
        if (drag && a === drag.bubble) continue; // skip dragged bubble

        for (let j = i + 1; j < bubbles.length; j++) {
          const b = bubbles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const desiredDist = a.r + b.r + 4; // 4px gap

          if (dist < desiredDist && dist > 0.1) {
            const force = (desiredDist - dist) / dist * 0.15;
            const nx = dx * force;
            const ny = dy * force;

            if (!(drag && a === drag.bubble)) {
              a.vx -= nx;
              a.vy -= ny;
            }
            if (!(drag && b === drag.bubble)) {
              b.vx += nx;
              b.vy += ny;
            }
          }
        }
      }

      // Boundary repulsion + center nudge
      for (const b of bubbles) {
        if (drag && b === drag.bubble) continue;

        // Soft boundary push
        const margin = b.r + 2;
        if (b.x < margin) b.vx += (margin - b.x) * 0.1;
        if (b.x > w - margin) b.vx += (w - margin - b.x) * 0.1;
        if (b.y < margin) b.vy += (margin - b.y) * 0.1;
        if (b.y > h - margin) b.vy += (h - margin - b.y) * 0.1;

        // Very gentle center pull to keep things grouped
        b.vx += (w / 2 - b.x) * 0.0003;
        b.vy += (h / 2 - b.y) * 0.0003;

        // Damping
        b.vx *= 0.88;
        b.vy *= 0.88;

        // Move
        b.x += b.vx;
        b.y += b.vy;

        // Hard clamp
        b.x = Math.max(b.r, Math.min(w - b.r, b.x));
        b.y = Math.max(b.r, Math.min(h - b.r, b.y));
      }

      // Check hover
      const mouse = mouseRef.current;
      let newHovered: Bubble | null = null;
      if (mouse && !drag) {
        for (let i = bubbles.length - 1; i >= 0; i--) {
          const b = bubbles[i];
          const dx = mouse.x - b.x;
          const dy = mouse.y - b.y;
          if (dx * dx + dy * dy < b.r * b.r) {
            newHovered = b;
            break;
          }
        }
      }
      if (newHovered !== hoveredRef.current) {
        hoveredRef.current = newHovered;
        setHovered(newHovered);
      }

      // Sort: smaller on top for rendering
      const sorted = [...bubbles].sort((a, b) => b.r - a.r);

      // Draw
      for (const b of sorted) {
        const isHov = b === newHovered || (drag && b === drag.bubble);
        const drawR = isHov ? b.r * 1.06 : b.r;

        // Colors: change mode uses green/red, current mode uses purple/blue
        const isChangeMode = b.hasData && b.changePercent !== 0;
        const isPositive = b.changePercent >= 0;
        const intensity = isChangeMode ? Math.min(1, Math.abs(b.changePercent) / 20) : 0.5;
        let borderColor: string;
        let glowColor: string;

        if (isChangeMode) {
          borderColor = isPositive
            ? `rgba(34, 197, 94, ${0.4 + intensity * 0.4})`
            : `rgba(239, 68, 68, ${0.4 + intensity * 0.4})`;
          glowColor = isPositive
            ? `rgba(34, 197, 94, ${0.15 + intensity * 0.3})`
            : `rgba(239, 68, 68, ${0.15 + intensity * 0.3})`;
        } else {
          borderColor = `rgba(168, 85, 247, 0.5)`;
          glowColor = `rgba(168, 85, 247, 0.3)`;
        }

        ctx.save();

        // Image fill with color overlay
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);

        if (b.img && b.imgLoaded) {
          ctx.save();
          ctx.clip();
          ctx.drawImage(b.img, b.x - drawR, b.y - drawR, drawR * 2, drawR * 2);
          ctx.restore();

          // Color overlay
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
          if (isChangeMode) {
            ctx.fillStyle = isPositive
              ? `rgba(0, 40, 0, ${0.5 + intensity * 0.2})`
              : `rgba(40, 0, 0, ${0.5 + intensity * 0.2})`;
          } else {
            ctx.fillStyle = `rgba(20, 0, 40, 0.55)`;
          }
          ctx.fill();
        } else {
          // Gradient fill
          const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, drawR);
          if (isChangeMode) {
            if (isPositive) {
              grad.addColorStop(0, `rgba(34, 197, 94, ${0.4 + intensity * 0.3})`);
              grad.addColorStop(1, `rgba(20, 83, 45, ${0.6 + intensity * 0.2})`);
            } else {
              grad.addColorStop(0, `rgba(239, 68, 68, ${0.4 + intensity * 0.3})`);
              grad.addColorStop(1, `rgba(127, 29, 29, ${0.6 + intensity * 0.2})`);
            }
          } else {
            grad.addColorStop(0, `rgba(168, 85, 247, 0.4)`);
            grad.addColorStop(1, `rgba(88, 28, 135, 0.6)`);
          }
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Border
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = isHov ? 2.5 : 1.5;
        ctx.stroke();

        // Glow on hover
        if (isHov) {
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Text: name + value or change %
        if (drawR > 18) {
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const fontSize = Math.max(7, Math.min(13, drawR * 0.3));

          // Name
          ctx.font = `bold ${fontSize}px sans-serif`;
          ctx.fillStyle = "#fff";
          const maxNameW = drawR * 1.6;
          let displayName = b.name;
          while (ctx.measureText(displayName).width > maxNameW && displayName.length > 3) {
            displayName = displayName.slice(0, -1);
          }
          if (displayName !== b.name) displayName += "\u2026";
          ctx.fillText(displayName, b.x, b.y - fontSize * 0.6);

          // Sub text: change % or absolute value
          const smallSize = Math.max(6, fontSize * 0.75);
          ctx.font = `bold ${smallSize}px sans-serif`;
          if (isChangeMode) {
            const changeText = `${b.changePercent >= 0 ? "+" : ""}${b.changePercent.toFixed(1)}%`;
            ctx.fillStyle = isPositive ? "#4ade80" : "#f87171";
            ctx.fillText(changeText, b.x, b.y + fontSize * 0.5);
          } else {
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fillText(formatCount(b.value), b.x, b.y + fontSize * 0.5);
          }
        }

        ctx.restore();
      }

      animRef.current = requestAnimationFrame(tick);
    }

    animRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [artists]);

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

    // Find bubble under cursor (reverse order — smaller rendered on top)
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
    if (dragRef.current) {
      dragRef.current = null;
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
    hoveredRef.current = null;
    dragRef.current = null;
    setHovered(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Only navigate if we didn't just drag
    if (dragRef.current) return;
    const pos = getCanvasPos(e);
    if (!pos) return;
    for (let i = bubblesRef.current.length - 1; i >= 0; i--) {
      const b = bubblesRef.current[i];
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      if (dx * dx + dy * dy < b.r * b.r) {
        window.location.href = `/artist/${b.id}`;
        return;
      }
    }
  }, [getCanvasPos]);

  // Track if mouse was dragged to distinguish click from drag
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
    if (wasDragging.current) {
      handleMouseUp();
      return;
    }
    handleMouseUp();
    handleClick(e);
  }, [handleClick, handleMouseUp]);

  return (
    <main className="h-[calc(100vh-3.5rem)] bg-[var(--background)] text-[var(--foreground)] font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 shrink-0">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tighter flex items-center gap-2">
                <Circle className="w-7 h-7 text-[var(--accent)]" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
                  Artist Bubbles
                </span>
              </h1>
              <p className="text-[var(--muted-foreground)] text-xs mt-0.5">
                {mode === "change"
                  ? "Bubble size = change magnitude. Green = growth, red = decline."
                  : "Bubble size = absolute value. Bigger = more."}
                {" "}Drag to rearrange. Click to explore.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {/* Metric selector */}
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                className="bg-[var(--secondary)] border border-[var(--muted)] rounded-lg px-2.5 py-1.5 text-xs font-bold outline-none focus:ring-1 focus:ring-[var(--accent)] text-white"
              >
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>

              {/* Mode selector */}
              <div className="flex gap-1 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMode(m.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                      mode === m.key
                        ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]"
                        : "text-[var(--muted-foreground)] hover:text-white"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Period selector (only in change mode) */}
              {mode === "change" && (
                <div className="flex gap-1 bg-[var(--secondary)] rounded-lg p-0.5 border border-[var(--muted)]">
                  {availablePeriods.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                        period === p
                          ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]"
                          : "text-[var(--muted-foreground)] hover:text-white"
                      }`}
                    >
                      {PERIOD_LABELS[p] ?? p}
                    </button>
                  ))}
                </div>
              )}

              {/* Pagination */}
              <div className="flex items-center gap-1">
                <button
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      page === i
                        ? "bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)]"
                        : "bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--muted)] hover:text-white"
                    }`}
                  >
                    {i * PAGE_SIZE + 1}-{Math.min((i + 1) * PAGE_SIZE, totalCount)}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1.5 rounded-lg border border-[var(--muted)] hover:border-[var(--accent)] bg-[var(--secondary)] disabled:opacity-30 transition-all"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative px-2 pb-2 min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
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
        {/* Hover tooltip */}
        {hovered && !dragRef.current && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[var(--secondary)] border border-[var(--muted)] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-2xl pointer-events-none z-20">
            <div>
              <div className="font-bold text-sm">{hovered.name}</div>
              <div className="flex items-center gap-3 text-xs">
                {hovered.value > 0 && (
                  <span className="text-[var(--muted-foreground)] tabular-nums">
                    {formatCount(hovered.value)} {METRICS.find((m) => m.key === metric)?.label.toLowerCase()}
                  </span>
                )}
                {hovered.hasData && hovered.changePercent !== 0 && (
                  <span className={`font-bold tabular-nums ${hovered.changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {hovered.changePercent >= 0 ? "+" : ""}{hovered.changePercent.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
