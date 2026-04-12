"use client";
import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

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
  openPack: (id: string) => void;
  close: () => void;
  isOpen: boolean;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const DetailPanelContext = createContext<DetailPanelContextValue | null>(null);

export function DetailPanelProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<DetailPanelState>({ type: null, id: null });

  const openArtist = useCallback((id: string) => setPanel({ type: "artist", id }), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openSong = useCallback((id: string, data?: any) => setPanel({ type: "song", id, data }), []);
  const openPack = useCallback((id: string) => setPanel({ type: "pack", id }), []);
  const close = useCallback(() => setPanel({ type: null, id: null }), []);

  return (
    <DetailPanelContext.Provider value={{ panel, openArtist, openSong, openPack, close, isOpen: panel.type !== null }}>
      {children}
    </DetailPanelContext.Provider>
  );
}

export function useDetailPanel() {
  const ctx = useContext(DetailPanelContext);
  if (!ctx) throw new Error("useDetailPanel must be used within DetailPanelProvider");
  return ctx;
}
