"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Flame,
  Trophy,
  Music,
  Package,
  ArrowRight,
  TrendingUp,
  Calendar,
  Database,
  Users,
  BarChart2,
} from "lucide-react";
import { useDetailPanel } from "@/lib/detail-panel";

type ArtistLink = { platform: string; monthlyListeners: number; followerCount: number };
type TopArtist = { id: string; name: string; imageUrl: string | null; links: ArtistLink[] };
type TopTrack = {
  id: string; name: string; albumImageUrl: string | null; previewUrl: string | null;
  popularity: number; spotifyUrl: string | null; durationMs: number; explicit: boolean;
  artist: { id: string; name: string };
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function dataSince(dateStr: string | null): string {
  if (!dateStr) return "—";
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""}`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? "s" : ""}`;
}

/* ─── Background floating objects ─── */
type CoverItem = {
  pos: React.CSSProperties;
  rx: number; ry: number; rz: number;
  delay: number; duration: number; amplitude: number;
  opacity: number;
};

// Album cover arts — scattered around content area edges, 3D-tilted
const COVER_ITEMS: CoverItem[] = [
  { pos: { top: "6%",    left: "2%"    }, rx: -14, ry: 22,  rz: -8,  delay: 0,    duration: 6.5, amplitude: 14, opacity: 0.32 },
  { pos: { top: "40%",   left: "0%"    }, rx: 10,  ry: 18,  rz: 5,   delay: 1.2,  duration: 7.2, amplitude: 10, opacity: 0.28 },
  { pos: { bottom: "8%", left: "3%"    }, rx: -8,  ry: 24,  rz: -12, delay: 2.4,  duration: 5.8, amplitude: 16, opacity: 0.30 },
  { pos: { top: "10%",   right: "2%"   }, rx: -12, ry: -20, rz: 9,   delay: 0.5,  duration: 7.8, amplitude: 12, opacity: 0.28 },
  { pos: { top: "55%",   right: "1%"   }, rx: 16,  ry: -18, rz: -6,  delay: 1.8,  duration: 6.2, amplitude: 18, opacity: 0.30 },
  { pos: { bottom: "6%", right: "3%"   }, rx: -6,  ry: -22, rz: 10,  delay: 3.0,  duration: 8.0, amplitude: 10, opacity: 0.24 },
  { pos: { top: "28%",   right: "12%"  }, rx: 18,  ry: 14,  rz: -14, delay: 0.8,  duration: 5.5, amplitude: 20, opacity: 0.22 },
  { pos: { bottom: "22%",left: "10%"   }, rx: 12,  ry: -16, rz: 6,   delay: 2.0,  duration: 7.0, amplitude: 13, opacity: 0.24 },
];

function BgCover({ imageUrl, item }: { imageUrl: string; item: CoverItem }) {
  const size = 140;
  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        ...item.pos,
        animation: `levitate ${item.duration}s ease-in-out ${item.delay}s infinite`,
        ["--amplitude" as string]: `${item.amplitude}px`,
        willChange: "transform",
      }}
    >
      <div
        style={{
          width: size,
          height: size,
          opacity: item.opacity,
          transform: `perspective(700px) rotateX(${item.rx}deg) rotateY(${item.ry}deg) rotateZ(${item.rz}deg)`,
        }}
      >
        <div
          className="w-full h-full rounded-3xl overflow-hidden"
          style={{ boxShadow: "0 24px 70px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.07)", transform: "translateZ(0)", isolation: "isolate" }}
        >
          <Image src={imageUrl} alt="" fill className="object-cover" sizes={`${size}px`} />
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { openArtist } = useDetailPanel();
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [totalArtists, setTotalArtists] = useState(0);
  const [totalTracks, setTotalTracks] = useState(0);
  const [trackingStart, setTrackingStart] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/landing")
      .then((r) => r.json())
      .then((d) => {
        setTopArtists(d.topArtists ?? []);
        setTopTracks(d.topTracks ?? []);
        setTotalArtists(d.totalArtists ?? 0);
        setTotalTracks(d.totalTracks ?? 0);
        setTrackingStart(d.trackingStartedAt ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const sections = [
    { href: "/rankings", icon: Trophy, title: "Rankings", desc: "The definitive ranking of Phonk artists. All platforms.", color: "from-yellow-500/15 to-transparent", iconColor: "text-yellow-400", border: "hover:border-yellow-500/40", glow: "hover:shadow-[0_0_40px_rgba(234,179,8,0.15)]" },
    { href: "/rankings?view=bubbles", icon: BarChart2, title: "Bubbles", desc: "Visualize the scene — every artist as a bubble.", color: "from-[var(--accent)]/15 to-transparent", iconColor: "text-[var(--accent)]", border: "hover:border-[var(--accent)]/40", glow: "hover:shadow-[0_0_40px_var(--accent-glow)]" },
    { href: "/rankings?entity=songs", icon: Music, title: "Trending Songs", desc: "Discover what is hot right now. Popularity and hype trends.", color: "from-green-500/15 to-transparent", iconColor: "text-green-400", border: "hover:border-green-500/40", glow: "hover:shadow-[0_0_40px_rgba(74,222,128,0.15)]" },
    { href: "/samples", icon: Package, title: "Sample Packs", desc: "Browse and share packs from the Phonk community.", color: "from-cyan-500/15 to-transparent", iconColor: "text-cyan-400", border: "hover:border-cyan-500/40", glow: "hover:shadow-[0_0_40px_rgba(34,211,238,0.15)]" },
  ];

  return (
    <>
      <style>{`
        @keyframes levitate {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(calc(var(--amplitude, 12px) * -1)); }
          100% { transform: translateY(0px); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-fade-up { animation: fadeInUp 0.7s ease forwards; opacity: 0; }
      `}</style>

      <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden relative">
        <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.012)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.012)_1px,transparent_1px)] bg-[size:40px_40px] z-0" />
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] rounded-full bg-[var(--accent)] opacity-[0.04] blur-[160px]" />
          <div className="absolute bottom-0 left-1/4 w-[500px] h-[400px] rounded-full bg-purple-700 opacity-[0.04] blur-[140px]" />
        </div>

        {/* Floating 3D background — album covers, clipped to content area */}
        {loaded && topTracks.length > 0 && (() => {
          // Deduplicate by albumImageUrl so the same cover doesn't appear twice
          const seen = new Set<string>();
          const unique = topTracks.filter(t => {
            if (!t.albumImageUrl || seen.has(t.albumImageUrl)) return false;
            seen.add(t.albumImageUrl);
            return true;
          });
          return (
            <div className="absolute inset-0 pointer-events-none z-[1] overflow-hidden">
              {unique.slice(0, COVER_ITEMS.length).map((track, i) => (
                <BgCover key={track.albumImageUrl} imageUrl={track.albumImageUrl!} item={COVER_ITEMS[i]} />
              ))}
            </div>
          );
        })()}

        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-16 md:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <div className="anim-fade-up flex justify-center mb-6" style={{ animationDelay: "0.05s" }}>
              <div className="relative">
                <div className="absolute inset-0 blur-2xl bg-[var(--accent)] opacity-40 rounded-full scale-150" />
                <Flame className="relative w-20 h-20 text-[var(--accent)] drop-shadow-[0_0_40px_var(--accent-glow)]" />
              </div>
            </div>
            <h1 className="anim-fade-up text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter uppercase leading-none" style={{ animationDelay: "0.1s" }}>
              <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-200 to-[var(--accent)]">Phonk Forum</span>
            </h1>
            <p className="anim-fade-up text-[var(--muted-foreground)] mt-5 text-base md:text-xl max-w-xl mx-auto leading-relaxed" style={{ animationDelay: "0.18s" }}>
              The definitive tracker for the Phonk scene. Artists, songs, sample packs — ranked across every platform in real time.
            </p>
            <div className="anim-fade-up flex flex-wrap justify-center gap-3 mt-8" style={{ animationDelay: "0.25s" }}>
              <Link href="/rankings" className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent)] text-white font-black text-sm shadow-[0_0_20px_var(--accent-glow)] hover:shadow-[0_0_35px_var(--accent-glow)] hover:scale-105 transition-all">
                <Trophy className="w-4 h-4" /> View Rankings
              </Link>
              <Link href="/rankings?entity=songs" className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--secondary)] border border-[var(--muted)] text-white font-black text-sm hover:bg-[var(--muted)] hover:border-[var(--accent)]/30 transition-all">
                <TrendingUp className="w-4 h-4" /> Trending Songs
              </Link>
            </div>
          </div>

          <div className="anim-fade-up mt-14 grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl mx-auto" style={{ animationDelay: "0.32s" }}>
            {[
              { icon: Users, value: totalArtists || "—", label: "Artists Tracked" },
              { icon: Music, value: totalTracks ? fmt(totalTracks) : "—", label: "Songs Indexed" },
              { icon: Database, value: "4", label: "Platforms" },
              { icon: Calendar, value: dataSince(trackingStart), label: "Data Collected" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 backdrop-blur-sm px-4 py-4 text-center">
                <s.icon className="w-5 h-5 text-[var(--accent)] mb-0.5" />
                <div className="text-xl md:text-2xl font-black tabular-nums text-white">{s.value}</div>
                <div className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)] font-bold">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="anim-fade-up mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl mx-auto" style={{ animationDelay: "0.4s" }}>
            {sections.map((s) => (
              <Link key={s.href} href={s.href} className={`group relative overflow-hidden rounded-2xl border border-[var(--muted)] ${s.border} bg-[var(--secondary)]/60 backdrop-blur-sm p-4 transition-all hover:bg-[var(--secondary)] ${s.glow}`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2">
                    <s.icon className={`w-6 h-6 ${s.iconColor}`} />
                    <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </div>
                  <h2 className="text-sm font-black mb-0.5">{s.title}</h2>
                  <p className="text-[11px] text-[var(--muted-foreground)] leading-snug hidden md:block">{s.desc}</p>
                </div>
              </Link>
            ))}
          </div>

          {loaded && topArtists.length > 0 && (
            <div className="anim-fade-up mt-12 w-full max-w-2xl mx-auto" style={{ animationDelay: "0.48s" }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-[var(--muted-foreground)] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[var(--accent)]" /> Top Artists
                </h2>
                <Link href="/rankings" className="text-xs font-bold text-[var(--muted-foreground)] hover:text-white flex items-center gap-1 transition-colors">
                  Full Rankings <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              <div className="flex gap-2 flex-wrap">
                {topArtists.slice(0, 10).map((artist, i) => {
                  const listeners = artist.links.find((l) => l.platform === "SPOTIFY")?.monthlyListeners ?? 0;
                  return (
                    <button key={artist.id} onClick={() => openArtist(artist.id)} className="group flex items-center gap-2 rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/60 hover:border-[var(--accent)]/40 hover:bg-[var(--muted)] px-3 py-2 transition-all cursor-pointer">
                      <div className="relative shrink-0">
                        {artist.imageUrl ? (
                          <Image src={artist.imageUrl} alt={artist.name} width={28} height={28} className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center text-xs font-black">{artist.name.charAt(0)}</div>
                        )}
                        <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-[var(--accent)] text-[8px] font-black text-white flex items-center justify-center">{i + 1}</span>
                      </div>
                      <div className="text-left">
                        <div className="text-xs font-bold text-white group-hover:text-[var(--accent)] transition-colors truncate max-w-[90px]">{artist.name}</div>
                        {listeners > 0 && <div className="text-[10px] text-[var(--muted-foreground)] tabular-nums">{fmt(listeners)}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="anim-fade-up mt-8 text-center" style={{ animationDelay: "0.55s" }}>
            <p className="text-xs text-[var(--muted-foreground)]">
              Share artists via{" "}
              {topArtists[0] ? (
                <Link href={`/${slugify(topArtists[0].name)}`} className="text-[var(--accent)] hover:underline font-bold">/{slugify(topArtists[0].name)}</Link>
              ) : (
                <span className="text-[var(--accent)] font-bold">/artistname</span>
              )}
            </p>
          </div>
        </div>
      </main>
    </>
  );
}
