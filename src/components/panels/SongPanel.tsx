"use client";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { toPreviewProxyUrl } from "@/lib/preview";
import { claimAudio } from "@/lib/global-audio";
import { fetchJsonWithSessionCache } from "@/lib/client-cache";
import {
  Music, Play, Pause, User, X, TrendingUp, ArrowUpRight, ArrowDownRight, Loader2,
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

const NEW_RELEASE_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

function isRecentRelease(releaseDate: string | null | undefined) {
  if (!releaseDate) return false;
  const parsed = Date.parse(releaseDate);
  if (Number.isNaN(parsed)) return false;
  const age = Date.now() - parsed;
  return age >= 0 && age <= NEW_RELEASE_WINDOW_MS;
}

/* ── platform icons ── */
function SpotifyIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>;
}

/* ── types ── */
type ArtistInfo = { id: string; name: string; imageUrl: string | null };
type SongData = {
  id: string; name: string; albumName: string | null; albumImageUrl: string | null;
  previewUrl: string | null; deezerUrl: string | null; deezerId: string | null;
  spotifyUrl: string | null; durationMs: number; popularity: number; explicit: boolean;
  releaseDate: string | null; primaryVersion?: string; featuredArtists: string[];
  artist: ArtistInfo;
  allArtists?: ArtistInfo[];
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
  const [fetched, setFetched] = useState<SongData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [snaps, setSnaps] = useState<TrackSnap[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");

  useEffect(() => { setPlaying(false); setFetched(null); setLoadError(false); }, [id]);

  // Self-load song data when not provided inline
  useEffect(() => {
    if (data || !id) return;
    fetchJsonWithSessionCache<SongData>(`song:${id}:detail`, `/api/songs/${id}`, 120_000)
      .then(d => { if (d) setFetched(d); else setLoadError(true); })
      .catch(() => setLoadError(true));
  }, [id, data]);

  useEffect(() => {
    if (!id) return;
    fetchJsonWithSessionCache<TrackSnap[]>(`song:${id}:snaps:${chartPeriod}:v2`, `/api/songs/${id}/snapshots?period=${chartPeriod}`, 120_000).then(d => setSnaps(d ?? [])).catch(() => {});
  }, [id, chartPeriod]);

  const song = data ?? fetched;

  if (!song && loadError) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3"><Music className="w-10 h-10 text-[var(--muted-foreground)]" /><p className="text-sm font-bold text-[var(--muted-foreground)]">Song not found</p></div>
  );
  if (!song) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3"><Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" /><p className="text-sm font-bold text-[var(--muted-foreground)]">Loading song…</p></div>
  );

  async function togglePlay() {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { try { claimAudio(a); await a.play(); setPlaying(true); } catch { setPlaying(false); } }
  }

  const chartPoints: ChartPoint[] = snaps.map(s => ({ value: s.popularity, date: s.createdAt }));
  const lastVal = song.popularity;
  const changePercent = chartPoints.length >= 2 ? ((chartPoints[chartPoints.length-1].value - chartPoints[0].value) / Math.max(1, chartPoints[0].value)) * 100 : null;
  const periodOpts: { key: ChartPeriod; label: string }[] = [{ key: "week", label: "7d" }, { key: "month", label: "30d" }, { key: "year", label: "1y" }];
  const isNewSong = isRecentRelease(song.releaseDate);

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-[#08080c]">

      {/* ── HERO: tall blurred backdrop + large centered cover ── */}
      <div className="relative shrink-0">
        <div className="relative h-32 overflow-hidden">
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
        <div className="relative z-10 flex flex-col items-center -mt-28 px-5">
          <div className="relative group">
            <div className="w-56 h-56 rounded-2xl overflow-hidden ring-2 ring-white/15 shadow-[0_16px_60px_rgba(0,0,0,0.8)] shrink-0">
              {song.albumImageUrl ? (
                <Image src={song.albumImageUrl} alt={song.albumName ?? ""} width={224} height={224} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[var(--secondary)] flex items-center justify-center"><Music className="w-16 h-16 text-[var(--muted-foreground)]" /></div>
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

          {/* Song title */}
          <div className="text-center mt-4 w-full">
              <div className="flex items-center justify-center gap-2">
                <h2 className="text-xl font-black tracking-tight leading-tight line-clamp-2">{song.name}</h2>
                {isNewSong && <span className="shrink-0 rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.22em] text-amber-200">NEW</span>}
              </div>
            {song.primaryVersion && <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-white/[0.08] text-[10px] font-bold text-white/50 uppercase tracking-wider">{song.primaryVersion}</span>}
            {/* Meta row: duration, release, explicit */}
            <div className="flex items-center justify-center gap-3 mt-2 text-[10px] text-white/35 font-medium">
              <span>{fmtDur(song.durationMs)}</span>
                {song.releaseDate && <><span className="w-px h-3 bg-white/10" /><span>{fmtDate(song.releaseDate)}</span></>}
              {song.explicit && <><span className="w-px h-3 bg-white/10" /><span className="font-black text-white/45 border border-white/15 px-1.5 py-px rounded text-[8px]">E</span></>}
            </div>
          </div>

          {/* Spotify link */}
          {song.spotifyUrl && (
            <a href={song.spotifyUrl} target="_blank" rel="noopener noreferrer" className="mt-3 w-9 h-9 rounded-full bg-white/[0.07] border border-white/[0.08] flex items-center justify-center hover:bg-white/15 transition-all" title="Open in Spotify">
              <SpotifyIcon className="w-4 h-4 text-[#1DB954]" />
            </a>
          )}
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

        {/* ARTISTS */}
        <div className="mx-4 mt-3">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Artists</h3>
          <div className="space-y-1.5">
            {(song.allArtists ?? [song.artist]).map(a => (
              <button key={a.id} onClick={() => openArtist(a.id)} className="w-full flex items-center gap-3 rounded-xl border border-[var(--muted)]/35 bg-white/[0.025] p-2.5 hover:bg-white/[0.06] hover:border-[var(--accent)]/30 transition-all text-left group">
                {a.imageUrl ? (
                  <Image src={a.imageUrl} alt={a.name} width={40} height={40} className="w-10 h-10 rounded-full object-cover shrink-0 ring-1 ring-white/10 group-hover:ring-[var(--accent)]/40 transition-all" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center shrink-0"><User className="w-4 h-4 text-white/30" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold truncate group-hover:text-[var(--accent)] transition-colors">{a.name}</div>
                  <div className="text-[10px] text-white/30">View profile</div>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-white/15 group-hover:text-[var(--accent)]/60 shrink-0 transition-colors" />
              </button>
            ))}
            {/* Featured artists without profiles */}
            {song.featuredArtists.map(name => (
              <div key={name} className="w-full flex items-center gap-3 rounded-xl border border-[var(--muted)]/20 bg-white/[0.015] p-2.5 text-left">
                <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center shrink-0"><User className="w-4 h-4 text-white/20" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/50 truncate">{name}</div>
                  <div className="text-[10px] text-white/20">Featured</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  );
}
