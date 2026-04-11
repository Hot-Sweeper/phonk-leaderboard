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
  Link2,
  Trash2,
} from "lucide-react";

type ArtistRequest = {
  id: string;
  type: string;
  name: string;
  links: string;
  artistId: string | null;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewNote: string | null;
  createdAt: string;
  user: { name: string | null; image: string | null; email: string | null };
};

type LinkSuggestion = {
  id: string;
  platform: string;
  url: string;
  note: string | null;
  createdAt: string;
  artist: { name: string };
  user: { name: string | null; image: string | null };
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

const PLATFORM_COLORS: Record<string, string> = {
  YOUTUBE: "text-red-400",
  SPOTIFY: "text-green-400",
  TIKTOK: "text-cyan-400",
  INSTAGRAM: "text-fuchsia-400",
};

export default function ReviewPage() {
  const { data: session, status } = useSession();
  const [requests, setRequests] = useState<ArtistRequest[]>([]);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const load = useCallback(async () => {
    const [reqRes, sugRes] = await Promise.all([
      fetch("/api/requests"),
      isPrivileged ? fetch("/api/suggestions") : Promise.resolve(null),
    ]);
    if (reqRes.ok) setRequests(await reqRes.json());
    if (sugRes?.ok) setSuggestions(await sugRes.json());
    setLoading(false);
  }, [isPrivileged]);

  useEffect(() => {
    if (session) load();
  }, [session, load]);

  async function handleReview(
    id: string,
    type: "request" | "suggestion",
    action: "approve" | "reject"
  ) {
    const body: Record<string, string> =
      type === "request"
        ? { requestId: id, action, reviewNote: reviewNotes[id] || "" }
        : { suggestionId: id, action };

    const res = await fetch("/api/requests/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) load();
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
      </main>
    );
  }

  const pendingReqs = requests.filter((r) => r.status === "PENDING");
  const reviewedReqs = requests.filter((r) => r.status !== "PENDING");

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10 font-sans relative">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:40px_40px]" />

      <div className="max-w-3xl mx-auto relative z-10">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter flex items-center gap-3">
            <Shield className="w-8 h-8 text-[var(--accent)]" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
              {isPrivileged ? "Review Queue" : "My Requests"}
            </span>
          </h1>
        </div>

        {/* ── Pending Link Suggestions (mods only) ── */}
        {isPrivileged && suggestions.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-cyan-400" />
              Link Suggestions ({suggestions.length})
            </h2>
            <div className="flex flex-col gap-3">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5"
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex items-center gap-3">
                      {s.user.image ? (
                        <img
                          src={s.user.image}
                          alt=""
                          className="w-7 h-7 rounded-full"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center">
                          <User className="w-3 h-3" />
                        </div>
                      )}
                      <span className="text-sm font-bold">
                        {s.user.name}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${PLATFORM_COLORS[s.platform] ?? ""} bg-white/5`}
                    >
                      {s.platform}
                    </span>
                  </div>
                  <div className="text-sm mb-1">
                    For{" "}
                    <strong className="text-[var(--accent)]">
                      {s.artist.name}
                    </strong>
                  </div>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] text-sm flex items-center gap-1 hover:underline mb-1"
                  >
                    {s.url} <ExternalLink className="w-3 h-3" />
                  </a>
                  {s.note && (
                    <p className="text-[var(--muted-foreground)] text-xs italic">
                      {s.note}
                    </p>
                  )}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() =>
                        handleReview(s.id, "suggestion", "approve")
                      }
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() =>
                        handleReview(s.id, "suggestion", "reject")
                      }
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

        {/* ── Pending Artist Requests ── */}
        {pendingReqs.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-yellow-400" />
              Pending ({pendingReqs.length})
            </h2>
            <div className="flex flex-col gap-3">
              {pendingereqs(pendingReqs, isPrivileged, reviewNotes, setReviewNotes, handleReview)}
            </div>
          </div>
        )}

        {/* ── Reviewed ── */}
        {reviewedReqs.length > 0 && (
          <div>
            <h2 className="text-lg font-black mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-zinc-400" />
              Reviewed ({reviewedReqs.length})
            </h2>
            <div className="flex flex-col gap-3">
              {reviewedReqs.map((req) => {
                const StatusIcon = STATUS_ICONS[req.status];
                return (
                  <div
                    key={req.id}
                    className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-4 opacity-60"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {req.user.image ? (
                          <img
                            src={req.user.image}
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
                            {req.name}
                          </div>
                          <div className="text-[var(--muted-foreground)] text-xs">
                            by {req.user.name ?? req.user.email}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[req.status]}`}
                      >
                        <StatusIcon className="w-3 h-3" />
                        {req.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {requests.length === 0 && suggestions.length === 0 && (
          <div className="text-center text-[var(--muted-foreground)] py-20">
            {isPrivileged
              ? "No pending items to review."
              : "You haven't submitted any requests yet."}
          </div>
        )}
      </div>
    </main>
  );
}

/* Helper to render pending request cards */
function pendingereqs(
  reqs: ArtistRequest[],
  isPrivileged: boolean,
  reviewNotes: Record<string, string>,
  setReviewNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>,
  handleReview: (id: string, type: "request" | "suggestion", action: "approve" | "reject") => void
) {
  return reqs.map((req) => (
    <div
      key={req.id}
      className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-5"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-3">
          {req.user.image ? (
            <img src={req.user.image} alt="" className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-[var(--muted)] flex items-center justify-center">
              <User className="w-3 h-3" />
            </div>
          )}
          <div>
            <div className="font-bold text-sm">{req.user.name ?? req.user.email}</div>
            <div className="text-[var(--muted-foreground)] text-xs">
              {new Date(req.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
          req.type === "REMOVAL"
            ? "bg-red-900/50 text-red-300"
            : "bg-yellow-900/50 text-yellow-300"
        }`}>
          {req.type === "REMOVAL" ? "Removal" : "Pending"}
        </span>
      </div>

      <div className="font-bold mb-1 flex items-center gap-2">
        {req.type === "REMOVAL" && <Trash2 className="w-4 h-4 text-red-400" />}
        {req.name}
      </div>
      {req.type !== "REMOVAL" && (
        <div className="text-[var(--muted-foreground)] text-sm whitespace-pre-line mb-2">
          {req.links}
        </div>
      )}
      {req.reason && (
        <p className="text-[var(--muted-foreground)] text-sm italic mb-2">
          &ldquo;{req.reason}&rdquo;
        </p>
      )}

      {isPrivileged && (
        <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-[var(--muted)]">
          <input
            placeholder="Review note (optional)"
            value={reviewNotes[req.id] ?? ""}
            onChange={(e) =>
              setReviewNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
            }
            className="bg-[var(--muted)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => handleReview(req.id, "request", "approve")}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-bold"
            >
              <Check className="w-3.5 h-3.5" /> Approve
            </button>
            <button
              onClick={() => handleReview(req.id, "request", "reject")}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-bold"
            >
              <X className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
      )}
    </div>
  ));
}
