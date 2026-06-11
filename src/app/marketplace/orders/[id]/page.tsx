"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Send, Star } from "lucide-react";
import { formatMarketplacePrice, ORDER_STATUS_LABELS } from "@/lib/marketplace-format";

type Message = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string | null; image: string | null };
};

type Order = {
  id: string;
  status: keyof typeof ORDER_STATUS_LABELS;
  brief: string;
  priceCents: number;
  currency: string;
  deliveryUrls: string[];
  deliveryNote: string | null;
  buyerId: string;
  sellerId: string;
  gig?: { title: string };
  tier?: { name: string };
  review?: { rating: number; comment: string | null } | null;
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { data: session } = useSession();
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [deliveryUrl, setDeliveryUrl] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void params.then(({ id }) => setOrderId(id));
  }, [params]);

  async function reload() {
    if (!orderId) return;
    const [orderRes, messagesRes] = await Promise.all([
      fetch(`/api/marketplace/orders/${orderId}`),
      fetch(`/api/marketplace/orders/${orderId}/messages`),
    ]);
    if (orderRes.ok) setOrder(await orderRes.json());
    if (messagesRes.ok) setMessages(await messagesRes.json());
  }

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function runAction(action: string, extra?: Record<string, unknown>) {
    if (!orderId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/marketplace/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Action failed.");
      setOrder(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!orderId || !messageDraft.trim()) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/marketplace/orders/${orderId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: messageDraft.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to send message.");
      setMessages((current) => [...current, payload]);
      setMessageDraft("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReview() {
    if (!orderId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/marketplace/orders/${orderId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: reviewComment }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Failed to submit review.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review.");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !order) {
    return (
      <main className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  const currentUserId = session?.user?.id ?? null;
  const isBuyer = currentUserId === order.buyerId;
  const isSeller = currentUserId === order.sellerId;
  const chatOpen = !["PENDING_PAYMENT", "CANCELLED", "REFUNDED"].includes(order.status);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8 space-y-6">
      <Link href="/marketplace/orders" className="text-sm text-[var(--muted-foreground)] hover:text-white">
        ← My orders
      </Link>

      <section className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">{order.gig?.title ?? "Cover art order"}</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {order.tier?.name} · {formatMarketplacePrice(order.priceCents, order.currency)}
            </p>
          </div>
          <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-white/80 whitespace-pre-wrap">{order.brief}</p>

        {order.status === "PENDING_PAYMENT" && isBuyer ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const response = await fetch(`/api/marketplace/orders/${order.id}/checkout`, { method: "POST" });
              const payload = await response.json();
              setBusy(false);
              if (payload.checkoutUrl) window.location.href = payload.checkoutUrl;
              else await reload();
            }}
            className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
          >
            Pay now
          </button>
        ) : null}

        {isSeller && order.status === "PAID" ? (
          <button type="button" disabled={busy} onClick={() => void runAction("start")} className="mt-4 rounded-xl border border-[var(--muted)] px-4 py-2 text-sm font-semibold text-white">
            Start work
          </button>
        ) : null}

        {isSeller && ["PAID", "IN_PROGRESS"].includes(order.status) ? (
          <div className="mt-4 space-y-2">
            <input
              value={deliveryUrl}
              onChange={(e) => setDeliveryUrl(e.target.value)}
              placeholder="Delivery file URL"
              className="w-full rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction("deliver", { deliveryUrls: [deliveryUrl] })}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
            >
              Mark delivered
            </button>
          </div>
        ) : null}

        {isBuyer && order.status === "DELIVERED" ? (
          <div className="mt-4 space-y-3">
            {order.deliveryUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block text-sm text-[var(--accent)] hover:underline">
                Download delivery
              </a>
            ))}
            <button type="button" disabled={busy} onClick={() => void runAction("complete")} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white">
              Accept delivery
            </button>
          </div>
        ) : null}

        {isBuyer && order.status === "COMPLETED" && !order.review ? (
          <div className="mt-4 space-y-2 rounded-xl border border-[var(--muted)] p-4">
            <p className="text-sm font-bold text-white">Leave a review</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)}>
                  <Star className={`h-5 w-5 ${value <= rating ? "fill-amber-300 text-amber-300" : "text-[var(--muted-foreground)]"}`} />
                </button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              rows={3}
              placeholder="How was the cover art?"
              className="w-full rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none"
            />
            <button type="button" disabled={busy} onClick={() => void submitReview()} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white">
              Submit review
            </button>
          </div>
        ) : null}

        {order.review ? (
          <p className="mt-4 text-sm text-amber-300">
            Reviewed {order.review.rating}/5 {order.review.comment ? `— ${order.review.comment}` : ""}
          </p>
        ) : null}
      </section>

      {chatOpen ? (
        <section className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/20">
          <div className="border-b border-[var(--muted)] px-4 py-3 text-sm font-bold text-white">Order chat</div>
          <div className="max-h-80 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  message.senderId === currentUserId
                    ? "ml-auto bg-[var(--accent)]/20 text-white"
                    : "bg-[var(--muted)]/40 text-white/90"
                }`}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">
                  {message.sender.name ?? "User"}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="flex gap-2 border-t border-[var(--muted)] p-3">
            <input
              value={messageDraft}
              onChange={(e) => setMessageDraft(e.target.value)}
              placeholder="Message buyer/seller…"
              className="flex-1 rounded-xl border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
            />
            <button type="button" disabled={busy} onClick={() => void sendMessage()} className="rounded-xl bg-[var(--accent)] px-3 py-2 text-white">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </main>
  );
}
