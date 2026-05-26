"use client";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { DetailPanelProvider } from "@/lib/detail-panel";

export default function Providers({ children, session }: { children: React.ReactNode; session?: Session | null }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} session={session}>
      <DetailPanelProvider>{children}</DetailPanelProvider>
    </SessionProvider>
  );
}
