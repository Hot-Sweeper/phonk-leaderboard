"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "@/components/Sidebar";
import DetailPanel from "@/components/DetailPanel";
import { useDetailPanel } from "@/lib/detail-panel";

const LEFT_MIN = 260;
const LEFT_MAX = 560;
const RIGHT_MIN = 360;
const RIGHT_MAX = 760;
const LEFT_DEFAULT = 340;
const RIGHT_DEFAULT = 520;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isOpen } = useDetailPanel();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);
  const [dragging, setDragging] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    try {
      const storedLeft = window.localStorage.getItem("shell:left-width");
      const storedRight = window.localStorage.getItem("shell:right-width");
      if (storedLeft) setLeftWidth(clamp(Number(storedLeft), LEFT_MIN, LEFT_MAX));
      if (storedRight) setRightWidth(clamp(Number(storedRight), RIGHT_MIN, RIGHT_MAX));
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("shell:left-width", String(leftWidth));
      window.localStorage.setItem("shell:right-width", String(rightWidth));
    } catch {
      // ignore storage errors
    }
  }, [leftWidth, rightWidth]);

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
      <>
        <button
          type="button"
          aria-label="Resize detail panel"
          className="hidden lg:block w-1.5 shrink-0 cursor-col-resize bg-transparent hover:bg-[var(--accent)]/30 active:bg-[var(--accent)]/50 transition-colors"
          onMouseDown={() => setDragging("right")}
        />
        <div className="hidden lg:block shrink-0" style={rightStyle}>
          <DetailPanel />
        </div>
      </>
    </div>
  );
}
