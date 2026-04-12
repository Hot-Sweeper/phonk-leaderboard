"use client";
import { useDetailPanel } from "@/lib/detail-panel";
import ArtistPanel from "@/components/panels/ArtistPanel";
import SongPanel from "@/components/panels/SongPanel";
import PackPanel from "@/components/panels/PackPanel";
import { Flame, Users, Music, TrendingUp } from "lucide-react";

function EmptyPanel() {
  return (
    <aside className="hidden lg:flex flex-col w-full shrink-0 border-l border-[var(--muted)]/50 bg-[var(--background)] h-full items-center justify-center gap-4 px-6 text-center select-none">
      <div className="relative">
        <div className="absolute inset-0 blur-2xl bg-[var(--accent)] opacity-20 rounded-full" />
        <Flame className="relative w-12 h-12 text-[var(--accent)] opacity-60" />
      </div>
      <div>
        <p className="text-sm font-bold text-white/40">Click any artist or song</p>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">Details open here</p>
      </div>
      <div className="flex flex-col gap-2 mt-2 w-full">
        {[
          { icon: Users, text: "Artists ranked across all platforms" },
          { icon: Music, text: "Songs with playback previews" },
          { icon: TrendingUp, text: "Growth tracked over time" },
        ].map((item) => (
          <div key={item.text} className="flex items-center gap-2.5 rounded-xl border border-[var(--muted)]/40 bg-[var(--secondary)]/40 px-3 py-2.5">
            <item.icon className="w-4 h-4 text-[var(--accent)] opacity-60 shrink-0" />
            <span className="text-xs text-white/30 text-left">{item.text}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}

export default function DetailPanel() {
  const { panel, isOpen } = useDetailPanel();

  if (!isOpen || !panel.id) return <EmptyPanel />;

  return (
    <aside className="hidden lg:flex flex-col w-full shrink-0 border-l border-[var(--muted)]/50 bg-[var(--background)] h-full">
      {panel.type === "artist" && <ArtistPanel id={panel.id} />}
      {panel.type === "song" && <SongPanel id={panel.id} data={panel.data} />}
      {panel.type === "pack" && <PackPanel id={panel.id} />}
    </aside>
  );
}

