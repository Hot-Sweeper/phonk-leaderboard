"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import ReleasePostCard, { type ReleasePostData } from "@/components/community/ReleasePostCard";
import HyvorTalkEmbed from "@/components/comments/HyvorTalkEmbed";

export default function CommunityPostPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [post, setPost] = useState<ReleasePostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPost = useCallback(async () => {
    if (!params.id) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/community/posts/${params.id}`);
      if (!response.ok) {
        setError("Post not found.");
        setPost(null);
        return;
      }
      setPost(await response.json());
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void loadPost();
  }, [loadPost]);

  useEffect(() => {
    if (searchParams.get("checkout") !== "success") return;
    void loadPost();
  }, [loadPost, searchParams]);

  async function promotePost(postId: string) {
    setPromoting(true);
    try {
      const response = await fetch(`/api/community/posts/${postId}/promote`, { method: "POST" });
      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok) {
        alert(payload.error ?? "Could not start promotion checkout.");
        return;
      }
      if (payload.checkoutUrl) {
        window.location.href = payload.checkoutUrl;
        return;
      }
      await loadPost();
    } finally {
      setPromoting(false);
    }
  }

  const pageUrl =
    typeof window !== "undefined" ? `${window.location.origin}/community/post/${params.id}` : undefined;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8">
      <Link
        href="/community"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground)] hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to feed
      </Link>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
        </div>
      ) : error || !post ? (
        <div className="rounded-2xl border border-dashed border-[var(--muted)] px-5 py-10 text-center">
          <p className="text-sm text-[var(--muted-foreground)]">{error ?? "Post not found."}</p>
        </div>
      ) : (
        <>
          <ReleasePostCard
            post={post}
            showPromote={session?.user?.id === post.authorId}
            onPromote={promotePost}
            promoting={promoting}
          />

          <section className="space-y-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/35">Discussion</h2>
            <HyvorTalkEmbed
              pageId={`release-post-${post.id}`}
              pageTitle={post.title}
              pageUrl={pageUrl}
            />
          </section>
        </>
      )}
    </main>
  );
}
