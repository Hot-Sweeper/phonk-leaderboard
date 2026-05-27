"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Sparkles, Crown, Zap, Lock, Download, RefreshCcw, ArrowUp, ChevronDown, Check } from "lucide-react";

type ModelId = "pulse-mini" | "nova-prime";

type ModelDef = {
  id: ModelId;
  name: string;
  tagline: string;
  tier: "Free" | "Premium";
  icon: typeof Sparkles;
  resolutions: number[];
};

const MODELS: ModelDef[] = [
  {
    id: "pulse-mini",
    name: "Pulse Mini",
    tagline: "Fast drafts · gritty phonk textures",
    tier: "Free",
    icon: Zap,
    resolutions: [512, 768, 1024],
  },
  {
    id: "nova-prime",
    name: "Nova Prime",
    tagline: "Studio detail · up to 4K masters",
    tier: "Premium",
    icon: Crown,
    resolutions: [1024, 2048, 3072, 4096],
  },
];

const SAMPLE_IMAGE = "/coverart-ai/sample.png";
type Status = "idle" | "generating" | "done";

export default function CoverartAiPage() {
  const [prompt, setPrompt] = useState("");
  const [modelId, setModelId] = useState<ModelId>("pulse-mini");
  const [resIndex, setResIndex] = useState(2);
  const [status, setStatus] = useState<Status>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const model = useMemo(() => MODELS.find((m) => m.id === modelId)!, [modelId]);
  const resolution = model.resolutions[Math.min(resIndex, model.resolutions.length - 1)];

  useEffect(() => {
    if (resIndex > model.resolutions.length - 1) {
      const id = window.setTimeout(() => setResIndex(model.resolutions.length - 1), 0);
      return () => window.clearTimeout(id);
    }
  }, [model, resIndex]);

  const canGenerate = prompt.trim().length > 0 && status !== "generating";

  function generate() {
    if (!canGenerate) return;
    setStatus("generating");
    setResultUrl(null);
    window.setTimeout(() => {
      setResultUrl(`${SAMPLE_IMAGE}?t=${Date.now()}`);
      setStatus("done");
    }, 3600);
  }

  return (
    <main className="relative isolate flex min-h-[calc(100vh-4rem)] w-full flex-col items-center overflow-hidden bg-[var(--background)] px-5 pb-6 pt-5 text-[var(--foreground)]">
      <MeshBackdrop />

      <div className="relative z-10 flex w-full max-w-2xl flex-1 flex-col items-center">
        {/* Header */}
        <header className="flex flex-col items-center gap-1.5">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.32em] text-white/60 backdrop-blur">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] opacity-75" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            </span>
            Engine · Online
            <span className="ml-1 text-white/30">·</span>
            <span className="text-white/40">1 : 1</span>
          </div>
          <h1 className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-center text-2xl font-black leading-none tracking-tight text-transparent sm:text-3xl">
            Coverart{" "}
            <span className="bg-gradient-to-r from-[var(--accent)] via-fuchsia-400 to-violet-300 bg-clip-text text-transparent">
              AI
            </span>
          </h1>
        </header>

        {/* Hero preview — fills available vertical space */}
        <section className="relative flex w-full flex-1 items-center justify-center py-4">
          <div className="pointer-events-none absolute inset-4 -z-10 rounded-[3rem] bg-[conic-gradient(from_120deg_at_50%_50%,var(--accent)_0deg,transparent_90deg,#7c3aed_180deg,transparent_270deg,var(--accent)_360deg)] opacity-25 blur-3xl" />
          <div
            className="aspect-square w-full"
            style={{ maxWidth: "min(100%, calc(100vh - 22rem))" }}
          >
            <PreviewCanvas status={status} resultUrl={resultUrl} model={model.name} />
          </div>
        </section>

        {/* Island prompt bar — anchored to bottom of column */}
        <section className="w-full">
          <div className="group relative rounded-[1.75rem] border border-white/10 bg-[var(--secondary)]/50 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.7),0_0_60px_-20px_var(--accent-glow)] backdrop-blur-2xl transition-colors focus-within:border-[var(--accent)]/50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem]">
              <div className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-[var(--accent)]/25 blur-3xl" />
            </div>

            {/* Prompt area */}
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  generate();
                }
              }}
              placeholder="Describe your cover art… lone samurai under neon rain, brazilian phonk poster, glowing red sigil"
              rows={2}
              className="relative block w-full resize-none bg-transparent px-5 pt-4 pb-2 text-[14px] leading-6 text-white placeholder:text-white/35 outline-none"
            />

            {/* Toolbar */}
            <div className="relative flex items-center justify-between gap-2 px-3 pb-3 pt-1">
              <div className="flex items-center gap-1.5">
                <ModelChip
                  value={modelId}
                  onChange={(v) => {
                    setModelId(v);
                    const next = MODELS.find((m) => m.id === v)!;
                    if (resIndex > next.resolutions.length - 1) {
                      setResIndex(next.resolutions.length - 1);
                    }
                  }}
                />
                <ResolutionDropdown
                  resolutions={model.resolutions}
                  index={resIndex}
                  onChange={setResIndex}
                />
              </div>

              <button
                type="button"
                onClick={generate}
                disabled={!canGenerate}
                aria-label="Generate"
                className="group/btn relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-white shadow-[0_10px_30px_-6px_var(--accent-glow)] transition-all hover:scale-105 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:scale-100"
              >
                <span className="absolute inset-0 bg-gradient-to-br from-[var(--accent)] via-fuchsia-500 to-violet-500" />
                <span className="relative z-10">
                  {status === "generating" ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" strokeWidth={3} />
                  )}
                </span>
              </button>
            </div>
          </div>

          {/* Hint row */}
          <div className="mt-2 flex items-center justify-between px-2 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
            <span>Press Enter to generate</span>
            <span className="tabular-nums">
              {model.name} · {resolution}px
            </span>
          </div>
        </section>
      </div>

      <KeyframeStyles />
    </main>
  );
}

/* ─────────────────────────── Model chip (compact toggle) ─────────────────────────── */

function ModelChip({
  value,
  onChange,
}: {
  value: ModelId;
  onChange: (v: ModelId) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = MODELS.find((m) => m.id === value)!;
  const CurrentIcon = current.icon;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="group/chip inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] pl-1.5 pr-3 text-[12px] font-bold text-white/85 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
      >
        <span
          className={`flex h-5 w-5 items-center justify-center rounded-full ${
            current.tier === "Premium"
              ? "bg-gradient-to-br from-[var(--accent)] to-violet-500 text-white shadow-[0_0_12px_var(--accent-glow)]"
              : "bg-white/10 text-[var(--accent)]"
          }`}
        >
          <CurrentIcon className="h-3 w-3" />
        </span>
        <span className="leading-none">{current.name}</span>
        {current.tier === "Premium" && <Lock className="h-3 w-3 text-amber-200/80" />}
        <ChevronDown
          className={`h-3.5 w-3.5 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-0 z-30 mb-2 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12]/95 p-1.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8),0_0_30px_-10px_var(--accent-glow)] backdrop-blur-2xl"
        >
          {MODELS.map((m) => {
            const Icon = m.icon;
            const selected = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  selected ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                }`}
              >
                <span
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${
                    m.tier === "Premium"
                      ? "bg-gradient-to-br from-[var(--accent)] to-violet-500 text-white shadow-[0_0_12px_var(--accent-glow)]"
                      : "bg-white/[0.06] text-[var(--accent)]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[12px] font-black text-white">
                    {m.name}
                    {m.tier === "Premium" && <Lock className="h-2.5 w-2.5 text-amber-200/80" />}
                  </span>
                  <span className="block text-[10px] text-white/40">
                    {m.tier} · up to {m.resolutions[m.resolutions.length - 1]}px
                  </span>
                </span>
                {selected && <Check className="h-3.5 w-3.5 flex-shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Resolution dropdown ─────────────────────────── */

function ResolutionDropdown({
  resolutions,
  index,
  onChange,
}: {
  resolutions: number[];
  index: number;
  onChange: (i: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const safeIdx = Math.min(index, resolutions.length - 1);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const fmt = (r: number) =>
    r >= 1000 ? `${(r / 1000).toFixed(r % 1000 === 0 ? 0 : 1)}K` : `${r}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 text-[12px] font-bold text-white/85 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
      >
        <span className="tabular-nums leading-none">
          {resolutions[safeIdx]}
          <span className="ml-0.5 text-[10px] text-white/40">px</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-white/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-full left-0 z-30 mb-2 w-40 overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12]/95 p-1.5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
        >
          {resolutions.map((r, i) => {
            const selected = i === safeIdx;
            return (
              <button
                key={r}
                type="button"
                onClick={() => {
                  onChange(i);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-1.5 text-left text-[12px] font-bold transition-colors ${
                  selected ? "bg-white/[0.06] text-white" : "text-white/70 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className="tabular-nums">
                  {r}
                  <span className="ml-0.5 text-[10px] text-white/40">px</span>
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">
                  {fmt(r)}
                </span>
                {selected && <Check className="ml-1.5 h-3.5 w-3.5 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Preview canvas ─────────────────────────── */

function PreviewCanvas({
  status,
  resultUrl,
  model,
}: {
  status: Status;
  resultUrl: string | null;
  model: string;
}) {
  const phrases = useMemo(
    () => [
      "Sampling latent space",
      "Compositing palette",
      "Stabilizing detail",
      "Painting highlights",
      "Final mastering",
    ],
    [],
  );
  const [phraseIdx, setPhraseIdx] = useState(0);

  useEffect(() => {
    if (status !== "generating") return;
    const reset = window.setTimeout(() => setPhraseIdx(0), 0);
    const id = window.setInterval(() => {
      setPhraseIdx((i) => (i + 1) % phrases.length);
    }, 700);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(id);
    };
  }, [status, phrases.length]);

  return (
    <div className="relative aspect-square h-full w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-[inset_0_0_60px_rgba(0,0,0,0.8)]">
      {/* Always-on subtle ambient swirl */}
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute inset-0 animate-coverart-aurora bg-[conic-gradient(from_0deg_at_50%_50%,var(--accent)_0deg,transparent_120deg,#7c3aed_240deg,transparent_360deg)] opacity-25 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.6)_75%,rgba(0,0,0,0.95)_100%)]" />
      </div>

      {/* Idle state */}
      {status === "idle" && !resultUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
          <div className="relative">
            <div className="absolute inset-0 animate-coverart-pulse rounded-2xl bg-[var(--accent)]/40 blur-xl" />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[var(--accent)]">
              <Sparkles className="h-6 w-6" />
            </div>
          </div>
          <p className="text-base font-black tracking-tight text-white">Ready to render</p>
          <p className="max-w-[18rem] text-[11px] leading-5 text-white/40">
            Drop a prompt, choose your model, and the canvas will come alive.
          </p>
        </div>
      )}

      {/* Result image */}
      {resultUrl && (
        <Image
          src={resultUrl}
          alt="Generated cover art"
          fill
          sizes="(min-width: 1024px) 36vw, 100vw"
          className={`object-cover transition-all duration-1000 ${
            status === "done" ? "scale-100 opacity-100 blur-0" : "scale-110 opacity-0 blur-md"
          }`}
          priority
          unoptimized
        />
      )}

      {/* Generating overlay */}
      {status === "generating" && <GeneratingOverlay model={model} phrase={phrases[phraseIdx]} />}

      {/* Reveal sweep */}
      {status === "done" && <RevealSweep />}

      {/* Grid texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08] mix-blend-screen"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Corner brackets */}
      <Corner pos="top-3 left-3" />
      <Corner pos="top-3 right-3" rotate="rotate-90" />
      <Corner pos="bottom-3 right-3" rotate="rotate-180" />
      <Corner pos="bottom-3 left-3" rotate="-rotate-90" />

      {/* Status caption + download */}
      <div className="absolute inset-x-3 bottom-3 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.28em]">
        <span className="text-white/50">
          {status === "generating" ? "Rendering" : status === "done" ? "Ready" : "Standby"}
        </span>
        {status === "done" && resultUrl ? (
          <a
            href={resultUrl}
            download="coverart.png"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-white/80 backdrop-blur hover:text-white"
          >
            <Download className="h-3 w-3" />
            PNG
          </a>
        ) : (
          <span className="text-white/40">{model}</span>
        )}
      </div>
    </div>
  );
}

function Corner({ pos, rotate }: { pos: string; rotate?: string }) {
  return (
    <div
      className={`pointer-events-none absolute ${pos} ${rotate ?? ""} h-5 w-5`}
      aria-hidden
    >
      <span className="absolute left-0 top-0 h-px w-4 bg-[var(--accent)]/70" />
      <span className="absolute left-0 top-0 h-4 w-px bg-[var(--accent)]/70" />
    </div>
  );
}

function GeneratingOverlay({ model, phrase }: { model: string; phrase: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Boosted aurora */}
      <div className="absolute inset-0 animate-coverart-aurora-fast bg-[conic-gradient(from_0deg_at_50%_50%,var(--accent),transparent_25%,#7c3aed,transparent_50%,var(--accent),transparent_75%,#7c3aed,transparent_100%)] opacity-60 blur-2xl" />

      {/* Concentric rings */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Ring size={260} duration={9} reverse thickness={1} opacity={0.35} />
        <Ring size={200} duration={6} reverse={false} thickness={1.5} opacity={0.5} dashed />
        <Ring size={140} duration={4} reverse thickness={2} opacity={0.75} />
        <Ring size={88} duration={2.5} reverse={false} thickness={2.5} opacity={1} />
      </div>

      {/* Core orb */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] via-fuchsia-500 to-violet-500 text-white shadow-[0_0_80px_var(--accent-glow)]">
          <div className="absolute inset-0 animate-coverart-pulse rounded-full bg-[var(--accent)] opacity-60" />
          <Sparkles className="relative h-6 w-6 animate-coverart-spin" />
        </div>
      </div>

      {/* Scan line */}
      <div className="absolute inset-x-0 top-0 h-full">
        <div className="absolute inset-x-0 h-32 animate-coverart-scan bg-gradient-to-b from-transparent via-white/15 to-transparent" />
      </div>

      {/* Phrase ticker */}
      <div className="absolute inset-x-0 top-[58%] flex flex-col items-center gap-1.5 px-6 text-center">
        <div
          key={phrase}
          className="animate-coverart-fade text-[11px] font-black uppercase tracking-[0.32em] text-white"
        >
          {phrase}
        </div>
        <div className="text-[9px] font-black uppercase tracking-[0.4em] text-white/40">
          {model}
        </div>
      </div>
    </div>
  );
}

function Ring({
  size,
  duration,
  reverse,
  thickness,
  opacity,
  dashed,
}: {
  size: number;
  duration: number;
  reverse: boolean;
  thickness: number;
  opacity: number;
  dashed?: boolean;
}) {
  return (
    <div
      className="absolute rounded-full border-[var(--accent)]"
      style={{
        width: size,
        height: size,
        borderWidth: thickness,
        borderStyle: dashed ? "dashed" : "solid",
        opacity,
        animation: `${reverse ? "coverart-spin-reverse" : "coverart-spin"} ${duration}s linear infinite`,
        boxShadow: `0 0 30px var(--accent-glow)`,
      }}
    />
  );
}

function RevealSweep() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-y-0 -left-1/3 w-1/2 animate-coverart-reveal bg-gradient-to-r from-transparent via-white/30 to-transparent blur-md" />
    </div>
  );
}

/* ─────────────────────────── Background ─────────────────────────── */

function MeshBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 top-0 h-[40rem] w-[40rem] rounded-full bg-[var(--accent)]/20 blur-[160px]" />
      <div className="absolute -right-40 top-1/3 h-[36rem] w-[36rem] rounded-full bg-violet-500/15 blur-[160px]" />
      <div className="absolute bottom-0 left-1/3 h-[24rem] w-[24rem] rounded-full bg-fuchsia-500/10 blur-[140px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(255,255,255,0.06),transparent_60%)]" />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
    </div>
  );
}

/* ─────────────────────────── Keyframes ─────────────────────────── */

function KeyframeStyles() {
  return (
    <style jsx global>{`
      @keyframes coverart-spin {
        to { transform: rotate(360deg); }
      }
      @keyframes coverart-spin-reverse {
        to { transform: rotate(-360deg); }
      }
      @keyframes coverart-pulse {
        0%, 100% { transform: scale(1); opacity: 0.55; }
        50% { transform: scale(1.7); opacity: 0; }
      }
      @keyframes coverart-scan {
        0% { transform: translateY(-40%); }
        100% { transform: translateY(140%); }
      }
      @keyframes coverart-aurora {
        to { transform: rotate(360deg) scale(1.3); }
      }
      @keyframes coverart-aurora-fast {
        to { transform: rotate(360deg) scale(1.4); }
      }
      @keyframes coverart-reveal {
        0% { transform: translateX(-30%); opacity: 0; }
        25% { opacity: 1; }
        100% { transform: translateX(400%); opacity: 0; }
      }
      @keyframes coverart-fade {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-coverart-aurora {
        animation: coverart-aurora 14s linear infinite;
        transform-origin: 50% 50%;
      }
      .animate-coverart-aurora-fast {
        animation: coverart-aurora-fast 6s linear infinite;
        transform-origin: 50% 50%;
      }
      .animate-coverart-pulse {
        animation: coverart-pulse 1.8s ease-in-out infinite;
      }
      .animate-coverart-spin {
        animation: coverart-spin 5s linear infinite;
      }
      .animate-coverart-scan {
        animation: coverart-scan 2.4s ease-in-out infinite;
      }
      .animate-coverart-reveal {
        animation: coverart-reveal 1.2s ease-out forwards;
      }
      .animate-coverart-fade {
        animation: coverart-fade 0.35s ease-out;
      }
    `}</style>
  );
}
