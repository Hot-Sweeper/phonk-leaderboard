"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { toPreviewProxyUrl } from "@/lib/preview";
import { claimAudio } from "@/lib/global-audio";
import { fetchJsonWithSessionCache } from "@/lib/client-cache";
import {
  Music, Play, Pause, ExternalLink, User, X, TrendingUp, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useDetailPanel } from "@/lib/detail-panel";

/* ── helpers ── */
function fmtDur(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtPop(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── platform icons ── */
function SpotifyIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>;
}
function DeezerIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.027h5.189V8.38H6.27zm12.54 0v3.027H24V8.38h-5.19zM6.27 12.594v3.027h5.189v-3.027H6.27zm6.27 0v3.027h5.19v-3.027h-5.19zm6.27 0v3.027H24v-3.027h-5.19zM0 16.81v3.029h5.19v-3.03H0zm6.27 0v3.029h5.189v-3.03H6.27zm6.27 0v3.029h5.19v-3.03h-5.19zm6.27 0v3.029H24v-3.03h-5.19z"/></svg>;
}

/* ── types ── */
type SongData = {
  id: string; name: string; albumName: string | null; albumImageUrl: string | null;
  previewUrl: string | null; deezerUrl: string | null; deezerId: string | null;
  spotifyUrl: string | null; durationMs: number; popularity: number; explicit: boolean;
  releaseDate: string | null; primaryVersion?: string; featuredArtists: string[];
  artist: { id: string; name: string; imageUrl: string | null };
};
type TrackSnap = { popularity: number; createdAt: string };
type ChartPeriod = "week" | "month" | "year";
type ChartPoint = { value: number; date: string };

/* ── spark chart ── */
function SparkChart({ id, points, height = 80 }: { id: string; points: ChartPoint[]; height?: number }) {
  if (points.length < 2) return <div className="flex items-center justify-center opacity-40" style={{ height }}><span className="text-[11px] text-[var(--muted-foreground)]">Not enough history</span></div>;
  const W = 400, H = height, pad = { t: 6, r: 2, b: 20, l: 2 };
  const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
  const vals = points.map(p => p.value);
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = hi - lo || 1;
  const nx = (i: number) => pad.l + (i / (points.length - 1)) * cw;
  const ny = (v: number) => pad.t + ch - ((v - lo) / rng) * ch;
  const pts: [number, number][] = points.map((p, i) => [nx(i), ny(p.value)]);
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) { const cx_ = pts[i-1][0] + (pts[i][0]-pts[i-1][0])*0.5; d += ` C${cx_},${pts[i-1][1]} ${cx_},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`; }
  const lx = pts[pts.length-1][0], ly = pts[pts.length-1][1];
  const area = `${d} L${lx},${H-pad.b} L${pad.l},${H-pad.b}Z`;
  const up = vals[vals.length-1] >= vals[0]; const col = up ? "#4ade80" : "#f87171";
  const gid = `sp-${id.slice(-6)}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.25" /><stop offset="100%" stopColor={col} stopOpacity="0.02" /></linearGradient></defs>
      <line x1={pad.l} y1={pad.t+ch*0.5} x2={W-pad.r} y2={pad.t+ch*0.5} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      <path d={area} fill={`url(#${gid})`} /><path d={d} fill="none" stroke={col} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill={col} />
      <text x={pad.l+2} y={H-3} fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="system-ui">{fmtDate(points[0].date)}</text>
      <text x={W-pad.r-2} y={H-3} fill="rgba(255,255,255,0.25)" fontSize="8" fontFamily="system-ui" textAnchor="end">{fmtDate(points[points.length-1].date)}</text>
    </svg>
  );
}

/* ── MAIN ── */
export default function SongPanel({ id, data }: { id: string; data?: SongData }) {
  const { close, openArtist } = useDetailPanel();
  const song = data ?? null;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [snaps, setSnaps] = useState<TrackSnap[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");

  useEffect(() => { setPlaying(false); }, [id]);

  useEffect(() => {
    if (!id) return;
    fetchJsonWithSessionCache<TrackSnap[]>(`song:${id}:snaps:${chartPeriod}`, `/api/songs/${id}/snapshots?period=${chartPeriod}`, 120_000).then(d => setSnaps(d ?? [])).catch(() => {});
  }, [id, chartPeriod]);

  if (!song) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3"><Music className="w-10 h-10 text-[var(--muted-foreground)]" /><p className="text-sm font-bold text-[var(--muted-foreground)]">Select a song</p></div>
  );

  async function togglePlay() {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { try { claimAudio(a); await a.play(); setPlaying(true); } catch { setPlaying(false); } }
  }

  const chartPoints: ChartPoint[] = snaps.map(s => ({ value: s.popularity, date: s.createdAt }));
  const lastVal = chartPoints.length > 0 ? chartPoints[chartPoints.length-1].value : song.popularity;
  const changePercent = chartPoints.length >= 2 ? ((chartPoints[chartPoints.length-1].value - chartPoints[0].value) / Math.max(1, chartPoints[0].value)) * 100 : null;
  const periodOpts: { key: ChartPeriod; label: string }[] = [{ key: "week", label: "7d" }, { key: "month", label: "30d" }, { key: "year", label: "1y" }];

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-[#08080c]">

      {/* ── HERO: tall blurred backdrop + large centered cover ── */}
      <div className="relative shrink-0">
        <div className="relative h-52 overflow-hidden">
          {song.albumImageUrl ? (
            <Image src={song.albumImageUrl} alt="" fill className="object-cover scale-[1.6] blur-3xl opacity-50" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/25 to-transparent" />
          )}
          {/* Long gradient fade */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-black/20 to-[#08080c]" />
          <button onClick={close} className="absolute top-3 right-3 w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/60 hover:text-white z-10 transition-colors" aria-label="Close"><X className="w-3.5 h-3.5" /></button>
        </div>

        {/* Album cover - large, centered, overlapping the fade */}
        <div className="relative z-10 flex flex-col items-center -mt-24 px-5">
          <div className="relative group">
            <div className="w-40 h-40 rounded-2xl overflow-hidden ring-2 ring-white/15 shadow-[0_16px_60px_rgba(0,0,0,0.8)] shrink-0">
              {song.albumImageUrl ? (
                <Image src={song.albumImageUrl} alt={song.albumName ?? ""} width={160} height={160} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[var(--secondary)] flex items-center justify-center"><Music className="w-12 h-12 text-[var(--muted-foreground)]" /></div>
              )}
            </div>
            {/* Play button overlaid on cover */}
            {song.previewUrl && (
              <>
                <audio ref={audioRef} src={toPreviewProxyUrl(song.previewUrl, song.deezerId)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} preload="none" />
                <button onClick={togglePlay} className={`absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-xl ${playing ? "bg-[var(--accent)] text-white shadow-[0_0_16px_var(--accent-glow)] scale-110" : "bg-black/70 backdrop-blur-sm text-white/80 border border-white/20 opacity-0 group-hover:opacity-100 hover:bg-[var(--accent)] hover:text-white hover:border-[var(--accent)]"}`} aria-label={playing ? "Pause preview" : "Play preview"}>
                  {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>
              </>
            )}
          </div>

          {/* Song title + artist */}
          <div className="text-center mt-4 w-full">
            <h2 className="text-xl font-black tracking-tight leading-tight line-clamp-2">{song.name}</h2>
            {song.primaryVersion && <p className="text-[10px] text-white/40 mt-0.5">{song.primaryVersion}</p>}
            <div className="flex flex-wrap items-center justify-center gap-x-1 mt-1.5">
              <button onClick={() => openArtist(song.artist.id)} className="text-sm text-[var(--accent)] hover:text-white font-bold transition-colors">{song.artist.name}</button>
              {song.featuredArtists.map(name => (
                <span key={name} className="text-xs text-white/30">, {name}</span>
              ))}
            </div>
            {/* Meta row: duration, release, explicit */}
            <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-white/35 font-medium">
              <span>{fmtDur(song.durationMs)}</span>
              {song.releaseDate && <><span className="w-px h-3 bg-white/10" /><span>{song.releaseDate}</span></>}
              {song.explicit && <><span className="w-px h-3 bg-white/10" /><span className="font-black text-white/45 border border-white/15 px-1.5 py-px rounded text-[8px]">E</span></>}
              {song.albumName && <><span className="w-px h-3 bg-white/10" /><span className="truncate max-w-[120px]">{song.albumName}</span></>}
            </div>
          </div>

          {/* Platform links as icons */}
          <div className="flex items-center gap-2 mt-3">
            {song.spotifyUrl && (
              <a href={song.spotifyUrl} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/[0.07] border border-white/[0.08] flex items-center justify-center hover:bg-white/15 transition-all" title="Open in Spotify">
                <SpotifyIcon className="w-4 h-4 text-[#1DB954]" />
              </a>
            )}
            {song.deezerUrl && (
              <a href={song.deezerUrl} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-full bg-white/[0.07] border border-white/[0.08] flex items-center justify-center hover:bg-white/15 transition-all" title="Open in Deezer">
                <DeezerIcon className="w-4 h-4 text-[#A238FF]" />
              </a>
            )}
          </div>
        </div>

        <div className="h-4" />
      </div>

      {/* ── SCROLLABLE BODY ── */}
      <div className="relative z-10 flex-1 overflow-y-auto">

        {/* CHART */}
        <div className="mx-4 rounded-2xl border border-[var(--muted)]/40 bg-white/[0.025] overflow-hidden">
          <div className="flex items-start justify-between px-4 pt-3 pb-0.5">
            <div>
              <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--muted-foreground)] mb-0.5 flex items-center gap-1"><TrendingUp className="w-2.5 h-2.5" /> Popularity</div>
              <div className="text-2xl font-black leading-none tabular-nums">{fmtPop(lastVal)}</div>
              {changePercent !== null && <div className={`text-[10px] font-bold mt-0.5 flex items-center gap-0.5 ${changePercent >= 0 ? "text-green-400" : "text-red-400"}`}>{changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{changePercent >= 0 ? "+" : ""}{changePercent.toFixed(1)}%</div>}
            </div>
            <div className="flex gap-0.5">
              {periodOpts.map(p => <button key={p.key} onClick={() => setChartPeriod(p.key)} className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${chartPeriod === p.key ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "text-[var(--muted-foreground)] hover:text-white"}`}>{p.label}</button>)}
            </div>
          </div>
          <div className="px-1 pb-1"><SparkChart id={id} points={chartPoints} height={80} /></div>
        </div>

        {/* ARTIST CARD - circular avatar */}
        <div className="mx-4 mt-3">
          <button onClick={() => openArtist(song.artist.id)} className="w-full flex items-center gap-3 rounded-xl border border-[var(--muted)]/35 bg-white/[0.025] p-3 hover:bg-white/[0.05] hover:border-[var(--muted)]/50 transition-all text-left">
            {song.artist.imageUrl ? (
              <Image src={song.artist.imageUrl} alt={song.artist.name} width={44} height={44} className="w-11 h-11 rounded-full object-cover shrink-0 ring-1 ring-white/10" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0"><User className="w-4 h-4 text-white/30" /></div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-black truncate">{song.artist.name}</div>
              <div className="text-[10px] text-[var(--accent)] mt-0.5">View profile</div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-white/20 shrink-0" />
          </button>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
