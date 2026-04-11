"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Shield,
  Plus,
  Copy,
  Trash2,
  Check,
  X,
  User,
  Link2,
  Clock,
  CheckCircle,
  XCircle,
  Key,
} from "lucide-react";

type ModInvite = {
  id: string;
  code: string;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdBy: { name: string | null; image: string | null };
  _count: { requests: number };
};

type ModRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  user: { name: string | null; image: string | null; email: string | null };
  invite: { code: string };
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [invites, setInvites] = useState<ModInvite[]>([]);
  const [modRequests, setModRequests] = useState<ModRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const isAdmin = session?.user?.role === "ADMIN";

  const load = useCallback(async () => {
    const [invRes, reqRes] = await Promise.all([
      fetch("/api/mod-invites"),
      fetch("/api/mod-requests"),
    ]);
    if (invRes.ok) setInvites(await invRes.json());
    if (reqRes.ok) setModRequests(await reqRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function createInvite() {
    setCreating(true);
    const res = await fetch("/api/mod-invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        maxUses,
        expiresInDays: expiresInDays || undefined,
      }),
    });
    if (res.ok) {
      setMaxUses(1);
      setExpiresInDays("");
      load();
    }
    setCreating(false);
  }

  async function deactivateInvite(id: string) {
    await fetch("/api/mod-invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  async function reviewModRequest(requestId: string, action: "approve" | "reject") {
    await fetch("/api/mod-requests/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        action,
        reviewNote: reviewNotes[requestId] || "",
      }),
    });
    load();
  }

  function copyInviteLink(code: string, id: string) {
    const url = `${window.location.origin}/join?code=${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <Shield className="w-16 h-16 text-red-500" />
        <h1 className="text-2xl font-black">Admin access required</h1>
      </main>
    );
  }

  const pendingMod = modRequests.filter((r) => r.status === "PENDING");
  const reviewedMod = modRequests.filter((r) => r.status !== "PENDING");

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-3xl mx-auto relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3">
            <Shield className="w-8 h-8 text-[var(--accent)]" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
              Admin Panel
            </span>
          </h1>
        </div>

        {/* ── Create Mod Invite ── */}
        <div className="mb-10">
          <h2 className="text-lg font-black mb-3 flex items-center gap-2">
            <Key className="w-5 h-5 text-cyan-400" />
            Create Mod Invite
          </h2>
          <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--muted-foreground)] font-semibold">
                  Max Uses
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Number(e.target.value))}
                  className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm w-20 outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-[var(--muted-foreground)] font-semibold">
                  Expires in (days)
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="Never"
                  value={expiresInDays}
                  onChange={(e) =>
                    setExpiresInDays(e.target.value ? Number(e.target.value) : "")
                  }
                  className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm w-28 outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                />
              </div>
              <button
                onClick={createInvite}
                disabled={creating}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] hover:bg-[#a21caf] text-white text-sm font-bold transition-all disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                {creating ? "Creating..." : "Create Invite"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Active Invites ── */}
        {invites.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-green-400" />
              Invite Codes ({invites.length})
            </h2>
            <div className="flex flex-col gap-3">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className={`bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 ${
                    !inv.active ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <code className="text-[var(--accent)] font-mono text-sm font-bold bg-[var(--muted)] px-2 py-1 rounded">
                      {inv.code}
                    </code>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyInviteLink(inv.code, inv.id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all"
                        title="Copy invite link"
                      >
                        {copiedId === inv.id ? (
                          <Check className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedId === inv.id ? "Copied" : "Copy Link"}
                      </button>
                      {inv.active && (
                        <button
                          onClick={() => deactivateInvite(inv.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-900/50 text-red-300 hover:bg-red-900/80 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Revoke
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-[var(--muted-foreground)]">
                    <span>
                      Uses: {inv.usedCount}/{inv.maxUses}
                    </span>
                    <span>
                      Requests: {inv._count.requests}
                    </span>
                    {inv.expiresAt && (
                      <span>
                        Expires:{" "}
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    <span>
                      {inv.active ? (
                        <span className="text-green-400">Active</span>
                      ) : (
                        <span className="text-red-400">Revoked</span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pending Mod Requests ── */}
        {pendingMod.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              Pending Mod Requests ({pendingMod.length})
            </h2>
            <div className="flex flex-col gap-3">
              {pendingMod.map((r) => (
                <div
                  key={r.id}
                  className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5"
                >
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      {r.user.image ? (
                        <img
                          src={r.user.image}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {r.user.name ?? r.user.email}
                        </div>
                        <div className="text-[var(--muted-foreground)] text-xs">
                          {r.user.email}
                        </div>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-300">
                      Pending
                    </span>
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)] mb-3">
                    Used invite code:{" "}
                    <code className="text-[var(--accent)] font-mono">{r.invite.code}</code>
                    {" "}&middot;{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </div>
                  <input
                    placeholder="Review note (optional)"
                    value={reviewNotes[r.id] ?? ""}
                    onChange={(e) =>
                      setReviewNotes((prev) => ({
                        ...prev,
                        [r.id]: e.target.value,
                      }))
                    }
                    className="w-full bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500 mb-3"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => reviewModRequest(r.id, "approve")}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => reviewModRequest(r.id, "reject")}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Reviewed Mod Requests ── */}
        {reviewedMod.length > 0 && (
          <div>
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-zinc-400" />
              Reviewed ({reviewedMod.length})
            </h2>
            <div className="flex flex-col gap-3">
              {reviewedMod.map((r) => {
                const isApproved = r.status === "APPROVED";
                return (
                  <div
                    key={r.id}
                    className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 opacity-60"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        {r.user.image ? (
                          <img
                            src={r.user.image}
                            alt=""
                            className="w-7 h-7 rounded-full"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center">
                            <User className="w-3 h-3" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">
                            {r.user.name ?? r.user.email}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                          isApproved
                            ? "bg-green-900/50 text-green-300"
                            : "bg-red-900/50 text-red-300"
                        }`}
                      >
                        {isApproved ? (
                          <CheckCircle className="w-3 h-3" />
                        ) : (
                          <XCircle className="w-3 h-3" />
                        )}
                        {r.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {invites.length === 0 && modRequests.length === 0 && (
          <div className="text-center text-[var(--muted-foreground)] py-20">
            No invite codes or mod requests yet. Create one above.
          </div>
        )}
      </div>
    </main>
  );
}
