"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Flame,
  Trophy,
  Music,
  Package,
  Circle,
  ArrowRight,
  TrendingUp,
  Users,
} from "lucide-react";

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

export default function HomePage() {
  const [topArtists, setTopArtists] = useState<Artist[]>([]);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    fetch("/api/artists?take=10")
      .then((r) => r.json())
      .then((data) => {
        setTopArtists(data.artists ?? []);
        setTotalCount(data.totalCount ?? 0);
      })
      .catch(() => {});
  }, []);

  const sections = [
    {
      href: "/rankings",
      icon: Trophy,
      title: "Rankings",
      desc: "The definitive ranking of Phonk artists and songs. List view, bubble visualization, all platforms.",
      color: "from-yellow-500/20 to-transparent",
      iconColor: "text-yellow-400",
      borderHover: "hover:border-yellow-500/40",
    },
    {
      href: "/rankings?view=bubbles",
      icon: Circle,
      title: "Bubbles",
      desc: "Visualize the Phonk scene at a glance -- every artist as a bubble sized by their metrics.",
      color: "from-[var(--accent)]/20 to-transparent",
      iconColor: "text-[var(--accent)]",
      borderHover: "hover:border-[var(--accent)]/40",
    },
    {
      href: "/rankings?entity=songs",
      icon: Music,
      title: "Trending Songs",
      desc: "Discover what's hot right now in the Phonk world. Popularity and hype trends.",
      color: "from-green-500/20 to-transparent",
      iconColor: "text-green-400",
      borderHover: "hover:border-green-500/40",
    },
    {
      href: "/samples",
      icon: Package,
      title: "Sample Packs",
      desc: "Browse and share sample packs from the community. Find the sounds that shape the genre.",
      color: "from-cyan-500/20 to-transparent",
      iconColor: "text-cyan-400",
      borderHover: "hover:border-cyan-500/40",
    },
  ];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans overflow-hidden relative">
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      {/* Hero */}
      <section className="relative py-20 md:py-32 px-4">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[var(--accent)] opacity-[0.06] blur-[120px]" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="flex justify-center mb-6">
            <Flame className="w-16 h-16 md:w-20 md:h-20 text-[var(--accent)] drop-shadow-[0_0_30px_var(--accent-glow)]" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase">
            <span className="text-transparent bg-clip-text bg-gradient-to-br from-white via-zinc-300 to-[var(--accent)]">
              Phonk Forum
            </span>
          </h1>
          <p className="text-[var(--muted-foreground)] mt-4 text-lg md:text-xl max-w-2xl mx-auto">
            The home of Phonk. Rankings, bubbles, trending songs, sample packs &mdash; everything the scene needs, in one place.
          </p>

          {/* Quick stats */}
          <div className="flex justify-center gap-8 mt-8">
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-black">{totalCount || "\u2014"}</div>
              <div className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] font-bold mt-1">Artists Ranked</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-black">4</div>
              <div className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] font-bold mt-1">Platforms</div>
            </div>
            <div className="text-center">
              <div className="text-2xl md:text-3xl font-black text-[var(--accent)]">
                <Flame className="w-6 h-6 md:w-8 md:h-8 inline" />
              </div>
              <div className="text-xs uppercase tracking-widest text-[var(--muted-foreground)] font-bold mt-1">Community</div>
            </div>
          </div>
        </div>
      </section>

      {/* Section Cards */}
      <section className="px-4 pb-12 relative z-10">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className={`group relative overflow-hidden rounded-2xl border border-[var(--muted)] ${s.borderHover} bg-[var(--secondary)]/60 p-6 transition-all hover:bg-[var(--secondary)]`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${s.color} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <s.icon className={`w-8 h-8 ${s.iconColor}`} />
                  <ArrowRight className="w-5 h-5 text-[var(--muted-foreground)] group-hover:text-white group-hover:translate-x-1 transition-all" />
                </div>
                <h2 className="text-xl font-black mb-1">{s.title}</h2>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Top Artists Preview */}
      {topArtists.length > 0 && (
        <section className="px-4 pb-20 relative z-10">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black flex items-center gap-3">
                <TrendingUp className="w-6 h-6 text-[var(--accent)]" />
                Top Artists
              </h2>
              <Link
                href="/rankings"
                className="text-sm font-bold text-[var(--muted-foreground)] hover:text-white flex items-center gap-1 transition-colors"
              >
                View Full Rankings <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {topArtists.slice(0, 10).map((artist, i) => {
                const spotifyLink = artist.links.find((l) => l.platform === "SPOTIFY");
                return (
                  <Link
                    key={artist.id}
                    href={`/artist/${artist.id}`}
                    className="group flex flex-col items-center gap-2 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 hover:bg-[var(--muted)] p-4 transition-all text-center"
                  >
                    <div className="relative">
                      <span className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-[var(--accent)] text-white text-xs font-black flex items-center justify-center shadow-lg">
                        {i + 1}
                      </span>
                      {artist.imageUrl ? (
                        <Image
                          src={artist.imageUrl}
                          alt={artist.name}
                          width={72}
                          height={72}
                          className="w-16 h-16 md:w-18 md:h-18 rounded-full object-cover border-2 border-[var(--muted)] group-hover:border-[var(--accent)] transition-colors"
                        />
                      ) : (
                        <div className="w-16 h-16 md:w-18 md:h-18 rounded-full bg-[var(--muted)] flex items-center justify-center border-2 border-[var(--muted)]">
                          <span className="font-black text-lg text-[var(--muted-foreground)]">
                            {artist.name.charAt(0)}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="font-bold text-sm truncate max-w-full group-hover:text-[var(--accent)] transition-colors">
                      {artist.name}
                    </div>
                    {spotifyLink && spotifyLink.monthlyListeners > 0 && (
                      <div className="text-xs text-[var(--muted-foreground)] tabular-nums">
                        {formatCount(spotifyLink.monthlyListeners)} listeners
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
