"use client";
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

export type PanelType = "artist" | "song" | "pack" | null;

/* eslint-disable @typescript-eslint/no-explicit-any */
interface DetailPanelState {
  type: PanelType;
  id: string | null;
  data?: any;
}

interface DetailPanelContextValue {
  panel: DetailPanelState;
  openArtist: (id: string) => void;
  openSong: (id: string, data?: any) => void;
  openDockSong: (data?: any) => void;
  registerDockPlaybackHandler: (handler: ((data?: any) => void) | null) => void;
  openPack: (id: string) => void;
  close: () => void;
  isOpen: boolean;
  dockSong: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const DetailPanelContext = createContext<DetailPanelContextValue | null>(null);

export function DetailPanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<DetailPanelState>({ type: null, id: null });
  const [dockSong, setDockSong] = useState<any>(null);
  const dockPlaybackHandlerRef = useRef<((data?: any) => void) | null>(null);

  const openArtist = useCallback((id: string) => setPanel({ type: "artist", id }), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openSong = useCallback((id: string, data?: any) => setPanel({ type: "song", id, data }), []);
  const openDockSong = useCallback((data?: any) => {
    setDockSong(data ?? null);
    if (data) {
      dockPlaybackHandlerRef.current?.(data);
    }
  }, []);
  const registerDockPlaybackHandler = useCallback((handler: ((data?: any) => void) | null) => {
    dockPlaybackHandlerRef.current = handler;
  }, []);
  const openPack = useCallback((id: string) => setPanel({ type: "pack", id }), []);
  const close = useCallback(() => setPanel({ type: null, id: null }), []);

  return (
    <DetailPanelContext.Provider value={{ panel, openArtist, openSong, openDockSong, registerDockPlaybackHandler, openPack, close, isOpen: panel.type !== null, dockSong }}>
      {children}
    </DetailPanelContext.Provider>
  );
}

export function useDetailPanel() {
  const ctx = useContext(DetailPanelContext);
  if (!ctx) throw new Error("useDetailPanel must be used within DetailPanelProvider");
  return ctx;
}
