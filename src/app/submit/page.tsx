"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import {
  Music,
  Search,
  Loader2,
  Play,
  Pause,
  Send,
  Check,
  Tag,
  ExternalLink,
  Clock,
  Plus,
  X,
  UserPlus,
  Package,
  Link,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TrackInfo = {
  title: string;
  artist: string;
  artworkUrl: string | null;
  duration: number;
  genre: string;
  description: string;
  permalinkUrl: string;
  embedHtml: string | null;
};

type Label = {
  id: string;
  name: string;
  email: string;
  iconUrl: string | null;
  color: string;
  active: boolean;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/*  Inline Player Bar                                                  */
/* ------------------------------------------------------------------ */

function PlayerBar({ track }: { track: TrackInfo }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<SC.SoundCloudWidget | null>(null);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(track.duration);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    if (!iframeRef.current || typeof window === "undefined") return;
    setPlayerReady(false);

    const initWidget = () => {
      const SC = (window as unknown as { SC: SC.SoundCloudAPI }).SC;
      const widget = SC.Widget(iframeRef.current!);
      widgetRef.current = widget;

      widget.bind(SC.Widget.Events.READY, () => {
        widget.getDuration((d: number) => {
          if (d > 0) setDuration(d);
        });
        setPlayerReady(true);
      });

      widget.bind(SC.Widget.Events.PLAY, () => setIsPlaying(true));
      widget.bind(SC.Widget.Events.PAUSE, () => setIsPlaying(false));
      widget.bind(
        SC.Widget.Events.PLAY_PROGRESS,
        (data: { currentPosition: number; relativePosition: number }) => {
          if (!isDragging.current) {
            setProgress(data.relativePosition * 100);
            setCurrentTime(data.currentPosition);
          }
        }
      );
    };

    if ((window as unknown as { SC?: { Widget: unknown } }).SC?.Widget) {
      initWidget();
    } else {
      const checkSC = setInterval(() => {
        if ((window as unknown as { SC?: { Widget: unknown } }).SC?.Widget) {
          clearInterval(checkSC);
          initWidget();
        }
      }, 100);
      return () => clearInterval(checkSC);
    }
  }, [track.permalinkUrl]);

  const togglePlay = () => widgetRef.current?.toggle();

  const seekTo = useCallback(
    (clientX: number) => {
      if (!progressBarRef.current || !widgetRef.current || duration <= 0)
        return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const pct = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width)
      );
      setProgress(pct * 100);
      setCurrentTime(pct * duration);
      widgetRef.current.seekTo(pct * duration);
    },
    [duration]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      seekTo(e.clientX);
      const handleMove = (ev: MouseEvent) => seekTo(ev.clientX);
      const handleUp = () => {
        isDragging.current = false;
        window.removeEventListener("mousemove", handleMove);
        window.removeEventListener("mouseup", handleUp);
      };
      window.addEventListener("mousemove", handleMove);
      window.addEventListener("mouseup", handleUp);
    },
    [seekTo]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isDragging.current = true;
      seekTo(e.touches[0].clientX);
      const handleMove = (ev: TouchEvent) => seekTo(ev.touches[0].clientX);
      const handleEnd = () => {
        isDragging.current = false;
        window.removeEventListener("touchmove", handleMove);
        window.removeEventListener("touchend", handleEnd);
      };
      window.addEventListener("touchmove", handleMove);
      window.addEventListener("touchend", handleEnd);
    },
    [seekTo]
  );

  return (
    <>
      <iframe
        ref={iframeRef}
        className="hidden"
        width="100%"
        height="166"
        allow="autoplay; encrypted-media"
        loading="eager"
        src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(track.permalinkUrl)}&color=%2300ccff&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false`}
      />

      {/* Spotify-style track row */}
      <div className="flex items-center gap-3 group">
        <button
          onClick={togglePlay}
          disabled={!playerReady}
          className="w-10 h-10 shrink-0 rounded-full bg-[#1DB954] flex items-center justify-center hover:scale-105 hover:bg-[#1ed760] transition-all disabled:opacity-40 disabled:hover:scale-100 shadow-lg"
        >
          {!playerReady ? (
            <Loader2 className="w-4 h-4 text-black animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4 text-black" />
          ) : (
            <Play className="w-4 h-4 text-black ml-0.5" />
          )}
        </button>

        {/* Progress */}
        <div className="flex-1 flex items-center gap-2">
          <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums w-9 text-right shrink-0">
            {formatDuration(currentTime)}
          </span>
          <div
            ref={progressBarRef}
            className="group/bar relative flex-1 h-1 rounded-full bg-white/10 cursor-pointer hover:h-1.5 transition-all"
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
          >
            <div
              className="absolute inset-y-0 left-0 bg-white rounded-full group-hover/bar:bg-[#1DB954] transition-colors"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-white shadow opacity-0 group-hover/bar:opacity-100 transition-opacity"
              style={{ left: `${progress}%` }}
            />
          </div>
          <span className="text-[11px] text-[var(--muted-foreground)] tabular-nums w-9 shrink-0">
            {duration > 0 ? formatDuration(duration) : "--:--"}
          </span>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

// Preload SC Widget API as early as possible (module scope)
if (typeof window !== "undefined" && !document.getElementById("sc-widget-api")) {
  const s = document.createElement("script");
  s.id = "sc-widget-api";
  s.src = "https://w.soundcloud.com/player/api.js";
  s.async = true;
  document.head.appendChild(s);
}

export default function SubmitPage() {
  const { data: session } = useSession();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [artLoaded, setArtLoaded] = useState(false);

  const [labels, setLabels] = useState<Label[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [labelsLoading, setLabelsLoading] = useState(true);

  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [collabInput, setCollabInput] = useState("");

  const [customMessage, setCustomMessage] = useState("");
  const [samplePackUrl, setSamplePackUrl] = useState("");

  // Inline-editable overrides
  const [editedTitle, setEditedTitle] = useState<string | null>(null);
  const [editedGenre, setEditedGenre] = useState<string | null>(null);
  const [releaseType, setReleaseType] = useState("Single");

  const titleRef = useRef<HTMLDivElement>(null);
  const genreRef = useRef<HTMLSpanElement>(null);

  const userName = session?.user?.name || "You";
  const userImage = session?.user?.image || null;

  const allArtists = [userName, ...collaborators];

  // Derived editable values
  const displayTitle = editedTitle ?? track?.title ?? "";
  const displayGenre = editedGenre ?? track?.genre ?? "";

  useEffect(() => {
    fetch("/api/labels")
      .then((r) => r.json())
      .then((data) => setLabels(data))
      .catch(() => {})
      .finally(() => setLabelsLoading(false));
  }, []);

  // Sync contentEditable elements when track changes
  useEffect(() => {
    if (track && titleRef.current) {
      titleRef.current.textContent = track.title;
    }
    if (track && genreRef.current) {
      genreRef.current.textContent = track.genre || "Genre";
    }
  }, [track]);

  const addCollaborator = () => {
    const name = collabInput.trim();
    if (!name || collaborators.includes(name)) return;
    setCollaborators((prev) => [...prev, name]);
    setCollabInput("");
  };

  const removeCollaborator = (name: string) => {
    setCollaborators((prev) => prev.filter((c) => c !== name));
  };

  const handleFetch = useCallback(async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    setTrack(null);
    setArtLoaded(false);
    setEditedTitle(null);
    setEditedGenre(null);
    setReleaseType("Single");
    setSamplePackUrl("");

    try {
      const res = await fetch("/api/soundcloud/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to fetch track");
        return;
      }
      setTrack(data);
    } catch {
      setError("Failed to fetch track");
    } finally {
      setLoading(false);
    }
  }, [url]);

  const toggleLabel = (id: string) => {
    setSelectedLabels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = () => {
    if (!track || selectedLabels.size === 0) return;

    const selected = labels.filter((l) => selectedLabels.has(l.id));
    const emails = selected.map((l) => l.email).join(",");
    const labelNames = selected.map((l) => l.name).join(", ");

    const artistLine = allArtists.join(", ");

    const subject = encodeURIComponent(
      `Demo Submission: ${artistLine} - ${displayTitle}`
    );
    const body = encodeURIComponent(
      `Hi ${labelNames},\n\n` +
        `I'd like to submit my track for your consideration.\n\n` +
        `Track: ${displayTitle}\n` +
        `Artist${allArtists.length > 1 ? "s" : ""}: ${artistLine}\n` +
        `SoundCloud: ${track.permalinkUrl}\n` +
        (displayGenre ? `Genre: ${displayGenre}\n` : "") +
        (samplePackUrl ? `Sample Pack: ${samplePackUrl}\n` : "") +
        (customMessage ? `\n${customMessage}\n` : "") +
        `\nSent via Phonk Forum (phonk.forum)\n` +
        `Best regards`
    );

    window.open(`mailto:${emails}?subject=${subject}&body=${body}`, "_self");
  };

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans relative">
      <link rel="preconnect" href="https://w.soundcloud.com" />
      <link rel="preconnect" href="https://api-v2.soundcloud.com" />
      <link rel="dns-prefetch" href="https://w.soundcloud.com" />

      {/* ── Search bar (always visible) ── */}
      <div className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-xl border-b border-[var(--muted)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              placeholder="Paste a SoundCloud link..."
              className="w-full pl-9 pr-3 py-2 rounded-full bg-[var(--secondary)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50"
            />
          </div>
          <button
            onClick={handleFetch}
            disabled={loading || !url.trim()}
            className="px-5 py-2 rounded-full bg-white text-black text-sm font-bold hover:scale-105 transition-all disabled:opacity-40 disabled:hover:scale-100 flex items-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            Fetch
          </button>
        </div>
        {error && (
          <div className="max-w-4xl mx-auto px-4 pb-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {!track && !loading && (
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <div className="w-40 h-40 rounded-2xl bg-[var(--secondary)] flex items-center justify-center mb-6 shadow-2xl">
            <Music className="w-16 h-16 text-[var(--muted-foreground)] opacity-30" />
          </div>
          <h2 className="text-xl font-bold mb-2">Submit your demo</h2>
          <p className="text-sm text-[var(--muted-foreground)] text-center max-w-sm">
            Paste a SoundCloud link above to preview your track and send it to
            labels.
          </p>
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-32 px-4">
          <Loader2 className="w-12 h-12 text-[var(--muted-foreground)] animate-spin mb-4" />
          <p className="text-sm text-[var(--muted-foreground)]">
            Fetching track...
          </p>
        </div>
      )}

      {/* ── Release page ── */}
      {track && (
        <div className="max-w-4xl mx-auto">
          {/* Hero: gradient backdrop + artwork + info */}
          <div className="relative overflow-hidden">
            {/* Blurred background from artwork */}
            {track.artworkUrl && (
              <div className="absolute inset-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={track.artworkUrl}
                  alt=""
                  className="w-full h-full object-cover scale-110 blur-3xl opacity-30"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--background)]/60 to-[var(--background)]" />
              </div>
            )}

            <div className="relative flex flex-col sm:flex-row items-end gap-6 p-6 pt-12 sm:pt-16">
              {/* Large artwork */}
              <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-lg overflow-hidden shadow-2xl shrink-0 bg-[var(--secondary)] mx-auto sm:mx-0">
                {track.artworkUrl ? (
                  <>
                    {!artLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-[var(--muted-foreground)] animate-spin" />
                      </div>
                    )}
                    <Image
                      src={track.artworkUrl}
                      alt={displayTitle}
                      fill
                      className={`object-cover transition-opacity duration-300 ${artLoaded ? "opacity-100" : "opacity-0"}`}
                      sizes="256px"
                      unoptimized
                      onLoad={() => setArtLoaded(true)}
                    />
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Music className="w-16 h-16 text-[var(--muted-foreground)] opacity-20" />
                  </div>
                )}
              </div>

              {/* Track meta — Spotify release style (inline-editable) */}
              <div className="flex-1 text-center sm:text-left pb-2">
                {/* Release type — dropdown that looks like plain text */}
                <select
                  value={releaseType}
                  onChange={(e) => setReleaseType(e.target.value)}
                  className="text-[11px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest mb-1 bg-transparent outline-none cursor-pointer appearance-none hover:text-white transition-colors"
                >
                  <option value="Single" className="bg-[#181818] text-white">Single</option>
                  <option value="EP" className="bg-[#181818] text-white">EP</option>
                  <option value="Album" className="bg-[#181818] text-white">Album</option>
                  <option value="Mixtape" className="bg-[#181818] text-white">Mixtape</option>
                </select>

                {/* Title — contentEditable, looks identical to display */}
                <div
                  ref={titleRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={(e) => setEditedTitle(e.currentTarget.textContent || "")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className="text-3xl sm:text-6xl font-black tracking-tight leading-none mb-4 outline-none cursor-text rounded-md focus:ring-1 focus:ring-white/20 transition-shadow"
                >
                  {track.title}
                </div>

                <div className="flex items-center gap-2 justify-center sm:justify-start text-sm flex-wrap">
                  {/* User avatar + name */}
                  <div className="flex items-center gap-1.5">
                    {userImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={userImage}
                        alt={userName}
                        className="w-6 h-6 rounded-full"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-[var(--muted)] flex items-center justify-center text-[10px] font-bold">
                        {userName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="font-bold hover:underline cursor-default">
                      {userName}
                    </span>
                  </div>
                  {/* Collaborators */}
                  {collaborators.map((c) => (
                    <span key={c} className="flex items-center gap-1">
                      <span className="text-[var(--muted-foreground)]">,</span>
                      <span className="font-bold">{c}</span>
                    </span>
                  ))}
                  <span className="text-[var(--muted-foreground)]">·</span>
                  <span className="text-[var(--muted-foreground)]">
                    {new Date().getFullYear()}
                  </span>
                  {/* Genre — contentEditable inline */}
                  {(displayGenre || !editedGenre) && (
                    <>
                      <span className="text-[var(--muted-foreground)]">·</span>
                      <span
                        ref={genreRef}
                        contentEditable
                        suppressContentEditableWarning
                        onInput={(e) => setEditedGenre(e.currentTarget.textContent || "")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        className="text-[var(--muted-foreground)] outline-none cursor-text hover:text-white focus:text-white transition-colors rounded px-0.5 focus:ring-1 focus:ring-white/20"
                      >
                        {track.genre || "Genre"}
                      </span>
                    </>
                  )}
                  {track.duration > 0 && (
                    <>
                      <span className="text-[var(--muted-foreground)]">·</span>
                      <span className="text-[var(--muted-foreground)]">
                        {formatDuration(track.duration)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Action bar — play button + SC link */}
          <div className="px-6 py-4 flex items-center gap-4">
            <PlayerBar track={track} />
          </div>

          {/* Track row like Spotify tracklist */}
          <div className="px-6">
            <div className="border-b border-white/10 py-2 px-4 flex items-center text-[11px] text-[var(--muted-foreground)] uppercase tracking-wider">
              <span className="w-8 text-center">#</span>
              <span className="flex-1 ml-4">Title</span>
              <Clock className="w-3.5 h-3.5" />
            </div>
            <div className="group/row flex items-center py-2.5 px-4 rounded-md hover:bg-white/5 transition-colors">
              <span className="w-8 text-center text-sm text-[var(--muted-foreground)]">
                1
              </span>
              <div className="flex-1 ml-4">
                <p className="text-sm font-medium">{displayTitle}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {allArtists.join(", ")}
                </p>
              </div>
              <a
                href={track.permalinkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mr-4 text-[var(--muted-foreground)] hover:text-white transition-colors opacity-0 group-hover/row:opacity-100"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <span className="text-sm text-[var(--muted-foreground)] tabular-nums">
                {track.duration > 0 ? formatDuration(track.duration) : "--:--"}
              </span>
            </div>
          </div>

          {/* Content area */}
          <div className="px-6 py-8 space-y-8">
            {/* Collaborators */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Collaborators
                </h2>
              </div>

              {/* Current collaborators */}
              <div className="flex gap-2 flex-wrap items-center">
                {/* Main artist (you) */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--secondary)] border border-[var(--muted)] text-sm">
                  {userImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={userImage}
                      alt={userName}
                      className="w-5 h-5 rounded-full"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[var(--muted)] flex items-center justify-center text-[9px] font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="font-semibold">{userName}</span>
                  <span className="text-[10px] text-[var(--muted-foreground)] uppercase">
                    Main
                  </span>
                </div>

                {collaborators.map((c) => (
                  <div
                    key={c}
                    className="flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--secondary)] border border-[var(--muted)] text-sm group/collab"
                  >
                    <div className="w-5 h-5 rounded-full bg-[var(--muted)] flex items-center justify-center text-[9px] font-bold">
                      {c.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold">{c}</span>
                    <button
                      onClick={() => removeCollaborator(c)}
                      className="text-[var(--muted-foreground)] hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add input */}
                <div className="flex items-center gap-1">
                  <input
                    value={collabInput}
                    onChange={(e) => setCollabInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCollaborator()}
                    placeholder="Add artist..."
                    className="w-32 px-3 py-2 rounded-full bg-[var(--secondary)] border border-[var(--muted)] text-xs outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20"
                  />
                  <button
                    onClick={addCollaborator}
                    disabled={!collabInput.trim()}
                    className="p-2 rounded-full text-[var(--muted-foreground)] hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
            {/* Sample Pack */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Sample Pack
                </h2>
                <span className="text-[10px] text-[var(--muted-foreground)] uppercase">Optional</span>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--muted-foreground)]" />
                  <input
                    value={samplePackUrl}
                    onChange={(e) => setSamplePackUrl(e.target.value)}
                    placeholder="Paste link to your sample pack..."
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--secondary)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20"
                  />
                </div>
                {samplePackUrl && (
                  <button
                    onClick={() => setSamplePackUrl("")}
                    className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-red-400 hover:bg-white/5 transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {samplePackUrl && (
                <a
                  href={samplePackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-xs text-[var(--muted-foreground)] hover:text-white transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  {samplePackUrl.length > 60 ? samplePackUrl.slice(0, 60) + "..." : samplePackUrl}
                </a>
              )}
            </div>

            {/* Labels */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-[var(--muted-foreground)]" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  Submit to
                </h2>
              </div>

              {labelsLoading ? (
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-12 w-36 rounded-lg bg-[var(--muted)] animate-pulse"
                    />
                  ))}
                </div>
              ) : labels.length === 0 ? (
                <p className="text-xs text-[var(--muted-foreground)]">
                  No labels available. Admins can add labels in the admin panel.
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {labels.map((label) => {
                    const isSelected = selectedLabels.has(label.id);
                    return (
                      <button
                        key={label.id}
                        onClick={() => toggleLabel(label.id)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all border ${
                          isSelected
                            ? "text-white"
                            : "bg-[var(--secondary)] border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white hover:border-white/20"
                        }`}
                        style={
                          isSelected
                            ? {
                                backgroundColor: `${label.color}15`,
                                borderColor: `${label.color}50`,
                              }
                            : undefined
                        }
                      >
                        {label.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={label.iconUrl}
                            alt=""
                            className="w-6 h-6 rounded"
                          />
                        ) : (
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-black text-white"
                            style={{ backgroundColor: label.color }}
                          >
                            {label.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate">{label.name}</span>
                        {isSelected && (
                          <Check className="w-4 h-4 text-[#1DB954] ml-auto shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Message */}
            <div className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                Message (optional)
              </h2>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Add a personal note to your submission..."
                rows={3}
                className="w-full px-4 py-3 rounded-lg bg-[var(--secondary)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-white/20 focus:border-white/20 resize-none"
              />
            </div>

            {/* Email Preview */}
            {selectedLabels.size > 0 && (
              <div className="rounded-lg border border-[var(--muted)] bg-[var(--secondary)]/50 p-4 space-y-2">
                <p className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-wider">
                  Email Preview
                </p>
                <div className="text-xs text-[var(--muted-foreground)] space-y-1">
                  <p>
                    <span className="text-[var(--foreground)] font-bold">
                      To:{" "}
                    </span>
                    {labels
                      .filter((l) => selectedLabels.has(l.id))
                      .map((l) => l.email)
                      .join(", ")}
                  </p>
                  <p>
                    <span className="text-[var(--foreground)] font-bold">
                      Subject:{" "}
                    </span>
                    Demo Submission: {allArtists.join(", ")} - {displayTitle}
                  </p>
                </div>
                <div className="border-t border-[var(--muted)] pt-2 text-xs text-[var(--muted-foreground)] whitespace-pre-line leading-relaxed">
                  {`Hi ${labels.filter((l) => selectedLabels.has(l.id)).map((l) => l.name).join(", ")},\n\nI'd like to submit my track for your consideration.\n\nTrack: ${displayTitle}\nArtist${allArtists.length > 1 ? "s" : ""}: ${allArtists.join(", ")}\nSoundCloud: ${track.permalinkUrl}${displayGenre ? `\nGenre: ${displayGenre}` : ""}${samplePackUrl ? `\nSample Pack: ${samplePackUrl}` : ""}${customMessage ? `\n\n${customMessage}` : ""}\n\nSent via Phonk Forum (phonk.forum)\nBest regards`}
                </div>
              </div>
            )}

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={selectedLabels.size === 0}
              className="w-full py-3.5 rounded-full bg-[#1DB954] text-black text-sm font-bold hover:bg-[#1ed760] hover:scale-[1.01] disabled:opacity-30 disabled:hover:scale-100 transition-all flex items-center justify-center gap-2 shadow-lg"
            >
              <Send className="w-4 h-4" />
              Send to {selectedLabels.size} label
              {selectedLabels.size !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  SC Widget type declarations                                        */
/* ------------------------------------------------------------------ */

declare namespace SC {
  interface SoundCloudAPI {
    Widget: {
      (el: HTMLIFrameElement): SoundCloudWidget;
      Events: {
        READY: string;
        PLAY: string;
        PAUSE: string;
        PLAY_PROGRESS: string;
        FINISH: string;
      };
    };
  }
  interface SoundCloudWidget {
    toggle(): void;
    play(): void;
    pause(): void;
    seekTo(ms: number): void;
    bind(event: string, callback: (data?: unknown) => void): void;
    getDuration(callback: (duration: number) => void): void;
  }
}
