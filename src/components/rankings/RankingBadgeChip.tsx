"use client";

import type { ComponentType } from "react";
import { Activity, Database, Flame, Gem, Ghost, LibraryBig, Sparkles, TrendingDown } from "lucide-react";
import type { RankingBadge } from "@/lib/ranking-badges";

const BADGE_STYLE: Record<RankingBadge["tone"], string> = {
  amber: "border-amber-300/35 bg-amber-400/10 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.12)]",
  emerald: "border-emerald-300/35 bg-emerald-400/10 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.12)]",
  cyan: "border-cyan-300/35 bg-cyan-400/10 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.12)]",
  rose: "border-rose-300/35 bg-rose-400/10 text-rose-200 shadow-[0_0_16px_rgba(251,113,133,0.12)]",
  violet: "border-violet-300/35 bg-violet-400/10 text-violet-200 shadow-[0_0_16px_rgba(167,139,250,0.12)]",
  zinc: "border-zinc-300/20 bg-zinc-400/10 text-zinc-300 shadow-[0_0_16px_rgba(161,161,170,0.08)]",
  slate: "border-white/10 bg-white/[0.05] text-zinc-300 shadow-none",
};

const BADGE_ICON = {
  new: Sparkles,
  new_forum: LibraryBig,
  collecting: Database,
  trending: Activity,
  viral: Flame,
  underrated: Gem,
  downfall: TrendingDown,
  dead: Ghost,
} satisfies Record<RankingBadge["kind"], ComponentType<{ className?: string }>>;

export default function RankingBadgeChip({ badge }: { badge: RankingBadge }) {
  const Icon = BADGE_ICON[badge.kind];

  return (
    <div className="group relative inline-flex shrink-0">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.18em] ${BADGE_STYLE[badge.tone]}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
      <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-[#09090d]/95 px-3 py-2 text-left shadow-2xl backdrop-blur-md group-hover:block">
        <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white">
          <Icon className="h-3.5 w-3.5" />
          {badge.label}
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)]">{badge.description}</p>
      </div>
    </div>
  );
}