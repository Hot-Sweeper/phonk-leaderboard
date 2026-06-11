"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { formatMarketplacePrice, ORDER_STATUS_LABELS } from "@/lib/marketplace-format";

type Order = {
  id: string;
  status: keyof typeof ORDER_STATUS_LABELS;
  priceCents: number;
  currency: string;
  createdAt: string;
  gig?: { id: string; title: string; imageUrls: string[] };
  tier?: { name: string };
  buyer?: { id: string; name: string | null };
  seller?: { id: string; name: string | null };
};

export default function MarketplaceOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<"all" | "buyer" | "seller">("all");

  useEffect(() => {
    setLoading(true);
    const params = role === "all" ? "" : `?role=${role}`;
    void fetch(`/api/marketplace/orders${params}`)
      .then((res) => res.json())
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [role]);

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-3xl font-black text-white">My orders</h1>
      <div className="mt-4 flex gap-2">
        {(["all", "buyer", "seller"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setRole(item)}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              role === item ? "bg-[var(--accent)] text-white" : "border border-[var(--muted)] text-[var(--muted-foreground)]"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--accent)]" />
        </div>
      ) : orders.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--muted-foreground)]">No orders yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.id}
              href={`/marketplace/orders/${order.id}`}
              className="flex items-center gap-4 rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-4 transition hover:border-[var(--accent)]/40"
            >
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[var(--background)]">
                {order.gig?.imageUrls[0] ? (
                  <Image src={order.gig.imageUrls[0]} alt="" fill className="object-cover" unoptimized />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-white">{order.gig?.title ?? "Cover art order"}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {order.tier?.name} · {formatMarketplacePrice(order.priceCents, order.currency)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                  {ORDER_STATUS_LABELS[order.status]}
                </p>
                <p className="text-[11px] text-[var(--muted-foreground)]">
                  {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
