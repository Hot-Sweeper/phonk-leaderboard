"use client";
import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import {
  Shield,
  Check,
  X,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  User,
} from "lucide-react";

type ChannelRequest = {
  id: string;
  url: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  user: { name: string | null; image: string | null; email: string | null };
};

const STATUS_STYLES = {
  PENDING: "bg-yellow-900/50 text-yellow-300",
  APPROVED: "bg-green-900/50 text-green-300",
  REJECTED: "bg-red-900/50 text-red-300",
};

const STATUS_ICONS = {
  PENDING: Clock,
  APPROVED: CheckCircle,
  REJECTED: XCircle,
};

export default function ReviewPage() {
  const { data: session, status } = useSession();
  const [requests, setRequests] = useState<ChannelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const loadRequests = useCallback(async () => {
    const res = await fetch("/api/requests");
    if (res.ok) setRequests(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (session) loadRequests();
  }, [session, loadRequests]);

  async function handleReview(requestId: string, action: "approve" | "reject") {
    const res = await fetch("/api/requests/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId,
        action,
        reviewNote: reviewNotes[requestId] || "",
      }),
    });
    if (res.ok) {
      loadRequests();
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">
        Loading...
      </div>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4">
        <Shield className="w-16 h-16 text-[var(--accent)]" />
        <h1 className="text-2xl font-black">Sign in required</h1>
        <p className="text-[var(--muted-foreground)]">
          You need to be signed in to view this page.
        </p>
      </main>
    );
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const reviewed = requests.filter((r) => r.status !== "PENDING");

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:32px_32px] opacity-20" />

      <div className="max-w-3xl mx-auto relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3 text-transparent bg-clip-text bg-gradient-to-br from-white to-[var(--accent)]">
            <Shield className="w-8 h-8 text-[var(--accent)]" />
            {isPrivileged ? "Review Queue" : "My Requests"}
          </h1>
          <p className="text-[var(--muted-foreground)] mt-1">
            {isPrivileged
              ? "Review channel join requests from users."
              : "Track the status of your channel requests."}
          </p>
        </div>

        {/* Pending Requests */}
        {pending.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              Pending ({pending.length})
            </h2>
            <div className="flex flex-col gap-3">
              {pending.map((req) => (
                <div
                  key={req.id}
                  className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-3">
                      {req.user.image ? (
                        <img
                          src={req.user.image}
                          alt={req.user.name ?? ""}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                          <User className="w-4 h-4" />
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-sm">
                          {req.user.name ?? req.user.email}
                        </div>
                        <div className="text-[var(--muted-foreground)] text-xs">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${STATUS_STYLES.PENDING}`}
                    >
                      Pending
                    </span>
                  </div>

                  <a
                    href={req.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline text-sm flex items-center gap-1 mb-2"
                  >
                    {req.url} <ExternalLink className="w-3 h-3" />
                  </a>

                  {req.reason && (
                    <p className="text-[var(--muted-foreground)] text-sm mb-3 italic">
                      &ldquo;{req.reason}&rdquo;
                    </p>
                  )}

                  {isPrivileged && (
                    <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--muted)]">
                      <input
                        placeholder="Review note (optional)"
                        value={reviewNotes[req.id] ?? ""}
                        onChange={(e) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [req.id]: e.target.value,
                          }))
                        }
                        className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReview(req.id, "approve")}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold transition-colors"
                        >
                          <Check className="w-4 h-4" /> Approve
                        </button>
                        <button
                          onClick={() => handleReview(req.id, "reject")}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold transition-colors"
                        >
                          <X className="w-4 h-4" /> Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reviewed Requests */}
        {reviewed.length > 0 && (
          <div>
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-zinc-400" />
              Reviewed ({reviewed.length})
            </h2>
            <div className="flex flex-col gap-3">
              {reviewed.map((req) => {
                const StatusIcon = STATUS_ICONS[req.status];
                return (
                  <div
                    key={req.id}
                    className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 opacity-70"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {req.user.image ? (
                          <img
                            src={req.user.image}
                            alt={req.user.name ?? ""}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                            <User className="w-4 h-4" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">
                            {req.user.name ?? req.user.email}
                          </div>
                          <a
                            href={req.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--muted-foreground)] text-xs hover:text-white truncate flex items-center gap-1"
                          >
                            {req.url} <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[req.status]}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {req.status}
                      </span>
                    </div>
                    {req.reviewNote && (
                      <p className="text-[var(--muted-foreground)] text-xs mt-2 italic">
                        Note: {req.reviewNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {requests.length === 0 && (
          <div className="text-center text-[var(--muted-foreground)] py-20">
            {isPrivileged
              ? "No pending requests."
              : "You haven't submitted any requests yet."}
          </div>
        )}
      </div>
    </main>
  );
}
