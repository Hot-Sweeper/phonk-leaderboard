"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Megaphone, Palette, Send } from "lucide-react";
import CreateReleasePostForm from "@/components/community/CreateReleasePostForm";
import ReleasePostCard, { type ReleasePostData } from "@/components/community/ReleasePostCard";

const QUICK_LINKS = [
  {
    href: "/marketplace/cover-art",
    title: "Cover art marketplace",
    description: "Order custom artwork from phonk-focused designers.",
    icon: Palette,
  },
  {
    href: "/demos",
    title: "Demo pitch inbox",
    description: "Labels review protected previews and signal interest.",
    icon: Send,
  },
  {
    href: "/submit",
    title: "Submit a demo",
    description: "Pitch your next track to verified labels.",
    icon: Megaphone,
  },
];

export default function CommunityPage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<ReleasePostData[]>([]);
  const [loading, setLoading] = useState(true);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/community/posts");
      if (response.ok) setPosts(await response.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  async function promotePost(postId: string) {
    setPromotingId(postId);
    try {
      const response = await fetch(`/api/community/posts/${postId}/promote`, { method: "POST" });
      const payload = (await response.json()) as {
        checkoutUrl?: string;
        simulated?: boolean;
        error?: string;
      };
      if (!response.ok) {
        alert(payload.error ?? "Could not start promotion checkout.");
        return;
      }
      if (payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }
      await loadPosts();
    } finally {
      setPromotingId(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-[0.28em] text-[var(--accent)]">Community</p>
        <h1 className="text-3xl font-black tracking-tight text-white">Phonk Forum feed</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
          Release announcements, collab calls, and promoted highlights from artists and labels in
          the phonk scene.
        </p>
      </div>

      {session ? (
        <CreateReleasePostForm onCreated={() => void loadPosts()} />
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--muted)] px-5 py-6 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">
            <Link href="/api/auth/signin" className="font-semibold text-[var(--accent)] hover:underline">
              Sign in
            </Link>{" "}
            to post releases and promote your drops.
          </p>
        </div>
      )}

      <section className="space-y-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/35">Latest posts</h2>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--muted)] px-5 py-10 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">
              No posts yet. Be the first to announce a release.
            </p>
            {!session ? (
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                New here?{" "}
                <Link href="/onboarding" className="font-semibold text-[var(--accent)] hover:underline">
                  Set up your profile
                </Link>
              </p>
            ) : null}
          </div>
        ) : (
          posts.map((post) => (
            <ReleasePostCard
              key={post.id}
              post={post}
              showPromote={session?.user?.id === post.authorId}
              onPromote={promotePost}
              promoting={promotingId === post.id}
            />
          ))
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {QUICK_LINKS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/20 p-4 transition hover:border-[var(--accent)]/40"
          >
            <item.icon className="mb-2 h-5 w-5 text-[var(--accent)]" />
            <h3 className="font-bold text-white">{item.title}</h3>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
