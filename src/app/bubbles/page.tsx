"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Circle, Loader2 } from "lucide-react";

type Artist = {
  id: string;
  name: string;
  imageUrl: string | null;
  links: { platform: string; monthlyListeners: number; followerCount: number }[];
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

type Bubble = {
  id: string;
  name: string;
  imageUrl: string | null;
  listeners: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  targetR: number;
  imgLoaded: boolean;
  img: HTMLImageElement | null;
};

const PAGE_SIZE = 100;

export default function BubblesPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bubblesRef = useRef<Bubble[]>([]);
  const animRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number } | null>(null);
  const hoveredRef = useRef<Bubble | null>(null);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<Bubble | null>(null);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Load artists for current page
  useEffect(() => {
    setLoading(true);
    const skip = page * PAGE_SIZE;
    fetch(`/api/artists?skip=${skip}&take=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((data) => {
        setArtists(data.artists ?? []);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  // Init bubbles when artists change
  useEffect(() => {
    if (artists.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Scale bubble sizes relative to the max listener count
    const maxListeners = Math.max(1, ...artists.map((a) => {
      const sp = a.links.find((l) => l.platform === "SPOTIFY");
      return sp?.monthlyListeners ?? 0;
    }));
    const minListeners = Math.min(...artists.map((a) => {
      const sp = a.links.find((l) => l.platform === "SPOTIFY");
      return sp?.monthlyListeners ?? 0;
    }));

    const minR = Math.max(18, Math.min(w, h) * 0.025);
    const maxR = Math.min(70, Math.min(w, h) * 0.09);

    const newBubbles: Bubble[] = artists.map((artist) => {
      const sp = artist.links.find((l) => l.platform === "SPOTIFY");
      const listeners = sp?.monthlyListeners ?? 0;

      // Log scale for better distribution
      const logVal = maxListeners > minListeners
        ? (Math.log(listeners + 1) - Math.log(minListeners + 1)) / (Math.log(maxListeners + 1) - Math.log(minListeners + 1))
        : 0.5;
      const targetR = minR + logVal * (maxR - minR);

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
        listeners,
        x: minR + Math.random() * (w - 2 * minR),
        y: minR + Math.random() * (h - 2 * minR),
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 0, // Start at 0, animate to targetR
        targetR,
        imgLoaded,
        img,
      };
    });

    bubblesRef.current = newBubbles;
  }, [artists]);

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
      const mouse = mouseRef.current;

      // Animate radius
      for (const b of bubbles) {
        b.r += (b.targetR - b.r) * 0.08;
      }

      // Simple physics
      for (let i = 0; i < bubbles.length; i++) {
        const a = bubbles[i];
        // Boundary
        if (a.x - a.r < 0) { a.x = a.r; a.vx = Math.abs(a.vx) * 0.5; }
        if (a.x + a.r > w) { a.x = w - a.r; a.vx = -Math.abs(a.vx) * 0.5; }
        if (a.y - a.r < 0) { a.y = a.r; a.vy = Math.abs(a.vy) * 0.5; }
        if (a.y + a.r > h) { a.y = h - a.r; a.vy = -Math.abs(a.vy) * 0.5; }

        // Bubble-bubble collision
        for (let j = i + 1; j < bubbles.length; j++) {
          const b = bubbles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = a.r + b.r + 2;
          if (dist < minDist && dist > 0) {
            const overlap = (minDist - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;
            a.x -= nx * overlap * 0.5;
            a.y -= ny * overlap * 0.5;
            b.x += nx * overlap * 0.5;
            b.y += ny * overlap * 0.5;
            // Bounce
            const relVx = a.vx - b.vx;
            const relVy = a.vy - b.vy;
            const dot = relVx * nx + relVy * ny;
            if (dot > 0) {
              a.vx -= dot * nx * 0.3;
              a.vy -= dot * ny * 0.3;
              b.vx += dot * nx * 0.3;
              b.vy += dot * ny * 0.3;
            }
          }
        }

        // Gentle center gravity
        const cx = w / 2;
        const cy = h / 2;
        a.vx += (cx - a.x) * 0.00008;
        a.vy += (cy - a.y) * 0.00008;

        // Damping
        a.vx *= 0.995;
        a.vy *= 0.995;

        // Move
        a.x += a.vx;
        a.y += a.vy;
      }

      // Check hover
      let newHovered: Bubble | null = null;
      if (mouse) {
        for (const b of bubbles) {
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

      // Sort: smaller bubbles render on top
      const sorted = [...bubbles].sort((a, b) => b.r - a.r);

      // Draw bubbles
      for (const b of sorted) {
        const isHov = b === newHovered;
        const drawR = isHov ? b.r * 1.08 : b.r;

        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);

        if (b.img && b.imgLoaded) {
          ctx.save();
          ctx.clip();
          ctx.drawImage(b.img, b.x - drawR, b.y - drawR, drawR * 2, drawR * 2);
          ctx.restore();

          // Dark overlay for text readability
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.fill();
        } else {
          // Gradient fill
          const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, drawR);
          grad.addColorStop(0, "rgba(192, 38, 211, 0.6)");
          grad.addColorStop(1, "rgba(88, 28, 135, 0.8)");
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Border
        ctx.beginPath();
        ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
        ctx.strokeStyle = isHov ? "rgba(192, 38, 211, 0.9)" : "rgba(192, 38, 211, 0.3)";
        ctx.lineWidth = isHov ? 2.5 : 1.5;
        ctx.stroke();

        // Glow on hover
        if (isHov) {
          ctx.shadowColor = "rgba(192, 38, 211, 0.5)";
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(b.x, b.y, drawR, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(192, 38, 211, 0.6)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        // Text
        if (drawR > 20) {
          ctx.fillStyle = "#fff";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const fontSize = Math.max(8, Math.min(14, drawR * 0.32));
          ctx.font = `bold ${fontSize}px sans-serif`;

          // Name
          const maxNameW = drawR * 1.6;
          let displayName = b.name;
          while (ctx.measureText(displayName).width > maxNameW && displayName.length > 3) {
            displayName = displayName.slice(0, -1);
          }
          if (displayName !== b.name) displayName += "\u2026";
          ctx.fillText(displayName, b.x, b.y - fontSize * 0.5);

          // Listeners
          if (b.listeners > 0) {
            const smallSize = Math.max(7, fontSize * 0.7);
            ctx.font = `${smallSize}px sans-serif`;
            ctx.fillStyle = "rgba(255,255,255,0.7)";
            ctx.fillText(formatCount(b.listeners), b.x, b.y + fontSize * 0.6);
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

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = null;
    hoveredRef.current = null;
    setHovered(null);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const b of bubblesRef.current) {
      const dx = mx - b.x;
      const dy = my - b.y;
      if (dx * dx + dy * dy < b.r * b.r) {
        window.location.href = `/artist/${b.id}`;
        return;
      }
    }
  }, []);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans flex flex-col">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3">
                <Circle className="w-8 h-8 text-[var(--accent)]" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
                  Artist Bubbles
                </span>
              </h1>
              <p className="text-[var(--muted-foreground)] text-sm mt-1">
                Each bubble represents an artist sized by their Spotify monthly listeners. Click to explore.
              </p>
            </div>

            {/* Pagination */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-2 rounded-lg border border-[var(--muted)] hover:border-[var(--accent)] bg-[var(--secondary)] disabled:opacity-30 transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                      page === i
                        ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                        : "bg-[var(--secondary)] text-[var(--muted-foreground)] border border-[var(--muted)] hover:text-white"
                    }`}
                  >
                    {i * PAGE_SIZE + 1}-{Math.min((i + 1) * PAGE_SIZE, totalCount)}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-lg border border-[var(--muted)] hover:border-[var(--accent)] bg-[var(--secondary)] disabled:opacity-30 transition-all"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative px-2 pb-2">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full min-h-[500px] rounded-2xl border border-[var(--muted)] bg-[#050507]"
          style={{ cursor: hovered ? "pointer" : "default" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        />
        {/* Hover tooltip */}
        {hovered && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[var(--secondary)] border border-[var(--muted)] rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-2xl pointer-events-none z-20">
            <div>
              <div className="font-bold text-sm">{hovered.name}</div>
              {hovered.listeners > 0 && (
                <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                  {formatCount(hovered.listeners)} monthly listeners
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
