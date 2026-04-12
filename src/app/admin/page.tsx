"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Skeleton } from "@/components/Skeleton";
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
  FileText,
  AlertCircle,
  Music,
  StopCircle,
  Bug,
  Play,
  Database,
  Zap,
  Package,
  Star,
  ExternalLink,
  Eye,
  EyeOff,
  Tag,
  Pencil,
  Save,
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

type UpdateLogEntry = {
  id: string;
  trigger: string;
  updateType: string;
  status: string;
  totalArtists: number;
  updatedCount: number;
  failedCount: number;
  durationMs: number;
  details: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
};

type ScheduledUpdaterSetting = {
  key: "updateIntervalHours" | "songUpdateIntervalHours";
  label: string;
  description: string;
  updateType: string;
  intervalHours: number;
  lastRun: string | null;
};

const INTERVAL_OPTIONS = [
  { value: 1, label: "Every hour" },
  { value: 6, label: "Every 6 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Every 24 hours" },
  { value: 48, label: "Every 48 hours" },
  { value: 168, label: "Every week" },
];

function AdminPageSkeleton() {
  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />
      <div className="max-w-3xl mx-auto relative z-10 space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-10 w-56 max-w-full" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-28 rounded-xl" />
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-6 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-5 w-40 max-w-full" />
              <Skeleton className="h-9 w-28 rounded-xl" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((__, cardIndex) => (
                <div key={cardIndex} className="rounded-xl border border-[var(--muted)] bg-[var(--background)]/20 p-4 space-y-3">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48 max-w-full" />
                  <Skeleton className="h-9 w-24 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

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
  const [activeTab, setActiveTab] = useState<"staff" | "invites" | "settings" | "debug" | "packs" | "labels">("staff");

  // Sample packs state
  const [packs, setPacks] = useState<Array<{
    id: string; name: string; description: string | null; imageUrl: string | null;
    seller: string | null; payhipUrl: string | null; gumroadUrl: string | null;
    priceCents: number; currency: string; ratingAverage: number | null;
    ratingCount: number; salesCount: number | null; tags: string[]; published: boolean;
    createdAt: string;
    versions: Array<{ id: string; name: string; priceCents: number; currency: string; description: string | null }>;
  }>>([]);
  const [packPayhipUrl, setPackPayhipUrl] = useState("");
  const [packGumroadUrl, setPackGumroadUrl] = useState("");
  const [packTags, setPackTags] = useState("");
  const [packPreview, setPackPreview] = useState<{
    name: string; description: string | null; imageUrl: string | null;
    seller: string | null; priceCents: number; currency: string;
    ratingAverage: number | null; ratingCount: number; salesCount: number | null;
    variants: Array<{ name: string; priceCents: number; currency: string; description: string | null }>;
  } | null>(null);
  const [packPreviewing, setPackPreviewing] = useState(false);
  const [packSaving, setPackSaving] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);
  const [packRescraping, setPackRescraping] = useState<string | null>(null);
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [editPackName, setEditPackName] = useState("");
  const [editPackPayhipUrl, setEditPackPayhipUrl] = useState("");
  const [editPackGumroadUrl, setEditPackGumroadUrl] = useState("");
  const [editPackTags, setEditPackTags] = useState("");
  const [editPackSaving, setEditPackSaving] = useState(false);

  // Labels state
  type LabelItem = { id: string; name: string; email: string; iconUrl: string | null; color: string; active: boolean };
  const [adminLabels, setAdminLabels] = useState<LabelItem[]>([]);
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelEmail, setNewLabelEmail] = useState("");
  const [newLabelIconUrl, setNewLabelIconUrl] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#c026d3");
  const [labelSaving, setLabelSaving] = useState(false);

  // Debug state
  const [debugChecks, setDebugChecks] = useState<{ name: string; status: "ok" | "warn" | "error"; message: string; detail?: string }[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugTimestamp, setDebugTimestamp] = useState<string | null>(null);
  const [debugActionResult, setDebugActionResult] = useState<{
    status: string;
    message: string;
    detail?: string;
    processed?: number;
    matched?: number;
    unresolved?: number;
    remaining?: number;
  } | null>(null);
  const [debugActionLoading, setDebugActionLoading] = useState<string | null>(null);

  // Settings state
  const [updateIntervalHours, setUpdateIntervalHours] = useState(1);
  const [lastFullUpdate, setLastFullUpdate] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<{ current: number; total: number } | null>(null);
  const [songUpdateIntervalHours, setSongUpdateIntervalHours] = useState(6);
  const [lastSongUpdate, setLastSongUpdate] = useState<string | null>(null);
  const [scheduledUpdaters, setScheduledUpdaters] = useState<ScheduledUpdaterSetting[]>([]);
  const [updatingSongs, setUpdatingSongs] = useState(false);
  const [songProgress, setSongProgress] = useState<{ current: number; total: number } | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [deduplicating, setDeduplicating] = useState(false);
  const [settingsResult, setSettingsResult] = useState<string | null>(null);
  const [updateLogs, setUpdateLogs] = useState<UpdateLogEntry[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [cancellingAll, setCancellingAll] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";

  const load = useCallback(async () => {
    const [invRes, reqRes, staffRes, settingsRes, packsRes] = await Promise.all([
      fetch("/api/mod-invites"),
      fetch("/api/mod-requests"),
      fetch("/api/staff"),
      fetch("/api/admin/settings"),
      fetch("/api/sample-packs"),
    ]);
    if (invRes.ok) setInvites(await invRes.json());
    if (reqRes.ok) setModRequests(await reqRes.json());
    if (staffRes.ok) setStaff(await staffRes.json());
    if (settingsRes.ok) {
      const s = await settingsRes.json();
      setUpdateIntervalHours(s.updateIntervalHours ?? 1);
      setLastFullUpdate(s.lastFullUpdate ?? null);
      setSongUpdateIntervalHours(s.songUpdateIntervalHours ?? 6);
      setLastSongUpdate(s.lastSongUpdate ?? null);
      setScheduledUpdaters(s.updaters ?? []);
      setUpdateLogs(s.logs ?? []);
    }
    if (packsRes.ok) setPacks(await packsRes.json());
    const labelsRes = await fetch("/api/labels");
    if (labelsRes.ok) setAdminLabels(await labelsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  async function runDebugAction(action: string, extraBody?: Record<string, unknown>) {
    const res = await fetch("/api/admin/debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extraBody }),
    });
    return res.json();
  }

  async function runDiagnostics() {
    const res = await fetch("/api/admin/debug");
    const data = await res.json();
    setDebugChecks(data.checks ?? []);
    setDebugTimestamp(data.timestamp ?? null);
  }

  async function autoBackfillDeezerIds() {
    setDebugActionLoading("autoBackfillDeezerIds");
    setDebugActionResult(null);

    let totalProcessed = 0;
    let totalMatched = 0;
    let totalUnresolved = 0;
    let remaining = 0;
    const detailLines: string[] = [];

    try {
      for (let round = 0; round < 10; round++) {
        const data = await runDebugAction("backfillDeezerIds", { limit: 100 });

        if (!data || data.status === "error") {
          setDebugActionResult(data ?? { status: "error", message: "Request failed" });
          return;
        }

        totalProcessed += data.processed ?? 0;
        totalMatched += data.matched ?? 0;
        totalUnresolved += data.unresolved ?? 0;
        remaining = data.remaining ?? 0;

        if (data.detail) {
          detailLines.push(`Round ${round + 1}:`);
          detailLines.push(data.detail);
        }

        if ((data.processed ?? 0) === 0 || remaining === 0) break;
      }

      setDebugActionResult({
        status: totalMatched > 0 ? "ok" : "warn",
        message: `Auto-backfill processed ${totalProcessed} artists: ${totalMatched} matched, ${totalUnresolved} unresolved, ${remaining} remaining without Deezer IDs`,
        detail: detailLines.slice(0, 80).join("\n"),
        processed: totalProcessed,
        matched: totalMatched,
        unresolved: totalUnresolved,
        remaining,
      });

      await runDiagnostics();
    } catch {
      setDebugActionResult({ status: "error", message: "Auto-backfill request failed" });
    } finally {
      setDebugActionLoading(null);
    }
  }

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
    setScheduledUpdaters((current) => current.map((updater) => (
      updater.key === "updateIntervalHours" ? { ...updater, intervalHours: hours } : updater
    )));
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "updateIntervalHours", value: String(hours) }),
    });
    if (res.ok) {
      setSettingsResult(`Stats update interval saved: every ${hours}h`);
    } else {
      setSettingsResult(`Failed to save interval (${res.status})`);
      // Reload to get actual value
      const settingsRes = await fetch("/api/admin/settings");
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setUpdateIntervalHours(s.updateIntervalHours ?? 1);
        setScheduledUpdaters(s.updaters ?? []);
      }
    }
  }

  async function saveSongInterval(hours: number) {
    setSongUpdateIntervalHours(hours);
    setScheduledUpdaters((current) => current.map((updater) => (
      updater.key === "songUpdateIntervalHours" ? { ...updater, intervalHours: hours } : updater
    )));
    const res = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "songUpdateIntervalHours", value: String(hours) }),
    });
    if (res.ok) {
      setSettingsResult(`Song update interval saved: every ${hours}h`);
    } else {
      setSettingsResult(`Failed to save song interval (${res.status})`);
      const settingsRes = await fetch("/api/admin/settings");
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setSongUpdateIntervalHours(s.songUpdateIntervalHours ?? 6);
        setScheduledUpdaters(s.updaters ?? []);
      }
    }
  }

  async function updateAllArtists() {
    setUpdatingAll(true);
    setSettingsResult(null);
    setUpdateProgress({ current: 0, total: 0 });

    // Start polling for progress
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/update-progress");
        if (res.ok) {
          const data = await res.json();
          if (data.status === "running") {
            setUpdateProgress({ current: data.updatedCount + data.failedCount, total: data.totalArtists });
          }
        }
      } catch { /* ignore */ }
    }, 1500);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateAll" }),
      });
      if (res.ok) {
        const data = await res.json();
        const secs = (data.durationMs / 1000).toFixed(1);
        setSettingsResult(
          `Updated ${data.updated}/${data.total} artists in ${secs}s. ${data.failed} failed.`
        );
        setLastFullUpdate(new Date().toISOString());
        setScheduledUpdaters((current) => current.map((updater) => (
          updater.key === "updateIntervalHours"
            ? { ...updater, lastRun: new Date().toISOString() }
            : updater
        )));
        // Refresh logs
        const logsRes = await fetch("/api/admin/settings");
        if (logsRes.ok) {
          const s = await logsRes.json();
          setScheduledUpdaters(s.updaters ?? []);
          setUpdateLogs(s.logs ?? []);
        }
      }
    } finally {
      clearInterval(pollInterval);
      setUpdatingAll(false);
      setUpdateProgress(null);
    }
  }

  async function updateAllSongs() {
    setUpdatingSongs(true);
    setSettingsResult(null);
    setSongProgress({ current: 0, total: 0 });

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/update-progress");
        if (res.ok) {
          const data = await res.json();
          if (data.status === "running") {
            setSongProgress({ current: data.updatedCount + data.failedCount, total: data.totalArtists });
          }
        }
      } catch { /* ignore */ }
    }, 1500);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "updateSongs" }),
      });
      if (res.ok) {
        const data = await res.json();
        const secs = (data.durationMs / 1000).toFixed(1);
        setSettingsResult(
          `Songs updated for ${data.updated}/${data.total} artists in ${secs}s. ${data.failed} failed.`
        );
        setLastSongUpdate(new Date().toISOString());
        setScheduledUpdaters((current) => current.map((updater) => (
          updater.key === "songUpdateIntervalHours"
            ? { ...updater, lastRun: new Date().toISOString() }
            : updater
        )));
        const logsRes = await fetch("/api/admin/settings");
        if (logsRes.ok) {
          const s = await logsRes.json();
          setScheduledUpdaters(s.updaters ?? []);
          setUpdateLogs(s.logs ?? []);
        }
      }
    } finally {
      clearInterval(pollInterval);
      setUpdatingSongs(false);
      setSongProgress(null);
    }
  }

  async function cancelAllUpdates() {
    setCancellingAll(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancelAll" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettingsResult(`Cancelled ${data.cancelled} running update(s).`);
        setUpdatingAll(false);
        setUpdatingSongs(false);
        setUpdateProgress(null);
        setSongProgress(null);
        const logsRes = await fetch("/api/admin/settings");
        if (logsRes.ok) {
          const s = await logsRes.json();
          setScheduledUpdaters(s.updaters ?? []);
          setUpdateLogs(s.logs ?? []);
        }
      }
    } finally {
      setCancellingAll(false);
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

  async function deduplicateArtists() {
    const confirmed = window.confirm(
      "This will merge duplicate artists (by name). The one with fewer links gets deleted. Continue?"
    );
    if (!confirmed) return;
    setDeduplicating(true);
    setSettingsResult(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deduplicate" }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettingsResult(`Removed ${data.deleted} duplicate artist(s).`);
      }
    } finally {
      setDeduplicating(false);
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
            { key: "debug" as const, label: "Debug", icon: Bug },
            { key: "packs" as const, label: "Sample Packs", icon: Package },
            { key: "labels" as const, label: "Submit Labels", icon: Tag },
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
                <Clock className="w-5 h-5 text-blue-400" />
                Updater Settings
              </h2>
              <p className="text-sm text-[var(--muted-foreground)] mb-4">
                Configure every scheduled updater here. Right now the app has a stats updater and a song updater.
              </p>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {scheduledUpdaters.map((updater) => {
                  const isStatsUpdater = updater.key === "updateIntervalHours";
                  const isRunning = isStatsUpdater ? updatingAll : updatingSongs;
                  const progress = isStatsUpdater ? updateProgress : songProgress;
                  const runUpdater = isStatsUpdater ? updateAllArtists : updateAllSongs;
                  const saveUpdaterInterval = isStatsUpdater ? saveInterval : saveSongInterval;
                  const buttonClass = isStatsUpdater
                    ? "bg-blue-600 hover:bg-blue-500"
                    : "bg-green-600 hover:bg-green-500";
                  const progressClass = isStatsUpdater ? "bg-blue-500" : "bg-green-500";

                  return (
                    <div key={updater.key} className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 flex flex-col gap-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            {isStatsUpdater ? (
                              <RefreshCw className="w-4 h-4 text-blue-400" />
                            ) : (
                              <Music className="w-4 h-4 text-green-400" />
                            )}
                            <h3 className="text-base font-black">{updater.label}</h3>
                          </div>
                          <p className="text-sm text-[var(--muted-foreground)]">{updater.description}</p>
                        </div>
                        <span className="rounded-full border border-[var(--muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                          {updater.updateType}
                        </span>
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase text-[var(--muted-foreground)] mb-1 block">
                          Refresh Interval
                        </label>
                        <select
                          value={updater.intervalHours}
                          onChange={(e) => saveUpdaterInterval(Number(e.target.value))}
                          className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] w-48"
                        >
                          {INTERVAL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        {updater.lastRun && (
                          <p className="text-xs text-[var(--muted-foreground)] mt-1">
                            Last run: {new Date(updater.lastRun).toLocaleString()}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-3">
                          <button
                            onClick={runUpdater}
                            disabled={isRunning}
                            className={`px-4 py-2 rounded-xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-all ${buttonClass}`}
                          >
                            {isRunning ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : isStatsUpdater ? (
                              <RefreshCw className="w-4 h-4" />
                            ) : (
                              <Music className="w-4 h-4" />
                            )}
                            {isRunning
                              ? isStatsUpdater ? "Updating Stats..." : "Updating Songs..."
                              : isStatsUpdater ? "Run Stats Update Now" : "Run Song Update Now"}
                          </button>
                        </div>

                        {isRunning && progress && progress.total > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
                              <span>{isStatsUpdater ? "Updating artists..." : "Fetching tracks..."}</span>
                              <span>{progress.current}/{progress.total}</span>
                            </div>
                            <div className="w-full bg-[var(--muted)] rounded-full h-2.5 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${progressClass}`}
                                style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-[var(--muted-foreground)]">
                              {Math.round((progress.current / progress.total) * 100)}% complete
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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

            {/* Deduplicate */}
            <div className="mb-10">
              <h2 className="text-lg font-black mb-3 flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" />
                Deduplicate Artists
              </h2>
              <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5">
                <p className="text-sm text-[var(--muted-foreground)] mb-3">
                  Find artists with the same name and merge them. The duplicate
                  with fewer links is removed; any unique links are transferred
                  to the kept artist.
                </p>
                <button
                  onClick={deduplicateArtists}
                  disabled={deduplicating}
                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-sm flex items-center gap-2 disabled:opacity-50 transition-all"
                >
                  {deduplicating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {deduplicating ? "Deduplicating..." : "Remove Duplicates"}
                </button>
              </div>
            </div>

            {/* Settings result */}
            {settingsResult && (
              <div className="bg-green-950/40 border border-green-800/40 rounded-2xl p-4 text-green-300 text-sm font-bold">
                {settingsResult}
              </div>
            )}

            {/* Update History */}
            {updateLogs.length > 0 && (
              <div className="mb-10">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-black flex items-center gap-2">
                    <FileText className="w-5 h-5 text-blue-400" />
                    Update History
                  </h2>
                  {updateLogs.some((l) => l.status === "running") && (
                    <button
                      onClick={cancelAllUpdates}
                      disabled={cancellingAll}
                      className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition-all"
                    >
                      {cancellingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                      Cancel All Running
                    </button>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {updateLogs.map((log) => {
                    const isRunning = log.status === "running";
                    const isFailed = log.status === "failed";
                    const isCancelled = log.status === "cancelled";
                    const duration = log.durationMs > 0
                      ? log.durationMs >= 60000
                        ? `${(log.durationMs / 60000).toFixed(1)}m`
                        : `${(log.durationMs / 1000).toFixed(1)}s`
                      : "...";
                    const expanded = expandedLogId === log.id;
                    let details: { name: string; status: string; durationMs: number; error?: string }[] = [];
                    if (expanded && log.details) {
                      try { details = JSON.parse(log.details); } catch { /* ignore */ }
                    }
                    return (
                      <div key={log.id} className="bg-[var(--secondary)] border border-[var(--muted)] rounded-xl overflow-hidden">
                        <button
                          onClick={() => setExpandedLogId(expanded ? null : log.id)}
                          className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-[var(--muted)]/30 transition-colors"
                        >
                          {isRunning ? (
                            <Loader2 className="w-4 h-4 animate-spin text-blue-400 shrink-0" />
                          ) : isCancelled ? (
                            <StopCircle className="w-4 h-4 text-orange-400 shrink-0" />
                          ) : isFailed ? (
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                          ) : (
                            <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-sm font-bold">
                              <span className={
                                isRunning ? "text-blue-300" : isCancelled ? "text-orange-300" : isFailed ? "text-red-300" : "text-green-300"
                              }>
                                {isRunning ? "Running" : isCancelled ? "Cancelled" : isFailed ? "Failed" : "Completed"}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)] uppercase font-bold">
                                {log.trigger}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${
                                log.updateType === "songs" ? "bg-green-900/50 text-green-300" : "bg-blue-900/50 text-blue-300"
                              }`}>
                                {log.updateType === "songs" ? "Songs" : "Stats"}
                              </span>
                            </div>
                            <div className="text-xs text-[var(--muted-foreground)] mt-0.5 flex gap-3">
                              <span>{new Date(log.createdAt).toLocaleString()}</span>
                              <span>{log.updatedCount}/{log.totalArtists} updated</span>
                              {log.failedCount > 0 && (
                                <span className="text-red-400">{log.failedCount} failed</span>
                              )}
                              <span>{duration}</span>
                            </div>
                          </div>
                        </button>
                        {expanded && details.length > 0 && (
                          <div className="border-t border-[var(--muted)] px-4 py-2 max-h-72 overflow-y-auto">
                            {/* Stats update: show per-platform values */}
                            {log.updateType === "stats" ? (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[var(--muted-foreground)] text-left">
                                    <th className="pb-1 font-semibold w-[160px]">Artist</th>
                                    <th className="pb-1 font-semibold text-[#1DB954]">Spotify</th>
                                    <th className="pb-1 font-semibold text-red-400">YouTube</th>
                                    <th className="pb-1 font-semibold text-cyan-400">TikTok</th>
                                    <th className="pb-1 font-semibold text-fuchsia-400">Instagram</th>
                                    <th className="pb-1 font-semibold text-right">Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {details.map((d, i) => {
                                    const plats = (d as { platforms?: { platform: string; value: number; metric: string }[] }).platforms ?? [];
                                    const get = (key: string) => plats.find(p => p.platform === key);
                                    const fmtV = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n/1_000).toFixed(0)}K` : String(n);
                                    const spotify = get("SPOTIFY");
                                    const yt = get("YOUTUBE");
                                    const tt = get("TIKTOK");
                                    const ig = get("INSTAGRAM");
                                    return (
                                      <tr key={i} className="border-t border-[var(--muted)]/30">
                                        <td className="py-1 truncate max-w-[160px] font-medium">
                                          <span className={d.status === "ok" ? "" : d.status === "failed" ? "text-red-400" : "text-yellow-400"}>{d.name}</span>
                                          {d.error && <span className="block text-[9px] text-red-400/70 truncate" title={d.error}>{d.error.substring(0, 60)}</span>}
                                        </td>
                                        <td className="py-1 tabular-nums text-white/50">{spotify ? fmtV(spotify.value) : <span className="text-white/20">—</span>}</td>
                                        <td className="py-1 tabular-nums text-white/50">{yt ? fmtV(yt.value) : <span className="text-white/20">—</span>}</td>
                                        <td className="py-1 tabular-nums text-white/50">{tt ? fmtV(tt.value) : <span className="text-white/20">—</span>}</td>
                                        <td className="py-1 tabular-nums text-white/50">{ig ? fmtV(ig.value) : <span className="text-white/20">—</span>}</td>
                                        <td className="py-1 text-right text-[var(--muted-foreground)]">{(d.durationMs / 1000).toFixed(1)}s</td>
                                      </tr>
                                    );
                                  })}
                                  {log.error && (
                                    <tr className="border-t border-red-800/40">
                                      <td colSpan={6} className="py-2 text-red-400 text-xs break-all">{log.error}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            ) : (
                              /* Song update: show track counts per artist */
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-[var(--muted-foreground)] text-left">
                                    <th className="pb-1 font-semibold">Artist</th>
                                    <th className="pb-1 font-semibold text-center">Tracks</th>
                                    <th className="pb-1 font-semibold">Status</th>
                                    <th className="pb-1 font-semibold text-right">Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {details.map((d, i) => {
                                    const tracks = (d as { tracks?: number }).tracks;
                                    return (
                                      <tr key={i} className="border-t border-[var(--muted)]/30">
                                        <td className="py-1 truncate max-w-[180px]">{d.name}</td>
                                        <td className="py-1 text-center tabular-nums text-white/60">{tracks != null ? tracks : <span className="text-white/20">—</span>}</td>
                                        <td className={`py-1 ${d.status === "ok" ? "text-green-400" : d.status === "skipped" || d.status === "no-tracks" ? "text-yellow-400" : "text-red-400"}`}>
                                          {d.status === "ok" ? "OK" : d.status === "skipped" ? "Skipped" : d.status === "no-tracks" ? "No tracks" : "Failed"}
                                          {d.error && <span className="block text-[10px] text-red-400/70 truncate max-w-[260px]" title={d.error}>{d.error.substring(0, 80)}</span>}
                                        </td>
                                        <td className="py-1 text-right text-[var(--muted-foreground)]">{(d.durationMs / 1000).toFixed(1)}s</td>
                                      </tr>
                                    );
                                  })}
                                  {log.error && (
                                    <tr className="border-t border-red-800/40">
                                      <td colSpan={4} className="py-2 text-red-400 text-xs break-all">{log.error}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
        {/* ── Debug Tab ── */}
        {activeTab === "debug" && (
          <>
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-lg font-bold text-white">System Diagnostics</h2>
              <button
                onClick={async () => {
                  setDebugLoading(true);
                  setDebugActionResult(null);
                  try {
                    await runDiagnostics();
                  } catch {
                    setDebugChecks([{ name: "Fetch Error", status: "error", message: "Failed to reach debug endpoint" }]);
                  } finally {
                    setDebugLoading(false);
                  }
                }}
                disabled={debugLoading}
                className="px-3 py-1.5 bg-[var(--accent)] text-white text-sm font-bold rounded-lg hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {debugLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Run Diagnostics
              </button>
              {debugTimestamp && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  Last run: {new Date(debugTimestamp).toLocaleString()}
                </span>
              )}
            </div>

            {debugChecks.length > 0 && (
              <div className="bg-[var(--secondary)] rounded-xl border border-[var(--muted)] overflow-hidden mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--muted)] text-[var(--muted-foreground)] text-left">
                      <th className="px-4 py-2.5 font-semibold w-8"></th>
                      <th className="px-4 py-2.5 font-semibold">Check</th>
                      <th className="px-4 py-2.5 font-semibold">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {debugChecks.map((check, i) => (
                      <tr key={i} className="border-t border-[var(--muted)]/30 hover:bg-[var(--muted)]/10">
                        <td className="px-4 py-2">
                          {check.status === "ok" && <CheckCircle className="w-4 h-4 text-green-400" />}
                          {check.status === "warn" && <AlertCircle className="w-4 h-4 text-yellow-400" />}
                          {check.status === "error" && <XCircle className="w-4 h-4 text-red-400" />}
                        </td>
                        <td className="px-4 py-2 font-medium text-white whitespace-nowrap">{check.name}</td>
                        <td className="px-4 py-2">
                          <span className={check.status === "ok" ? "text-green-400" : check.status === "warn" ? "text-yellow-400" : "text-red-400"}>
                            {check.message}
                          </span>
                          {check.detail && (
                            <div className="text-xs text-[var(--muted-foreground)] mt-0.5 break-all max-w-xl">{check.detail}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Debug Actions */}
            <h3 className="text-sm font-bold text-[var(--muted-foreground)] uppercase tracking-wider mb-3">Debug Actions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
              <button
                onClick={autoBackfillDeezerIds}
                disabled={debugActionLoading !== null}
                className="bg-[var(--secondary)] border border-[var(--muted)] rounded-xl p-4 text-left hover:border-[var(--accent)]/50 transition-all disabled:opacity-50"
              >
                <div className="flex items-center gap-2 mb-1">
                  {debugActionLoading === "autoBackfillDeezerIds" ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                  ) : (
                    <Zap className="w-4 h-4 text-[var(--accent)]" />
                  )}
                  <span className="font-bold text-white text-sm">Auto Backfill All</span>
                </div>
                <p className="text-xs text-[var(--muted-foreground)]">Resolve Deezer IDs in repeated 100-artist batches until complete or capped</p>
              </button>

              {[
                { action: "testSettingWrite", label: "Test Settings Write", icon: Database, desc: "Write, read, delete a test setting" },
                { action: "testSpotifyTopTracks", label: "Test Spotify Top Tracks", icon: Music, desc: "Fetch top tracks via Spotify API" },
                { action: "testDeezerResolve", label: "Test Deezer Pipeline", icon: Play, desc: "Resolve Spotify -> Deezer + fetch tracks" },
                { action: "backfillDeezerIds", label: "Backfill Deezer IDs", icon: Zap, desc: "Resolve and save up to 100 artist Deezer IDs per run" },
                { action: "clearStaleRunning", label: "Clear Stale Running", icon: StopCircle, desc: "Mark all running logs as failed" },
              ].map((btn) => (
                <button
                  key={btn.action}
                  onClick={async () => {
                    setDebugActionLoading(btn.action);
                    setDebugActionResult(null);
                    try {
                      const data = await runDebugAction(
                        btn.action,
                        btn.action === "backfillDeezerIds" ? { limit: 100 } : undefined
                      );
                      setDebugActionResult(data);
                      if (btn.action === "backfillDeezerIds") {
                        await runDiagnostics();
                      }
                    } catch {
                      setDebugActionResult({ status: "error", message: "Request failed" });
                    } finally {
                      setDebugActionLoading(null);
                    }
                  }}
                  disabled={debugActionLoading !== null}
                  className="bg-[var(--secondary)] border border-[var(--muted)] rounded-xl p-4 text-left hover:border-[var(--accent)]/50 transition-all disabled:opacity-50"
                >
                  <div className="flex items-center gap-2 mb-1">
                    {debugActionLoading === btn.action ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
                    ) : (
                      <btn.icon className="w-4 h-4 text-[var(--accent)]" />
                    )}
                    <span className="font-bold text-white text-sm">{btn.label}</span>
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)]">{btn.desc}</p>
                </button>
              ))}
            </div>

            {debugActionResult && (
              <div className={`rounded-xl border p-4 mb-6 ${
                debugActionResult.status === "ok"
                  ? "bg-green-950/20 border-green-800/40 text-green-400"
                  : "bg-red-950/20 border-red-800/40 text-red-400"
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  {debugActionResult.status === "ok" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  <span className="font-bold text-sm">{debugActionResult.status === "ok" ? "Success" : "Error"}</span>
                </div>
                <p className="text-sm">{debugActionResult.message}</p>
                {debugActionResult.detail && (
                  <pre className="text-xs mt-2 bg-black/30 p-2 rounded-lg overflow-x-auto max-h-40">{debugActionResult.detail}</pre>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Sample Packs Tab ── */}
        {activeTab === "packs" && (
          <>
            <div className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-6 space-y-4 mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-cyan-400" /> Add Sample Pack
              </h2>
              <p className="text-xs text-[var(--muted-foreground)]">
                Paste a Payhip and/or Gumroad product link. Metadata will be scraped automatically.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[var(--muted-foreground)] block mb-1">Payhip URL</label>
                  <input
                    value={packPayhipUrl}
                    onChange={(e) => setPackPayhipUrl(e.target.value)}
                    placeholder="https://payhip.com/b/..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[var(--muted-foreground)] block mb-1">Gumroad URL</label>
                  <input
                    value={packGumroadUrl}
                    onChange={(e) => setPackGumroadUrl(e.target.value)}
                    placeholder="https://....gumroad.com/l/..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--muted-foreground)] block mb-1">Tags (comma-separated)</label>
                <input
                  value={packTags}
                  onChange={(e) => setPackTags(e.target.value)}
                  placeholder="drums, bass, fx, phonk"
                  className="w-full px-3 py-2 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setPackPreviewing(true);
                    setPackError(null);
                    setPackPreview(null);
                    try {
                      const res = await fetch("/api/sample-packs/preview", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          payhipUrl: packPayhipUrl || undefined,
                          gumroadUrl: packGumroadUrl || undefined,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setPackError(data.error ?? "Preview failed"); return; }
                      setPackPreview(data);
                    } catch { setPackError("Network error"); }
                    finally { setPackPreviewing(false); }
                  }}
                  disabled={packPreviewing || (!packPayhipUrl && !packGumroadUrl)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--secondary)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  {packPreviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  Preview
                </button>
                <button
                  onClick={async () => {
                    setPackSaving(true);
                    setPackError(null);
                    try {
                      const tags = packTags.split(",").map((t) => t.trim()).filter(Boolean);
                      const res = await fetch("/api/sample-packs", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          payhipUrl: packPayhipUrl || undefined,
                          gumroadUrl: packGumroadUrl || undefined,
                          tags,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) { setPackError(data.error ?? "Save failed"); return; }
                      setPackPayhipUrl("");
                      setPackGumroadUrl("");
                      setPackTags("");
                      setPackPreview(null);
                      load();
                    } catch { setPackError("Network error"); }
                    finally { setPackSaving(false); }
                  }}
                  disabled={packSaving || (!packPayhipUrl && !packGumroadUrl)}
                  className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--accent)] text-white shadow-[0_0_8px_var(--accent-glow)] hover:brightness-110 transition-all disabled:opacity-40 flex items-center gap-2"
                >
                  {packSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Add Pack
                </button>
              </div>

              {packError && (
                <div className="text-sm text-red-400 bg-red-950/20 border border-red-800/40 rounded-lg px-3 py-2">
                  {packError}
                </div>
              )}

              {packPreview && (
                <div className="rounded-xl border border-cyan-800/40 bg-cyan-950/10 p-4 space-y-3">
                  <div className="flex gap-4">
                    {packPreview.imageUrl && (
                      <img src={packPreview.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-bold text-sm">{packPreview.name}</div>
                      {packPreview.seller && <div className="text-xs text-[var(--muted-foreground)]">by {packPreview.seller}</div>}
                      <div className="text-xs text-cyan-400 mt-1">
                        {packPreview.priceCents === 0
                          ? "Free"
                          : `${(packPreview.priceCents / 100).toFixed(2)} ${packPreview.currency}`}
                        {packPreview.ratingAverage != null && (
                          <span className="ml-2 text-yellow-400">
                            {packPreview.ratingAverage.toFixed(1)} ({packPreview.ratingCount})
                          </span>
                        )}
                        {packPreview.salesCount != null && (
                          <span className="ml-2 text-green-400">{packPreview.salesCount} sales</span>
                        )}
                      </div>
                      {packPreview.description && (
                        <p className="text-xs text-[var(--muted-foreground)] mt-1 line-clamp-2">{packPreview.description}</p>
                      )}
                    </div>
                  </div>
                  {packPreview.variants.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-cyan-800/20">
                      <div className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
                        {packPreview.variants.length} Version{packPreview.variants.length !== 1 ? "s" : ""} found
                      </div>
                      {packPreview.variants.map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-[var(--background)]/50">
                          <span className="font-medium truncate">{v.name}</span>
                          <span className={`font-bold shrink-0 ml-2 ${v.priceCents === 0 ? "text-green-400" : "text-cyan-400"}`}>
                            {v.priceCents === 0 ? "Free" : `${(v.priceCents / 100).toFixed(2)} ${v.currency}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pack list */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--muted-foreground)] uppercase tracking-widest">
                {packs.length} Pack{packs.length !== 1 ? "s" : ""}
              </h3>
              {packs.map((pack) => {
                const isEditing = editingPackId === pack.id;
                return (
                <div key={pack.id} className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/60 p-4">
                  <div className="flex gap-4">
                    {pack.imageUrl && (
                      <img src={pack.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <input
                            value={editPackName}
                            onChange={(e) => setEditPackName(e.target.value)}
                            className="font-bold text-sm bg-[var(--background)] border border-[var(--muted)] rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-cyan-500/50 flex-1"
                          />
                        ) : (
                          <span className="font-bold text-sm truncate">{pack.name}</span>
                        )}
                        {!pack.published && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-900/30 text-yellow-400 border border-yellow-800/40">
                            Hidden
                          </span>
                        )}
                      </div>
                      {pack.seller && <div className="text-xs text-[var(--muted-foreground)]">by {pack.seller}</div>}
                      <div className="flex items-center gap-3 text-xs mt-1">
                        <span className="text-cyan-400">
                          {pack.priceCents === 0 ? "Free" : `${(pack.priceCents / 100).toFixed(2)} ${pack.currency}`}
                        </span>
                        {pack.ratingAverage != null && (
                          <span className="flex items-center gap-0.5 text-yellow-400">
                            <Star className="w-3 h-3" /> {pack.ratingAverage.toFixed(1)} ({pack.ratingCount})
                          </span>
                        )}
                        {pack.salesCount != null && (
                          <span className="text-green-400">{pack.salesCount} sales</span>
                        )}
                      </div>

                      {/* Edit mode: URL fields + tags */}
                      {isEditing ? (
                        <div className="mt-3 space-y-2">
                          <div>
                            <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest">Payhip URL</label>
                            <input
                              value={editPackPayhipUrl}
                              onChange={(e) => setEditPackPayhipUrl(e.target.value)}
                              placeholder="https://payhip.com/b/..."
                              className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-xs outline-none focus:ring-1 focus:ring-cyan-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest">Gumroad URL</label>
                            <input
                              value={editPackGumroadUrl}
                              onChange={(e) => setEditPackGumroadUrl(e.target.value)}
                              placeholder="https://...gumroad.com/l/..."
                              className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-xs outline-none focus:ring-1 focus:ring-cyan-500/50"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-[var(--muted-foreground)] uppercase tracking-widest">Tags (comma-separated)</label>
                            <input
                              value={editPackTags}
                              onChange={(e) => setEditPackTags(e.target.value)}
                              placeholder="phonk, drums, 808"
                              className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-xs outline-none focus:ring-1 focus:ring-cyan-500/50"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          {pack.tags.length > 0 && (
                            <div className="flex gap-1 mt-1.5 flex-wrap">
                              {pack.tags.map((tag) => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            {pack.payhipUrl && (
                              <a href={pack.payhipUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--muted-foreground)] hover:text-white flex items-center gap-0.5">
                                <ExternalLink className="w-3 h-3" /> Payhip
                              </a>
                            )}
                            {pack.gumroadUrl && (
                              <a href={pack.gumroadUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--muted-foreground)] hover:text-white flex items-center gap-0.5">
                                <ExternalLink className="w-3 h-3" /> Gumroad
                              </a>
                            )}
                          </div>
                        </>
                      )}

                      {pack.versions.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {pack.versions.map((v) => (
                            <span key={v.id} className="text-[10px] px-2 py-1 rounded-lg bg-[var(--background)] border border-[var(--muted)] inline-flex items-center gap-1.5">
                              <span className="text-[var(--muted-foreground)]">{v.name}</span>
                              <span className={`font-bold ${v.priceCents === 0 ? "text-green-400" : "text-cyan-400"}`}>
                                {v.priceCents === 0 ? "Free" : `${(v.priceCents / 100).toFixed(2)} ${v.currency}`}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      {/* Edit / Save / Cancel */}
                      {isEditing ? (
                        <>
                          <button
                            onClick={async () => {
                              setEditPackSaving(true);
                              await fetch(`/api/sample-packs/${pack.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  name: editPackName,
                                  payhipUrl: editPackPayhipUrl,
                                  gumroadUrl: editPackGumroadUrl,
                                  tags: editPackTags.split(",").map((t) => t.trim()).filter(Boolean),
                                }),
                              });
                              setEditPackSaving(false);
                              setEditingPackId(null);
                              load();
                            }}
                            disabled={editPackSaving}
                            className="p-1.5 rounded-lg bg-[var(--background)] border border-green-800/40 text-green-400 hover:bg-green-950/30 transition-all disabled:opacity-40"
                            title="Save changes"
                          >
                            {editPackSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => setEditingPackId(null)}
                            className="p-1.5 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingPackId(pack.id);
                            setEditPackName(pack.name);
                            setEditPackPayhipUrl(pack.payhipUrl || "");
                            setEditPackGumroadUrl(pack.gumroadUrl || "");
                            setEditPackTags(pack.tags.join(", "));
                          }}
                          className="p-1.5 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all"
                          title="Edit pack"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          setPackRescraping(pack.id);
                          await fetch(`/api/sample-packs/${pack.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ rescrape: true }),
                          });
                          setPackRescraping(null);
                          load();
                        }}
                        disabled={packRescraping === pack.id}
                        className="p-1.5 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all disabled:opacity-40"
                        title="Re-scrape metadata"
                      >
                        {packRescraping === pack.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={async () => {
                          await fetch(`/api/sample-packs/${pack.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ published: !pack.published }),
                          });
                          load();
                        }}
                        className="p-1.5 rounded-lg bg-[var(--background)] border border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white transition-all"
                        title={pack.published ? "Hide" : "Show"}
                      >
                        {pack.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Delete "${pack.name}"?`)) return;
                          await fetch(`/api/sample-packs/${pack.id}`, { method: "DELETE" });
                          load();
                        }}
                        className="p-1.5 rounded-lg bg-[var(--background)] border border-red-800/40 text-red-400 hover:bg-red-950/30 transition-all"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
              {packs.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-8">No sample packs added yet.</p>
              )}
            </div>
          </>
        )}

        {/* ── Labels Tab ── */}
        {activeTab === "labels" && (
          <>
            <h2 className="text-xl font-black tracking-tight mb-6 flex items-center gap-2">
              <Tag className="w-5 h-5 text-fuchsia-400" /> Submit Labels
            </h2>

            {/* Add label form */}
            <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5 mb-6 space-y-3">
              <p className="text-xs font-bold text-[var(--muted-foreground)] uppercase tracking-wider">Add New Label</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={newLabelName}
                  onChange={(e) => setNewLabelName(e.target.value)}
                  placeholder="Label name"
                  className="px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-fuchsia-500/50"
                />
                <input
                  value={newLabelEmail}
                  onChange={(e) => setNewLabelEmail(e.target.value)}
                  placeholder="demos@label.com"
                  className="px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-fuchsia-500/50"
                />
                <input
                  value={newLabelIconUrl}
                  onChange={(e) => setNewLabelIconUrl(e.target.value)}
                  placeholder="Icon URL (optional)"
                  className="px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--muted)] text-sm outline-none focus:ring-1 focus:ring-fuchsia-500/50"
                />
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={newLabelColor}
                    onChange={(e) => setNewLabelColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-[var(--muted)] cursor-pointer bg-transparent"
                  />
                  <span className="text-xs text-[var(--muted-foreground)]">{newLabelColor}</span>
                </div>
              </div>
              <button
                onClick={async () => {
                  if (!newLabelName.trim() || !newLabelEmail.trim()) return;
                  setLabelSaving(true);
                  const res = await fetch("/api/labels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      name: newLabelName.trim(),
                      email: newLabelEmail.trim(),
                      iconUrl: newLabelIconUrl.trim() || null,
                      color: newLabelColor,
                    }),
                  });
                  if (res.ok) {
                    const label = await res.json();
                    setAdminLabels((prev) => [...prev, label]);
                    setNewLabelName("");
                    setNewLabelEmail("");
                    setNewLabelIconUrl("");
                    setNewLabelColor("#c026d3");
                  }
                  setLabelSaving(false);
                }}
                disabled={labelSaving || !newLabelName.trim() || !newLabelEmail.trim()}
                className="px-4 py-2 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 text-sm font-bold text-fuchsia-400 hover:bg-fuchsia-500/25 disabled:opacity-40 transition-all flex items-center gap-2"
              >
                {labelSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Label
              </button>
            </div>

            {/* Labels list */}
            <div className="space-y-2">
              {adminLabels.map((label) => (
                <div
                  key={label.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    label.active
                      ? "bg-[var(--secondary)] border-[var(--muted)]"
                      : "bg-[var(--secondary)]/50 border-[var(--muted)] opacity-60"
                  }`}
                >
                  {label.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={label.iconUrl} alt="" className="w-8 h-8 rounded" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center text-xs font-black text-white"
                      style={{ backgroundColor: label.color }}
                    >
                      {label.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{label.name}</p>
                    <p className="text-xs text-[var(--muted-foreground)] truncate">{label.email}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        const res = await fetch(`/api/labels/${label.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ active: !label.active }),
                        });
                        if (res.ok) {
                          setAdminLabels((prev) =>
                            prev.map((l) => (l.id === label.id ? { ...l, active: !l.active } : l))
                          );
                        }
                      }}
                      className={`p-1.5 rounded-lg border transition-all ${
                        label.active
                          ? "bg-green-950/30 border-green-800/40 text-green-400 hover:bg-green-900/30"
                          : "bg-[var(--background)] border-[var(--muted)] text-[var(--muted-foreground)] hover:text-white"
                      }`}
                      title={label.active ? "Deactivate" : "Activate"}
                    >
                      {label.active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Delete label "${label.name}"?`)) return;
                        await fetch(`/api/labels/${label.id}`, { method: "DELETE" });
                        setAdminLabels((prev) => prev.filter((l) => l.id !== label.id));
                      }}
                      className="p-1.5 rounded-lg bg-[var(--background)] border border-red-800/40 text-red-400 hover:bg-red-950/30 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              {adminLabels.length === 0 && (
                <p className="text-sm text-[var(--muted-foreground)] text-center py-8">No labels added yet.</p>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
