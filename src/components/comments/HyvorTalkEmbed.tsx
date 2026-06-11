"use client";

import { useEffect, useRef } from "react";
import { useSession, signIn } from "next-auth/react";
import { MessageSquare } from "lucide-react";

declare global {
  interface Window {
    HYVOR_TALK_WEBSITE_ID?: string;
  }
}

type HyvorTalkEmbedProps = {
  pageId: string;
  pageTitle: string;
  pageUrl?: string;
};

export default function HyvorTalkEmbed({ pageId, pageTitle, pageUrl }: HyvorTalkEmbedProps) {
  const { data: session, status } = useSession();
  const containerRef = useRef<HTMLDivElement>(null);
  const websiteId = process.env.NEXT_PUBLIC_HYVOR_TALK_WEBSITE_ID?.trim();

  useEffect(() => {
    if (!websiteId || !session?.user || !containerRef.current) return;

    const scriptId = "hyvor-talk-embed";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://talk.hyvor.com/embed/embed.js";
      script.type = "module";
      script.async = true;
      document.body.appendChild(script);
    }

    const host = containerRef.current;
    host.innerHTML = "";

    const comments = document.createElement("hyvor-talk-comments");
    comments.setAttribute("website-id", websiteId);
    comments.setAttribute("page-id", pageId);
    comments.setAttribute("page-title", pageTitle);
    if (pageUrl) comments.setAttribute("page-url", pageUrl);
    if (session.user.id) {
      comments.setAttribute("sso-user", session.user.id);
      comments.setAttribute("sso-name", session.user.name ?? session.user.email ?? "Member");
      if (session.user.email) comments.setAttribute("sso-email", session.user.email);
      if (session.user.image) comments.setAttribute("sso-picture", session.user.image);
    }

    host.appendChild(comments);
  }, [websiteId, pageId, pageTitle, pageUrl, session]);

  if (!websiteId) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--muted)] px-4 py-6 text-center">
        <MessageSquare className="mx-auto mb-2 h-5 w-5 text-[var(--muted-foreground)]" />
        <p className="text-sm text-[var(--muted-foreground)]">
          Discussion embed is not configured yet. Set{" "}
          <code className="text-white/70">NEXT_PUBLIC_HYVOR_TALK_WEBSITE_ID</code> to enable
          Hyvor Talk.
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-[var(--muted)]/40 px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
        Loading discussion…
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="rounded-2xl border border-[var(--muted)]/40 bg-white/[0.02] px-4 py-6 text-center">
        <MessageSquare className="mx-auto mb-2 h-5 w-5 text-[var(--accent)]" />
        <p className="text-sm text-[var(--muted-foreground)]">
          Sign in to join the discussion on this track.
        </p>
        <button
          type="button"
          onClick={() => signIn("google")}
          className="mt-3 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--muted)]/40 bg-white/[0.02] p-3">
      <div ref={containerRef} />
    </div>
  );
}
