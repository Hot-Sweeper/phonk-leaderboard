"use client";
import { SessionProvider } from "next-auth/react";
import { DetailPanelProvider } from "@/lib/detail-panel";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <DetailPanelProvider>{children}</DetailPanelProvider>
    </SessionProvider>
  );
}
