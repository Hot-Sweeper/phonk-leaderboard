"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  Sparkles,
  Wand2,
  Crown,
  Zap,
  Lock,
  RefreshCcw,
  Download,
} from "lucide-react";

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
    tagline: "Fast drafts, gritty phonk textures",
    tier: "Free",
    icon: Zap,
    resolutions: [512, 768, 1024],
  },
  {
    id: "nova-prime",
    name: "Nova Prime",
    tagline: "Studio-grade detail, up to 4K masters",
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
  const [resolution, setResolution] = useState<number>(1024);
  const [status, setStatus] = useState<Status>("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const model = useMemo(() => MODELS.find((m) => m.id === modelId)!, [modelId]);

  useEffect(() => {
    if (!model.resolutions.includes(resolution)) {
      const fallback = model.resolutions[model.resolutions.length - 1];
      const id = window.setTimeout(() => setResolution(fallback), 0);
      return () => window.clearTimeout(id);
    }
  }, [model, resolution]);

  const canGenerate = prompt.trim().length > 0 && status !== "generating";

  function generate() {
    if (!canGenerate) return;
    setStatus("generating");
    setResultUrl(null);
    window.setTimeout(() => {
      setResultUrl(`${SAMPLE_IMAGE}?t=${Date.now()}`);
      setStatus("done");
    }, 3800);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-4 py-10 text-[var(--foreground)] sm:px-8">
      <BackgroundAurora />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-3">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--muted)] bg-[var(--secondary)]/60 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--muted-foreground)] backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            Coverart Workspace
          </div>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Coverart AI</h1>
          <p className="max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">
            Describe the vibe, pick a model, and let the engine render a square cover.
            Pulse Mini is free up to 1K. Nova Prime unlocks 4K masters.
          </p>
        </header>

        <div className="grid gap-6">
          <section className="relative">
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_30%_20%,var(--accent-glow),transparent_60%)] opacity-40 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--secondary)]/55 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] border border-white/5" />
              <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--accent)]/30 blur-3xl" />

              <div className="relative space-y-6">
                <div className="space-y-2">
                  <Label icon={Wand2}>Model</Label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {MODELS.map((m) => {
                      const selected = m.id === modelId;
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setModelId(m.id)}
                          className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all ${
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-[0_0_24px_var(--accent-glow)]"
                              : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span
                                className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                  selected
                                    ? "bg-[var(--accent)] text-white"
                                    : "bg-white/10 text-white/70"
                                }`}
                              >
                                <Icon className="h-5 w-5" />
                              </span>
                              <div>
                                <div className="text-sm font-black leading-tight">{m.name}</div>
                                <div className="text-[11px] text-[var(--muted-foreground)]">
                                  {m.tagline}
                                </div>
                              </div>
                            </div>
                            <TierBadge tier={m.tier} />
                          </div>
                          <div className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                            <span>Up to {m.resolutions[m.resolutions.length - 1]}px</span>
                            <span className="h-px flex-1 bg-white/10" />
                            <span>1:1</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label icon={Sparkles}>Resolution · square</Label>
                  <div className="flex flex-wrap gap-2">
                    {model.resolutions.map((r) => {
                      const selected = r === resolution;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setResolution(r)}
                          className={`rounded-full border px-3.5 py-1.5 text-[11px] font-bold tabular-nums transition-all ${
                            selected
                              ? "border-[var(--accent)] bg-[var(--accent)]/15 text-white shadow-[0_0_12px_var(--accent-glow)]"
                              : "border-white/10 bg-white/[0.04] text-[var(--muted-foreground)] hover:border-white/25 hover:text-white"
                          }`}
                        >
                          {r} × {r}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label icon={Wand2}>Prompt</Label>
                  <div className="relative">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe the cover. e.g. lone samurai under neon rain, brazilian phonk poster, heavy grain, glowing red sigil"
                      rows={5}
                      className="w-full resize-none rounded-2xl border border-white/10 bg-[var(--background)]/60 px-4 py-3 text-sm text-white placeholder:text-[var(--muted-foreground)] outline-none transition-colors focus:border-[var(--accent)] focus:bg-[var(--background)]/80"
                    />
                    <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                      {prompt.trim().length} chars
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={generate}
                  disabled={!canGenerate}
                  className="relative w-full overflow-hidden rounded-2xl bg-[var(--accent)] px-5 py-3.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-[0_18px_50px_var(--accent-glow)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {status === "generating" ? (
                      <>
                        <RefreshCcw className="h-4 w-4 animate-spin" />
                        Rendering
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Generate cover
                      </>
                    )}
                  </span>
                </button>
              </div>
            </div>
          </section>

          <section className="relative">
            <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[3rem] bg-[radial-gradient(circle_at_70%_80%,var(--accent-glow),transparent_60%)] opacity-30 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[var(--secondary)]/40 p-5 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
              <div className="mb-4 flex items-center justify-between">
                <Label icon={Sparkles}>Output · {resolution}px</Label>
                {status === "done" && resultUrl ? (
                  <a
                    href={resultUrl}
                    download={`coverart-${model.id}-${resolution}.png`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white/70 hover:text-white"
                  >
                    <Download className="h-3 w-3" />
                    Save
                  </a>
                ) : null}
              </div>

              <CoverCanvas status={status} resultUrl={resultUrl} model={model.name} />
            </div>
          </section>
        </div>
      </div>

      <style jsx global>{`
        @keyframes coverart-spin {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes coverart-spin-reverse {
          to {
            transform: rotate(-360deg);
          }
        }
        @keyframes coverart-pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.6);
            opacity: 0;
          }
        }
        @keyframes coverart-scan {
          0% {
            transform: translateY(-30%);
          }
          100% {
            transform: translateY(130%);
          }
        }
        @keyframes coverart-aurora {
          0% {
            transform: rotate(0deg) scale(1.2);
          }
          100% {
            transform: rotate(360deg) scale(1.2);
          }
        }
        @keyframes coverart-reveal {
          0% {
            transform: translateX(-50%);
            opacity: 0;
          }
          30% {
            opacity: 1;
          }
          100% {
            transform: translateX(400%);
            opacity: 0;
          }
        }
        @keyframes coverart-dot {
          0%,
          100% {
            opacity: 0.25;
            transform: translateY(0);
          }
          50% {
            opacity: 1;
            transform: translateY(-3px);
          }
        }
        .animate-coverart-pulse {
          animation: coverart-pulse 1.6s ease-in-out infinite;
        }
        .animate-coverart-spin {
          animation: coverart-spin 4s linear infinite;
        }
        .animate-coverart-scan {
          animation: coverart-scan 2.2s ease-in-out infinite;
        }
        .animate-coverart-aurora {
          animation: coverart-aurora 8s linear infinite;
        }
        .animate-coverart-reveal {
          animation: coverart-reveal 1.1s ease-out forwards;
        }
      `}</style>
    </main>
  );
}

function Label({ icon: Icon, children }: { icon: typeof Sparkles; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--muted-foreground)]">
      <Icon className="h-3 w-3 text-[var(--accent)]" />
      {children}
    </div>
  );
}

function TierBadge({ tier }: { tier: "Free" | "Premium" }) {
  if (tier === "Free") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] text-white/60">
        Free
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] text-amber-200">
      <Lock className="h-2.5 w-2.5" />
      Premium
    </span>
  );
}

function CoverCanvas({
  status,
  resultUrl,
  model,
}: {
  status: Status;
  resultUrl: string | null;
  model: string;
}) {
  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
      {status === "idle" && !resultUrl && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[var(--accent)]">
            <Sparkles className="h-6 w-6" />
          </div>
          <p className="text-sm font-bold text-white/70">Your cover will appear here</p>
          <p className="max-w-xs text-[11px] text-[var(--muted-foreground)]">
            Describe the mood, choose a model, then hit generate.
          </p>
        </div>
      )}

      {resultUrl && (
        <Image
          src={resultUrl}
          alt="Generated cover art"
          fill
          sizes="(min-width: 1024px) 36vw, 100vw"
          className={`object-cover transition-all duration-700 ${
            status === "done"
              ? "scale-100 opacity-100 blur-0"
              : "scale-105 opacity-0 blur-md"
          }`}
          priority
          unoptimized
        />
      )}

      {status === "generating" && <GeneratingOverlay model={model} />}
      {status === "done" && <RevealSweep />}
    </div>
  );
}

function GeneratingOverlay({ model }: { model: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 animate-coverart-aurora bg-[conic-gradient(from_0deg_at_50%_50%,var(--accent)_0deg,transparent_120deg,var(--accent)_240deg,transparent_360deg)] opacity-40 blur-3xl" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_70%,rgba(0,0,0,0.85)_100%)]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <Ring size={210} duration={6} reverse={false} thickness={1.5} opacity={0.45} />
        <Ring size={160} duration={4} reverse thickness={2} opacity={0.65} />
        <Ring size={110} duration={3} reverse={false} thickness={2.5} opacity={0.9} dashed />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_0_60px_var(--accent-glow)]">
          <div className="absolute inset-0 animate-coverart-pulse rounded-full bg-[var(--accent)] opacity-60" />
          <Sparkles className="relative h-6 w-6 animate-coverart-spin" />
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-full">
        <div className="absolute inset-x-0 h-24 animate-coverart-scan bg-gradient-to-b from-transparent via-white/15 to-transparent" />
      </div>

      <div className="absolute inset-x-0 bottom-5 flex flex-col items-center gap-1.5">
        <div className="text-[10px] font-black uppercase tracking-[0.32em] text-white/80">
          {model} · rendering
        </div>
        <div className="flex items-center gap-1">
          <Dot delay="0s" />
          <Dot delay="0.18s" />
          <Dot delay="0.36s" />
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
        boxShadow: `0 0 40px var(--accent-glow)`,
      }}
    />
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 rounded-full bg-white/80"
      style={{
        animation: "coverart-dot 1.2s ease-in-out infinite",
        animationDelay: delay,
      }}
    />
  );
}

function RevealSweep() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-1/3 animate-coverart-reveal bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    </div>
  );
}

function BackgroundAurora() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
      <div className="absolute -left-32 top-10 h-[36rem] w-[36rem] rounded-full bg-[var(--accent)]/15 blur-[140px]" />
      <div className="absolute -right-32 bottom-10 h-[30rem] w-[30rem] rounded-full bg-fuchsia-500/10 blur-[140px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_50%)]" />
    </div>
  );
}
