"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Sidebar from "@/components/Sidebar";
import DetailPanel from "@/components/DetailPanel";
import { useDetailPanel } from "@/lib/detail-panel";
import { ExternalLink, Loader2, Music2 } from "lucide-react";

const LEFT_MIN = 260;
const LEFT_MAX = 560;
const RIGHT_MIN = 360;
const RIGHT_MAX = 760;
const LEFT_DEFAULT = 340;
const RIGHT_DEFAULT = 520;
const RIGHT_BOTTOM_MIN = 168;
const RIGHT_BOTTOM_MAX = 340;
const RIGHT_BOTTOM_DEFAULT = 220;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type DockTrack = {
  id: string;
  name?: string;
  albumImageUrl?: string | null;
  spotifyUrl?: string | null;
  spotifyId?: string | null;
};

function toSpotifyTrackUri(track: DockTrack | null): string | null {
  if (!track) return null;
  if (track.spotifyId) return `spotify:track:${track.spotifyId}`;
  const spotifyUrl = track.spotifyUrl;
  if (!spotifyUrl) return null;
  const match = spotifyUrl.match(/\/track\/([a-zA-Z0-9]+)/);
  if (!match?.[1]) return null;
  return `spotify:track:${match[1]}`;
}

function RightDock({ track }: { track: DockTrack | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<any>(null);
  const pendingUriRef = useRef<string | null>(null);
  const [apiReady, setApiReady] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const spotifyUrl = track?.spotifyUrl ?? null;
  const title = track?.name ?? "Spotify player";
  const imageUrl = track?.albumImageUrl ?? null;
  const trackUri = toSpotifyTrackUri(track);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const win = window as Window & {
      onSpotifyIframeApiReady?: (api: any) => void;
      __spotifyIframeApi?: any;
      __spotifyIframeScriptLoaded?: boolean;
    };

    if (win.__spotifyIframeApi) {
      setApiReady(true);
      return;
    }

    const scriptId = "spotify-iframe-api";
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const previousReady = win.onSpotifyIframeApiReady;

    win.onSpotifyIframeApiReady = (api: any) => {
      win.__spotifyIframeApi = api;
      win.__spotifyIframeScriptLoaded = true;
      setApiReady(true);
      if (previousReady) previousReady(api);
    };

    if (!existing) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://open.spotify.com/embed/iframe-api/v1";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  useEffect(() => {
    if (!trackUri) {
      setState("idle");
      return;
    }

    pendingUriRef.current = trackUri;

    const win = window as Window & { __spotifyIframeApi?: any };
    const api = win.__spotifyIframeApi;
    const container = containerRef.current;

    if (!api || !container) {
      setState("loading");
      return;
    }

    const playLoadedUri = (controller: any, uri: string) => {
      try {
        controller.loadUri?.(uri);
        controller.play?.();
        setState("loading");
      } catch {
        setState("error");
      }
    };

    if (controllerRef.current) {
      playLoadedUri(controllerRef.current, trackUri);
      return;
    }

    setState("loading");
    let cancelled = false;

    api.createController(container, { width: "100%", height: "100%", uri: trackUri }, (controller: any) => {
      if (cancelled) {
        controller.destroy?.();
        return;
      }

      controllerRef.current = controller;
      controller.addListener?.("ready", () => {
        const nextUri = pendingUriRef.current;
        if (nextUri) playLoadedUri(controller, nextUri);
      });
      controller.addListener?.("playback_started", () => setState("ready"));
      controller.addListener?.("playback_update", (event: any) => {
        if (event?.data && event.data.isPaused === false && event.data.isBuffering === false) {
          setState("ready");
        }
      });

      playLoadedUri(controller, trackUri);
    });

    return () => {
      cancelled = true;
    };
  }, [trackUri]);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-white/10 bg-[#0a0a0f]">
      <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {imageUrl ? (
            <Image src={imageUrl} alt="" width={28} height={28} className="h-7 w-7 rounded-md object-cover shrink-0" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/8 text-white/30 shrink-0">
              <Music2 className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-white/30">Spotify dock</div>
            <div className="truncate text-xs font-semibold text-white/75">{title}</div>
          </div>
        </div>
        {spotifyUrl ? (
          <a href={spotifyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 py-1 text-[10px] font-bold text-white/55 hover:bg-white/10 hover:text-white transition-colors">
            <ExternalLink className="h-3 w-3" />
            Open
          </a>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 p-2">
        {trackUri ? (
          <div className="relative h-full w-full overflow-hidden rounded-xl border border-white/8 bg-black/30">
            <div ref={containerRef} className="absolute inset-0" />
            {(state === "loading" || !apiReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-sm text-white/55">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-xs font-semibold">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Starting Spotify player
                </div>
              </div>
            )}
            {state === "error" && (
              <div className="absolute inset-0 flex items-center justify-center px-4 text-center text-xs text-white/60">
                Spotify did not start playback automatically. Use the controls inside the player or the Open button.
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 text-center text-xs text-white/35">
            Click a song to load the docked Spotify player here.
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { panel, dockSong } = useDetailPanel();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);
  const [rightBottomHeight, setRightBottomHeight] = useState(RIGHT_BOTTOM_DEFAULT);
  const [dragging, setDragging] = useState<"left" | "right" | "right-bottom" | null>(null);

  useEffect(() => {
    try {
      const storedLeft = window.localStorage.getItem("shell:left-width");
      const storedRight = window.localStorage.getItem("shell:right-width");
      const storedBottom = window.localStorage.getItem("shell:right-bottom-height");
      if (storedLeft) setLeftWidth(clamp(Number(storedLeft), LEFT_MIN, LEFT_MAX));
      if (storedRight) setRightWidth(clamp(Number(storedRight), RIGHT_MIN, RIGHT_MAX));
      if (storedBottom) setRightBottomHeight(clamp(Number(storedBottom), RIGHT_BOTTOM_MIN, RIGHT_BOTTOM_MAX));
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("shell:left-width", String(leftWidth));
      window.localStorage.setItem("shell:right-width", String(rightWidth));
      window.localStorage.setItem("shell:right-bottom-height", String(rightBottomHeight));
    } catch {
      // ignore storage errors
    }
  }, [leftWidth, rightWidth, rightBottomHeight]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();

      if (dragging === "left") {
        const next = clamp(event.clientX - rect.left, LEFT_MIN, LEFT_MAX);
        setLeftWidth(next);
      }

      if (dragging === "right") {
        const next = clamp(rect.right - event.clientX, RIGHT_MIN, RIGHT_MAX);
        setRightWidth(next);
      }

      if (dragging === "right-bottom") {
        const next = clamp(rect.bottom - event.clientY, RIGHT_BOTTOM_MIN, RIGHT_BOTTOM_MAX);
        setRightBottomHeight(next);
      }
    };

    const onUp = () => setDragging(null);

    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  const leftStyle = useMemo(() => ({ width: `${leftWidth}px` }), [leftWidth]);
  const rightStyle = useMemo(() => ({ width: `${rightWidth}px` }), [rightWidth]);
  const selectedDockTrack = (dockSong ?? (panel.type === "song" ? panel.data : null)) as DockTrack | null;

  return (
    <div ref={rootRef} className="flex h-[calc(100vh-3.5rem)]">
      <div className="hidden lg:block shrink-0" style={leftStyle}>
        <Sidebar />
      </div>

      <button
        type="button"
        aria-label="Resize left sidebar"
        className="hidden lg:block w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors"
        onMouseDown={() => setDragging("left")}
      />

      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

      {/* Right detail panel — always mounted, visibility driven by isOpen */}
      <button
        type="button"
        aria-label="Resize detail panel"
        className="hidden lg:block w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors"
        onMouseDown={() => setDragging("right")}
      />
      <div className="hidden lg:flex shrink-0 flex-col h-full" style={rightStyle}>
        <div className="min-h-0 flex-1 overflow-hidden">
          <DetailPanel />
        </div>
        <button
          type="button"
          aria-label="Resize Spotify dock"
          className="h-1.5 w-full cursor-row-resize bg-transparent hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors"
          onMouseDown={() => setDragging("right-bottom")}
        />
        <div className="shrink-0 overflow-hidden" style={{ height: `${rightBottomHeight}px` }}>
          <RightDock track={selectedDockTrack} />
        </div>
      </div>
    </div>
  );
}
