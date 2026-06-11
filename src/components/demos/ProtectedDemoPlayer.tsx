"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";

type Props = {
  soundcloudUrl: string;
  previewStartMs: number;
  previewDurationMs: number;
  artworkUrl?: string | null;
  title?: string;
};

function formatMs(ms: number) {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function ProtectedDemoPlayer({
  soundcloudUrl,
  previewStartMs,
  previewDurationMs,
  title,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const widgetRef = useRef<SC.SoundCloudWidget | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [clipPosition, setClipPosition] = useState(0);

  useEffect(() => {
    if (document.getElementById("sc-widget-api")) return;
    const script = document.createElement("script");
    script.id = "sc-widget-api";
    script.src = "https://w.soundcloud.com/player/api.js";
    script.async = true;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!iframeRef.current) return;
    const init = () => {
      const SC = (window as unknown as { SC: SC.SoundCloudAPI }).SC;
      const widget = SC.Widget(iframeRef.current!);
      widgetRef.current = widget;
      widget.bind(SC.Widget.Events.READY, () => {
        widget.seekTo(previewStartMs);
        setReady(true);
      });
      widget.bind(SC.Widget.Events.PLAY, () => setPlaying(true));
      widget.bind(SC.Widget.Events.PAUSE, () => setPlaying(false));
      widget.bind(SC.Widget.Events.PLAY_PROGRESS, (data: unknown) => {
        const payload = data as { currentPosition: number };
        const relative = payload.currentPosition - previewStartMs;
        setClipPosition(Math.max(0, relative));
        if (payload.currentPosition >= previewStartMs + previewDurationMs) {
          widget.pause();
          widget.seekTo(previewStartMs);
          setClipPosition(0);
        }
      });
    };

    if ((window as unknown as { SC?: SC.SoundCloudAPI }).SC?.Widget) init();
    else {
      const id = window.setInterval(() => {
        if ((window as unknown as { SC?: SC.SoundCloudAPI }).SC?.Widget) {
          window.clearInterval(id);
          init();
        }
      }, 100);
      return () => window.clearInterval(id);
    }
  }, [previewDurationMs, previewStartMs, soundcloudUrl]);

  const toggle = () => {
    const widget = widgetRef.current;
    if (!widget) return;
    if (playing) widget.pause();
    else {
      widget.seekTo(previewStartMs);
      widget.play();
    }
  };

  const clipProgress = previewDurationMs > 0 ? (clipPosition / previewDurationMs) * 100 : 0;

  return (
    <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/40 p-4">
      <iframe
        ref={iframeRef}
        className="hidden"
        title={title ?? "Demo preview"}
        src={`https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloudUrl)}&color=%23c026d3&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false`}
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--accent)]">
            Protected preview
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            {formatMs(previewStartMs)} – {formatMs(previewStartMs + previewDurationMs)} clip only
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={!ready}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent)] text-white disabled:opacity-40"
        >
          {!ready ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 ml-0.5" />
          )}
        </button>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
        <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${clipProgress}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">
        Low-friction preview window — full track is never linked here.
      </p>
    </div>
  );
}

declare namespace SC {
  interface SoundCloudAPI {
    Widget: {
      (el: HTMLIFrameElement): SoundCloudWidget;
      Events: {
        READY: string;
        PLAY: string;
        PAUSE: string;
        PLAY_PROGRESS: string;
      };
    };
  }
  interface SoundCloudWidget {
    play(): void;
    pause(): void;
    seekTo(ms: number): void;
    bind(event: string, callback: (data?: unknown) => void): void;
  }
}
