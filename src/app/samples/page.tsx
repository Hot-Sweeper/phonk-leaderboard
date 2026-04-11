"use client";
import { Package, Flame, Clock, Download, ArrowRight } from "lucide-react";

const PLACEHOLDER_PACKS = [
  { name: "Dark Phonk Essentials", author: "Community", tags: ["drums", "bass", "fx"], downloads: 0 },
  { name: "Drift Phonk Kit Vol. 1", author: "Community", tags: ["cowbell", "808", "vox"], downloads: 0 },
  { name: "Brazilian Phonk Starters", author: "Community", tags: ["funk", "bass", "perc"], downloads: 0 },
  { name: "Aggressive Phonk Loops", author: "Community", tags: ["loops", "synth", "dark"], downloads: 0 },
];

export default function SamplesPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-8 md:p-12 font-sans relative">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-5xl mx-auto relative z-10">
        <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 mb-2">
          <Package className="w-8 h-8 text-cyan-400" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-cyan-400">
            Sample Packs
          </span>
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm mb-8 max-w-lg">
          Browse and share sample packs from the Phonk community. Find the sounds that shape the genre.
        </p>

        {/* Coming soon banner */}
        <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-transparent p-8 text-center mb-10">
          <Flame className="w-12 h-12 text-cyan-400 mx-auto mb-4 opacity-60" />
          <h2 className="text-xl font-black mb-2">Coming Soon</h2>
          <p className="text-[var(--muted-foreground)] text-sm max-w-md mx-auto">
            Sample pack uploads, downloads, and community ratings are on the way. Stay tuned.
          </p>
        </div>

        {/* Preview cards */}
        <h3 className="text-lg font-bold text-[var(--muted-foreground)] uppercase tracking-widest text-xs mb-4">
          Preview
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLACEHOLDER_PACKS.map((pack) => (
            <div
              key={pack.name}
              className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-5 opacity-60"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-bold text-base">{pack.name}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">by {pack.author}</div>
                </div>
                <Package className="w-5 h-5 text-cyan-400/40 shrink-0" />
              </div>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {pack.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 rounded-md bg-[var(--muted)] text-xs text-[var(--muted-foreground)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
                <span className="flex items-center gap-1">
                  <Download className="w-3.5 h-3.5" /> {pack.downloads}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Soon
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
