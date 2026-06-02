"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { CheckCircle, CreditCard, ExternalLink, Loader2, Lock, Sparkles } from "lucide-react";

type Entitlements = {
  authenticated: boolean;
  plan: { slug: string; name: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };
  features: Record<string, { name: string; value: unknown; valueType: string; unit: string | null; enabled: boolean; unlimited: boolean }>;
  usage: Record<string, { used: number; limit: number | null; remaining: number | null; unlimited: boolean }>;
};

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  rank: number;
  paddlePriceId: string | null;
  features: Array<{ value: unknown; feature: { key: string; name: string; valueType: string; unit: string | null } }>;
};

export default function BillingPage() {
  const { data: session, status } = useSession();
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingPlan, setWorkingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entitlementsResponse, plansResponse] = await Promise.all([
        fetch("/api/me/entitlements", { cache: "no-store" }),
        fetch("/api/plans", { cache: "no-store" }),
      ]);
      const [entitlementsPayload, plansPayload] = await Promise.all([
        entitlementsResponse.json(),
        plansResponse.json(),
      ]);
      if (!entitlementsResponse.ok) throw new Error(apiErrorMessage(entitlementsPayload, "Failed to load account."));
      if (!plansResponse.ok) throw new Error(apiErrorMessage(plansPayload, "Failed to load plans."));
      setEntitlements(entitlementsPayload);
      setPlans(plansPayload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load billing data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "loading") void loadData();
  }, [status, loadData]);

  async function startCheckout(planSlug: string) {
    if (!session) {
      void signIn("google", { callbackUrl: "/billing" });
      return;
    }
    setWorkingPlan(planSlug);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Failed to start checkout."));
      window.location.href = payload.checkoutUrl;
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Failed to start checkout.");
      setWorkingPlan(null);
    }
  }

  async function openPortal() {
    setWorkingPlan("portal");
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(payload, "Failed to open billing portal."));
      window.location.href = payload.portalUrl;
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "Failed to open billing portal.");
      setWorkingPlan(null);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-8 text-[var(--foreground)]">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--muted)] px-3 py-1 text-xs font-black uppercase tracking-widest text-[var(--muted-foreground)]">
              <CreditCard className="h-3.5 w-3.5" /> Account billing
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight">Plans and access</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
              Your tier controls limits and premium creator features. Payments and payment methods are handled securely through Paddle.
            </p>
          </div>
          {session && entitlements?.plan.slug !== "free" && (
            <button
              onClick={() => void openPortal()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--muted)] px-4 py-2 text-sm font-black text-[var(--muted-foreground)] hover:text-white"
            >
              {workingPlan === "portal" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
              Manage billing
            </button>
          )}
        </div>

        {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</div>}

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70">
            <Loader2 className="h-7 w-7 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <>
            <section className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-bold uppercase tracking-widest text-[var(--muted-foreground)]">Current plan</div>
                  <div className="mt-1 text-2xl font-black">{entitlements?.plan.name ?? "Free"}</div>
                  <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                    Status: {entitlements?.plan.status ?? "free"}
                    {entitlements?.plan.currentPeriodEnd ? ` · Renews ${new Date(entitlements.plan.currentPeriodEnd).toLocaleDateString()}` : ""}
                    {entitlements?.plan.cancelAtPeriodEnd ? " · Cancels at period end" : ""}
                  </div>
                </div>
                {!session && (
                  <button
                    onClick={() => void signIn("google", { callbackUrl: "/billing" })}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-black text-white"
                  >
                    <Sparkles className="h-4 w-4" /> Sign in with Google
                  </button>
                )}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              {plans.map((plan) => {
                const isCurrent = entitlements?.plan.slug === plan.slug;
                const isFree = plan.slug === "free";
                return (
                  <article key={plan.id} className={`rounded-xl border p-5 ${isCurrent ? "border-[var(--accent)] bg-[var(--accent-glow)]/20" : "border-[var(--muted)] bg-[var(--secondary)]/70"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-black">{plan.name}</h2>
                        <p className="mt-1 min-h-10 text-sm text-[var(--muted-foreground)]">{plan.description}</p>
                      </div>
                      {isCurrent && <CheckCircle className="h-5 w-5 text-[var(--accent)]" />}
                    </div>
                    <div className="mt-5 space-y-2">
                      {plan.features.slice(0, 7).map((planFeature) => (
                        <div key={planFeature.feature.key} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--background)]/40 px-3 py-2 text-sm">
                          <span className="text-[var(--muted-foreground)]">{planFeature.feature.name}</span>
                          <span className="font-bold">{formatFeatureValue(planFeature.value, planFeature.feature.valueType, planFeature.feature.unit)}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      disabled={isCurrent || (isFree && Boolean(session)) || workingPlan !== null}
                      onClick={() => void startCheckout(plan.slug)}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {workingPlan === plan.slug ? <Loader2 className="h-4 w-4 animate-spin" /> : isCurrent ? <CheckCircle className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                      {isCurrent ? "Current plan" : isFree ? "Free tier" : session ? "Upgrade" : "Sign in to upgrade"}
                    </button>
                  </article>
                );
              })}
            </section>

            {entitlements && Object.keys(entitlements.usage).length > 0 && (
              <section className="rounded-xl border border-[var(--muted)] bg-[var(--secondary)]/70 p-5">
                <h2 className="text-lg font-black">Current usage</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {Object.entries(entitlements.usage).map(([featureKey, usage]) => (
                    <div key={featureKey} className="rounded-lg border border-[var(--muted)] bg-[var(--background)]/45 p-4">
                      <div className="text-sm font-bold">{entitlements.features[featureKey]?.name ?? featureKey}</div>
                      <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                        {usage.unlimited ? `${usage.used} used · unlimited` : `${usage.used} used · ${usage.remaining} remaining`}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function formatFeatureValue(value: unknown, valueType: string, unit: string | null) {
  if (valueType === "BOOLEAN") return value === true ? "Yes" : "No";
  if (value === -1) return "Unlimited";
  if (unit && value !== null && value !== undefined && value !== "") return `${String(value)} ${unit}`;
  if (value === null || value === undefined || value === "") return "Off";
  if (typeof value === "object") return "Custom";
  return String(value);
}

function apiErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as { error?: unknown; action?: unknown; command?: unknown };
  return [body.error, body.action, body.command]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ") || fallback;
}