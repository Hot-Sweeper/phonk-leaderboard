"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";

const PUBLIC_PREFIXES = [
  "/onboarding",
  "/rankings",
  "/leaderboard",
  "/bubbles",
  "/songs",
  "/hype",
  "/samples",
  "/artist/",
  "/community",
  "/legal",
];

function isPublicPath(path: string) {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export default function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const path = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) {
      setChecked(true);
      return;
    }

    if (isPublicPath(path)) {
      setChecked(true);
      return;
    }

    let cancelled = false;

    void fetch("/api/me/personas")
      .then((res) => res.json())
      .then((payload: { needsOnboarding?: boolean }) => {
        if (cancelled) return;
        if (payload.needsOnboarding) {
          router.replace("/onboarding");
          return;
        }
        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, [path, router, session, status]);

  if (!checked && status === "authenticated" && session && !isPublicPath(path)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted-foreground)]">
        Loading your profile…
      </div>
    );
  }

  return <>{children}</>;
}
