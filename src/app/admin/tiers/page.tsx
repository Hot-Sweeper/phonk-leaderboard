"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Check,
  Database,
  Layers,
  Loader2,
  Plus,
  Save,
  SlidersHorizontal,
  ToggleLeft,
} from "lucide-react";

type FeatureValueType = "BOOLEAN" | "NUMBER" | "STRING" | "JSON";

type Feature = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: string;
  valueType: FeatureValueType;
  unit: string | null;
  defaultValue: unknown;
  active: boolean;
  sortOrder: number;
};

type PlanFeature = {
  id: string;
  planId: string;
  featureId: string;
  value: unknown;
  feature: Feature;
};

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  rank: number;
  active: boolean;
  public: boolean;
  paddleProductId: string | null;
  paddlePriceId: string | null;
  features: PlanFeature[];
  _count: { subscriptions: number };
};

type WebhookEvent = {
  id: string;
  eventType: string;
  status: string;
  error: string | null;
  createdAt: string;
  processedAt: string | null;
};

type EntitlementAdminData = {
  plans: Plan[];
  features: Feature[];
  recentWebhookEvents: WebhookEvent[];
};

const VALUE_TYPES: FeatureValueType[] = ["BOOLEAN", "NUMBER", "STRING", "JSON"];

export default function AdminTiersPage() {
  const { data: session, status } = useSession();
  const [data, setData] = useState<EntitlementAdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState({ slug: "", name: "", rank: 10, public: true });
  const [newFeature, setNewFeature] = useState({
    key: "",
    name: "",
    category: "General",
    valueType: "BOOLEAN" as FeatureValueType,
    unit: "",
    defaultValue: "false",
  });

  const isAdmin = session?.user?.role === "ADMIN";

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/entitlements", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Failed to load tiers."));
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load tiers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void loadData();
    if (status === "unauthenticated") setLoading(false);
  }, [status, loadData]);

  const featureById = useMemo(() => {
    const map = new Map<string, Feature>();
    data?.features.forEach((feature) => map.set(feature.id, feature));
    return map;
  }, [data]);

  async function patchEntity(body: Record<string, unknown>) {
    setSavingKey(JSON.stringify(body));
    setError(null);
    try {
      const response = await fetch("/api/admin/entitlements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Failed to save changes."));
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save changes.");
    } finally {
      setSavingKey(null);
    }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingKey("new-plan");
    setError(null);
    try {
      const response = await fetch("/api/admin/entitlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "plan", ...newPlan }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Failed to create tier."));
      setNewPlan({ slug: "", name: "", rank: 10, public: true });
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create tier.");
    } finally {
      setSavingKey(null);
    }
  }

  async function createFeature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingKey("new-feature");
    setError(null);
    try {
      const response = await fetch("/api/admin/entitlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "feature", ...newFeature }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Failed to create feature."));
      setNewFeature({ key: "", name: "", category: "General", valueType: "BOOLEAN", unit: "", defaultValue: "false" });
      await loadData();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create feature.");
    } finally {
      setSavingKey(null);
    }
  }

  if (status === "loading" || loading) {
    return <AdminTiersShell><LoadingPanel /></AdminTiersShell>;
  }

  if (!isAdmin) {
    return (
      <AdminTiersShell>
        <div className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-6">
          <h1 className="text-xl font-black">Admin access required</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Tier and feature configuration is only available to admins.</p>
        </div>
      </AdminTiersShell>
    );
  }

  return (
    <AdminTiersShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to admin
            </Link>
            <h1 className="mt-3 text-3xl font-black tracking-tight">Tiers and features</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
              Configure plans, feature flags, numeric limits, Paddle price IDs, and defaults without changing code.
            </p>
          </div>
          <button
            onClick={() => void loadData()}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--muted)] px-4 py-2 text-sm font-bold text-[var(--muted-foreground)] hover:text-white"
          >
            <Activity className="h-4 w-4" /> Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
          <form onSubmit={createPlan} className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-5">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--muted-foreground)]">
              <Layers className="h-4 w-4" /> New tier
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <TextField label="Slug" value={newPlan.slug} onChange={(value) => setNewPlan((plan) => ({ ...plan, slug: value }))} placeholder="vip" />
              <TextField label="Name" value={newPlan.name} onChange={(value) => setNewPlan((plan) => ({ ...plan, name: value }))} placeholder="VIP" />
              <TextField label="Rank" type="number" value={String(newPlan.rank)} onChange={(value) => setNewPlan((plan) => ({ ...plan, rank: Number(value) }))} />
              <label className="flex items-center gap-2 rounded-lg border border-[var(--muted)] bg-[var(--background)]/60 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={newPlan.public}
                  onChange={(event) => setNewPlan((plan) => ({ ...plan, public: event.target.checked }))}
                />
                Public tier
              </label>
            </div>
            <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-black text-white">
              {savingKey === "new-plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create tier
            </button>
          </form>

          <form onSubmit={createFeature} className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-5">
            <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--muted-foreground)]">
              <SlidersHorizontal className="h-4 w-4" /> New feature
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TextField label="Key" value={newFeature.key} onChange={(value) => setNewFeature((feature) => ({ ...feature, key: value }))} placeholder="downloads_per_month" />
              <TextField label="Name" value={newFeature.name} onChange={(value) => setNewFeature((feature) => ({ ...feature, name: value }))} placeholder="Downloads" />
              <TextField label="Category" value={newFeature.category} onChange={(value) => setNewFeature((feature) => ({ ...feature, category: value }))} />
              <label className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                Type
                <select
                  value={newFeature.valueType}
                  onChange={(event) => setNewFeature((feature) => ({ ...feature, valueType: event.target.value as FeatureValueType }))}
                  className="mt-1 w-full rounded-lg border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white"
                >
                  {VALUE_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </label>
              <TextField label="Unit" value={newFeature.unit} onChange={(value) => setNewFeature((feature) => ({ ...feature, unit: value }))} placeholder="per month" />
              <TextField label="Default" value={newFeature.defaultValue} onChange={(value) => setNewFeature((feature) => ({ ...feature, defaultValue: value }))} placeholder="false" />
            </div>
            <button className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-black text-white">
              {savingKey === "new-feature" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create feature
            </button>
          </form>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          {data?.plans.map((plan) => {
            const planFeatureById = new Map(plan.features.map((planFeature) => [planFeature.featureId, planFeature]));
            return (
              <article key={plan.id} className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="Tier name"
                        defaultValue={plan.name}
                        onBlur={(event) => void patchEntity({ type: "plan", id: plan.id, name: event.target.value })}
                        className="w-full max-w-64 bg-transparent text-xl font-black outline-none focus:text-[var(--accent)]"
                      />
                      <span className="rounded-full border border-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]">
                        {plan._count.subscriptions} users
                      </span>
                    </div>
                    <input
                      aria-label="Tier slug"
                      defaultValue={plan.slug}
                      onBlur={(event) => void patchEntity({ type: "plan", id: plan.id, slug: event.target.value })}
                      className="mt-1 w-full bg-transparent font-mono text-xs text-[var(--muted-foreground)] outline-none focus:text-white"
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs font-bold text-[var(--muted-foreground)]">
                    <Toggle label="Active" checked={plan.active} onChange={(active) => void patchEntity({ type: "plan", id: plan.id, active })} />
                    <Toggle label="Public" checked={plan.public} onChange={(isPublic) => void patchEntity({ type: "plan", id: plan.id, public: isPublic })} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <TextField label="Rank" type="number" defaultValue={String(plan.rank)} onBlur={(value) => void patchEntity({ type: "plan", id: plan.id, rank: Number(value) })} />
                  <TextField label="Paddle product ID" defaultValue={plan.paddleProductId ?? ""} onBlur={(value) => void patchEntity({ type: "plan", id: plan.id, paddleProductId: value })} />
                  <TextField label="Paddle price ID" defaultValue={plan.paddlePriceId ?? ""} onBlur={(value) => void patchEntity({ type: "plan", id: plan.id, paddlePriceId: value })} />
                </div>

                <textarea
                  aria-label="Tier description"
                  defaultValue={plan.description ?? ""}
                  onBlur={(event) => void patchEntity({ type: "plan", id: plan.id, description: event.target.value })}
                  className="mt-3 min-h-16 w-full resize-y rounded-lg border border-[var(--muted)] bg-[var(--background)]/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                  placeholder="Tier description"
                />

                <div className="mt-4 overflow-hidden rounded-lg border border-[var(--muted)]">
                  {data.features.map((feature) => (
                    <div key={feature.id} className="grid gap-3 border-b border-[var(--muted)] bg-[var(--background)]/35 p-3 last:border-b-0 md:grid-cols-[1fr_180px] md:items-center">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold">{feature.name}</span>
                          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                            {feature.valueType}
                          </span>
                        </div>
                        <div className="mt-1 font-mono text-xs text-[var(--muted-foreground)]">{feature.key}</div>
                      </div>
                      <FeatureValueInput
                        feature={featureById.get(feature.id) ?? feature}
                        planFeature={planFeatureById.get(feature.id)}
                        onSave={(value) => void patchEntity({ type: "planFeature", planId: plan.id, featureId: feature.id, value })}
                      />
                    </div>
                  ))}
                </div>
              </article>
            );
          })}
        </section>

        <section className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-5">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--muted-foreground)]">
            <Database className="h-4 w-4" /> Feature catalog
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {data?.features.map((feature) => (
              <div key={feature.id} className="rounded-lg border border-[var(--muted)] bg-[var(--background)]/45 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <input
                      aria-label="Feature name"
                      defaultValue={feature.name}
                      onBlur={(event) => void patchEntity({ type: "feature", id: feature.id, name: event.target.value })}
                      className="w-full bg-transparent text-sm font-black outline-none focus:text-[var(--accent)]"
                    />
                    <input
                      aria-label="Feature key"
                      defaultValue={feature.key}
                      onBlur={(event) => void patchEntity({ type: "feature", id: feature.id, key: event.target.value })}
                      className="mt-1 w-full bg-transparent font-mono text-xs text-[var(--muted-foreground)] outline-none focus:text-white"
                    />
                  </div>
                  <Toggle label="Active" checked={feature.active} onChange={(active) => void patchEntity({ type: "feature", id: feature.id, active })} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <TextField label="Category" defaultValue={feature.category} onBlur={(value) => void patchEntity({ type: "feature", id: feature.id, category: value })} />
                  <TextField label="Unit" defaultValue={feature.unit ?? ""} onBlur={(value) => void patchEntity({ type: "feature", id: feature.id, unit: value })} />
                  <TextField label="Sort" type="number" defaultValue={String(feature.sortOrder)} onBlur={(value) => void patchEntity({ type: "feature", id: feature.id, sortOrder: Number(value) })} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
                    Value type
                    <select
                      defaultValue={feature.valueType}
                      onChange={(event) => void patchEntity({ type: "feature", id: feature.id, valueType: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-[var(--muted)] bg-[var(--background)] px-3 py-2 text-sm text-white"
                    >
                      {VALUE_TYPES.map((type) => <option key={type}>{type}</option>)}
                    </select>
                  </label>
                  <TextField label="Default value" defaultValue={valueToInput(feature.defaultValue)} onBlur={(value) => void patchEntity({ type: "feature", id: feature.id, defaultValue: value })} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-5">
          <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[var(--muted-foreground)]">
            <Activity className="h-4 w-4" /> Recent billing webhooks
          </div>
          <div className="mt-4 space-y-2">
            {data?.recentWebhookEvents.length ? data.recentWebhookEvents.map((event) => (
              <div key={event.id} className="grid gap-2 rounded-lg border border-[var(--muted)] bg-[var(--background)]/45 p-3 text-sm md:grid-cols-[1fr_110px_170px] md:items-center">
                <div>
                  <div className="font-bold">{event.eventType}</div>
                  {event.error && <div className="mt-1 text-xs text-red-200">{event.error}</div>}
                </div>
                <span className="rounded-full bg-[var(--muted)] px-2 py-1 text-center text-xs font-black uppercase tracking-widest text-[var(--muted-foreground)]">
                  {event.status}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">{new Date(event.createdAt).toLocaleString()}</span>
              </div>
            )) : (
              <p className="text-sm text-[var(--muted-foreground)]">No billing webhooks received yet.</p>
            )}
          </div>
        </section>
      </div>
    </AdminTiersShell>
  );
}

function AdminTiersShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="mx-auto max-w-7xl">{children}</div>
    </main>
  );
}

function LoadingPanel() {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70">
      <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
    </div>
  );
}

function TextField({
  label,
  value,
  defaultValue,
  onChange,
  onBlur,
  type = "text",
  placeholder,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
      {label}
      <input
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        onBlur={onBlur ? (event) => onBlur(event.target.value) : undefined}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-[var(--muted)] bg-[var(--background)]/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--muted-foreground)]">
      <input type="checkbox" defaultChecked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function FeatureValueInput({
  feature,
  planFeature,
  onSave,
}: {
  feature: Feature;
  planFeature?: PlanFeature;
  onSave: (value: unknown) => void;
}) {
  const value = planFeature?.value ?? feature.defaultValue;
  if (feature.valueType === "BOOLEAN") {
    return (
      <button
        type="button"
        onClick={() => onSave(!toBoolean(value))}
        className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black ${
          toBoolean(value) ? "bg-[var(--accent)] text-white" : "border border-[var(--muted)] text-[var(--muted-foreground)]"
        }`}
      >
        {toBoolean(value) ? <Check className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
        {toBoolean(value) ? "Enabled" : "Disabled"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type={feature.valueType === "NUMBER" ? "number" : "text"}
        defaultValue={valueToInput(value)}
        onBlur={(event) => onSave(event.target.value)}
        className="w-full rounded-lg border border-[var(--muted)] bg-[var(--background)]/60 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
      />
      <Save className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
    </div>
  );
}

function valueToInput(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["true", "1", "yes", "on"].includes(value.toLowerCase());
  return false;
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as { error?: unknown; action?: unknown; command?: unknown };
  return [body.error, body.action, body.command]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ") || fallback;
}