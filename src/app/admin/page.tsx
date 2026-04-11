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
  Crown,
  UserMinus,
  Settings,
  RefreshCw,
  Loader2,
  ArrowRightLeft,
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

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "ADMIN" | "MODERATOR";
  createdAt: string;
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [invites, setInvites] = useState<ModInvite[]>([]);
  const [modRequests, setModRequests] = useState<ModRequest[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | "">("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"staff" | "invites" | "settings">("staff");

  // Settings state
  const [updateIntervalHours, setUpdateIntervalHours] = useState(24);
  const [lastFullUpdate, setLastFullUpdate] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [settingsResult, setSettingsResult] = useState<string | null>(null);

  const isAdmin = session?.user?.role === "ADMIN";

  const load = useCallback(async () => {
    const [invRes, reqRes, staffRes, settingsRes] = await Promise.all([
      fetch("/api/mod-invites"),
      fetch("/api/mod-requests"),
      fetch("/api/staff"),
      fetch("/api/admin/settings"),
    ]);
    if (invRes.ok) setInvites(await invRes.json());
    if (reqRes.ok) setModRequests(await reqRes.json());
    if (staffRes.ok) setStaff(await staffRes.json());
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      setUpdateIntervalHours(s.updateIntervalHours ?? 24);
      setLastFullUpdate(s.lastFullUpdate ?? null);
    }
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

  async function demoteModerator(userId: string, name: string | null) {
    const confirmed = window.confirm(
      `Remove moderator role from ${name ?? "this user"}?`
    );
    if (!confirmed) return;
    const res = await fetch("/api/staff", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) load();
  }

  async function saveInterval(hours: number) {
    setUpdateIntervalHours(hours);
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "updateIntervalHours", value: String(hours) }),
    });
  }

  async function updateAllArtists() {
    setUpdatingAll(true);
    setSettingsResult(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateAll" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettingsResult(
          `Updated ${data.updated}/${data.total} artists. ${data.failed} failed.`
        );
        setLastFullUpdate(new Date().toISOString());
      }
    } finally {
      setUpdatingAll(false);
    }
  }

  async function migrateToSpotify() {
    const confirmed = window.confirm(
      "This will update ALL artist names and profile pictures to match their Spotify profile. Continue?"
    );
    if (!confirmed) return;
    setMigrating(true);
    setSettingsResult(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "migrateToSpotify" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettingsResult(
          `Migrated ${data.migrated}/${data.total} artists to Spotify names/images. ${data.failed} failed.`
        );
      }
    } finally {
      setMigrating(false);
    }
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

        {/* ── Tabs ── */}
        <div className="flex gap-1.5 mb-8">
          {[
            { key: "staff" as const, label: "Staff Management", icon: Crown },
            { key: "invites" as const, label: "Mod Invites", icon: Key },
            { key: "settings" as const, label: "Settings", icon: Settings },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === tab.key
                  ? "bg-[var(--accent)] text-white shadow-[0_0_12px_var(--accent-glow)]"
                  : "bg-[var(--secondary)] text-[var(--muted-foreground)] hover:text-white border border-[var(--muted)]"
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* ── Staff Management Tab ── */}
        {activeTab === "staff" && (
          <>
            <div className="mb-10">
              <h2 className="text-lg font-black mb-3 flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-400" />
                Admins & Moderators ({staff.length})
              </h2>
              <div className="flex flex-col gap-3">
                {staff.map((member) => (
                  <div
                    key={member.id}
                    className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {member.image ? (
                        <img
                          src={member.image}
                          alt=""
                          className="w-10 h-10 rounded-full"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center">
                          <User className="w-5 h-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-sm truncate">
                          {member.name ?? "Unknown"}
                        </div>
                        <div className="text-[var(--muted-foreground)] text-xs truncate">
                          {member.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                          member.role === "ADMIN"
                            ? "bg-yellow-900/50 text-yellow-300"
                            : "bg-blue-900/50 text-blue-300"
                        }`}
                      >
                        {member.role === "ADMIN" ? "Admin" : "Moderator"}
                      </span>
                      {member.role === "MODERATOR" && member.id !== session?.user?.id && (
                        <button
                          onClick={() => demoteModerator(member.id, member.name)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-900/50 text-red-300 hover:bg-red-900/80 transition-all"
                          title="Remove moderator"
                        >
                          <UserMinus className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {staff.length === 0 && (
                  <div className="text-center text-[var(--muted-foreground)] py-10">
                    No staff members found.
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Invites Tab ── */}
        {activeTab === "invites" && (
          <>

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

          </>
        )}

        {/* ── Settings Tab ── */}
        {activeTab === "settings" && (
          <>
            <div className="mb-10">
              <h2 className="text-lg font-black mb-3 flex items-center gap-2">
                <Settings className="w-5 h-5 text-zinc-400" />
                Update Settings
              </h2>
              <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 flex flex-col gap-4">
                {/* Update interval */}
                <div>
                  <label className="text-xs font-bold uppercase text-[var(--muted-foreground)] mb-1 block">
                    Stats Update Interval
                  </label>
                  <select
                    value={updateIntervalHours}
                    onChange={(e) => saveInterval(Number(e.target.value))}
                    className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] w-48"
                  >
                    <option value={1}>Every hour</option>
                    <option value={6}>Every 6 hours</option>
                    <option value={12}>Every 12 hours</option>
                    <option value={24}>Every 24 hours</option>
                    <option value={48}>Every 48 hours</option>
                    <option value={168}>Every week</option>
                  </select>
                  {lastFullUpdate && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      Last full update: {new Date(lastFullUpdate).toLocaleString()}
                    </p>
                  )}
                </div>

                {/* Update All */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={updateAllArtists}
                    disabled={updatingAll}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-all"
                  >
                    {updatingAll ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    {updatingAll ? "Updating..." : "Update All Stats Now"}
                  </button>
                </div>
              </div>
            </div>

            {/* Migrate to Spotify */}
            <div className="mb-10">
              <h2 className="text-lg font-black mb-3 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-green-400" />
                Spotify Migration
              </h2>
              <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5">
                <p className="text-sm text-[var(--muted-foreground)] mb-3">
                  Switch all artist names and profile pictures from YouTube to
                  Spotify data. This will update every artist that has a Spotify
                  link.
                </p>
                <button
                  onClick={migrateToSpotify}
                  disabled={migrating}
                  className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-all"
                >
                  {migrating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="w-4 h-4" />
                  )}
                  {migrating ? "Migrating..." : "Switch to Spotify Names & Images"}
                </button>
              </div>
            </div>

            {/* Settings result */}
            {settingsResult && (
              <div className="bg-green-950/40 border border-green-800/40 rounded-2xl p-4 text-green-300 text-sm font-bold">
                {settingsResult}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
