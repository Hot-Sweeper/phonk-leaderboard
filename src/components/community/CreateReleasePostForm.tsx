"use client";

import { FormEvent, useState } from "react";
import { Loader2, Plus } from "lucide-react";

const KINDS = [
  { value: "RELEASE", label: "New release" },
  { value: "UPDATE", label: "Update" },
  { value: "COLLAB", label: "Collab call" },
  { value: "OTHER", label: "Other" },
] as const;

export default function CreateReleasePostForm({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("RELEASE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [trackId, setTrackId] = useState("");
  const [tags, setTags] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/community/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          body: body.trim() || undefined,
          externalUrl: externalUrl.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          trackId: trackId.trim() || undefined,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Failed to create post.");
        return;
      }

      setTitle("");
      setBody("");
      setExternalUrl("");
      setImageUrl("");
      setTrackId("");
      setTags("");
      setOpen(false);
      onCreated?.();
    } catch {
      setError("Failed to create post.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#a21caf]"
      >
        <Plus className="h-4 w-4" />
        New post
      </button>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="rounded-2xl border border-[var(--muted)] bg-[var(--secondary)]/30 p-5"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white/70">Create post</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-semibold text-[var(--muted-foreground)] hover:text-white"
        >
          Cancel
        </button>
      </div>

      <div className="grid gap-3">
        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Type</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as (typeof KINDS)[number]["value"])}
            className="rounded-xl border border-[var(--muted)] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          >
            {KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            minLength={3}
            maxLength={160}
            placeholder="New single out now — DRIFT PHONK"
            className="rounded-xl border border-[var(--muted)] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Body</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            maxLength={5000}
            placeholder="Tell the community about your drop, collab needs, or update…"
            className="rounded-xl border border-[var(--muted)] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Link</span>
            <input
              value={externalUrl}
              onChange={(event) => setExternalUrl(event.target.value)}
              placeholder="Spotify, SoundCloud, YouTube…"
              className="rounded-xl border border-[var(--muted)] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Cover image URL</span>
            <input
              value={imageUrl}
              onChange={(event) => setImageUrl(event.target.value)}
              placeholder="Optional artwork URL"
              className="rounded-xl border border-[var(--muted)] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
              Catalog track ID
            </span>
            <input
              value={trackId}
              onChange={(event) => setTrackId(event.target.value)}
              placeholder="Optional — link a ranked track"
              className="rounded-xl border border-[var(--muted)] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">Tags</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="phonk, drift, collab"
              className="rounded-xl border border-[var(--muted)] bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            />
          </label>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Publish
      </button>
    </form>
  );
}
