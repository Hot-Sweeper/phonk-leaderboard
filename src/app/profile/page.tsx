"use client";
import { useState, useEffect } from "react";
import { useSession, signIn } from "next-auth/react";
import { User, Music2, Video, Camera, AtSign, Save, ExternalLink } from "lucide-react";

export default function ProfilePage() {
  const { data: session, status } = useSession();

  const [form, setForm] = useState({
    bio: "",
    spotifyUrl: "",
    soundcloudUrl: "",
    instagramUrl: "",
    twitterUrl: "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch(`/api/profile?id=${session.user.id}`)
      .then((r) => r.json())
      .then((u) => {
        if (u.id) {
          setForm({
            bio: u.bio ?? "",
            spotifyUrl: u.spotifyUrl ?? "",
            soundcloudUrl: u.soundcloudUrl ?? "",
            instagramUrl: u.instagramUrl ?? "",
            twitterUrl: u.twitterUrl ?? "",
          });
        }
      });
  }, [session?.user?.id]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-[var(--muted-foreground)]">Loading...</div>;
  }

  if (!session) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-6 text-center px-4">
        <User className="w-16 h-16 text-[var(--accent)]" />
        <h1 className="text-2xl font-black">Sign in to view your profile</h1>
        <p className="text-[var(--muted-foreground)]">Connect your Google account to get your Phonk Ranks profile.</p>
        <button
          onClick={() => signIn("google")}
          className="px-6 py-3 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all shadow-[0_0_20px_var(--accent-glow)]"
        >
          Sign in with YouTube
        </button>
      </main>
    );
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10">
      <div className="max-w-2xl mx-auto">

        {/* Profile Header */}
        <div className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex items-center gap-5 mb-6">
          {session.user.image ? (
            <img src={session.user.image} alt={session.user.name ?? ""} className="w-16 h-16 rounded-full border-2 border-[var(--accent)]" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[var(--muted)] flex items-center justify-center">
              <User className="w-8 h-8 text-[var(--muted-foreground)]" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-black">{session.user.name}</h1>
            <p className="text-[var(--muted-foreground)] text-sm">{session.user.email}</p>
            <span className={`mt-1 inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
              session.user.role === "ADMIN" ? "bg-red-900/50 text-red-300" :
              session.user.role === "MODERATOR" ? "bg-blue-900/50 text-blue-200" :
              "bg-zinc-700/50 text-zinc-400"
            }`}>{session.user.role}</span>
          </div>
        </div>

        {/* Edit Form */}
        <form onSubmit={handleSave} className="bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6 flex flex-col gap-5">
          <h2 className="text-lg font-black">Edit Profile</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase text-[var(--muted-foreground)]">Bio</label>
            <textarea
              placeholder="Tell the phonk community about yourself..."
              value={form.bio}
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
              rows={3}
              className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm resize-none outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { key: "spotifyUrl", label: "Spotify", icon: <Music2 className="w-4 h-4 text-green-400" />, placeholder: "https://open.spotify.com/artist/..." },
              { key: "soundcloudUrl", label: "SoundCloud", icon: <Music2 className="w-4 h-4 text-orange-400" />, placeholder: "https://soundcloud.com/..." },
              { key: "instagramUrl", label: "Instagram", icon: <Camera className="w-4 h-4 text-pink-400" />, placeholder: "https://instagram.com/..." },
              { key: "twitterUrl", label: "Twitter / X", icon: <AtSign className="w-4 h-4 text-sky-400" />, placeholder: "https://x.com/..." },
            ].map(({ key, label, icon, placeholder }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase text-[var(--muted-foreground)] flex items-center gap-1.5">{icon}{label}</label>
                <input
                  type="url"
                  placeholder={placeholder}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="bg-[var(--muted)] rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[var(--accent)] placeholder:text-zinc-600"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-4 mt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white font-bold transition-all disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Profile"}
            </button>
            {saved && <span className="text-green-400 text-sm font-semibold">Saved!</span>}
          </div>
        </form>

        {/* Linked channels */}
        <div className="mt-6 bg-[var(--secondary)] border border-[var(--muted)] rounded-2xl p-6">
          <h2 className="text-lg font-black mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-red-400" /> Your YouTube Channel</h2>
          <p className="text-[var(--muted-foreground)] text-sm">
            Your channel will appear on the leaderboard once you submit it. Go to the{" "}
            <a href="/" className="text-[var(--accent)] hover:underline inline-flex items-center gap-1">
              channels page <ExternalLink className="w-3 h-3" />
            </a>{" "}
            and click &quot;Add Channel&quot; to register it.
          </p>
        </div>

      </div>
    </main>
  );
}
