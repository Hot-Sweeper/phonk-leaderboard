"use client";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Flame, Trophy, Shield, Upload, User, LogOut, LogIn, Settings, Music, Package, Circle } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();
  const path = usePathname();

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const linkClass = (href: string) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      path === href
        ? "bg-[var(--muted)] text-white"
        : "text-[var(--muted-foreground)] hover:text-white"
    }`;

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--muted)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tighter">
          <Flame className="w-6 h-6 text-[var(--accent)]" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
            Phonk Forum
          </span>
        </Link>

        {/* Nav links */}
        <div className="hidden sm:flex items-center gap-1">
          <Link href="/leaderboard" className={linkClass("/leaderboard")}>
            <Trophy className="w-4 h-4" /> Phonk Ranks
          </Link>
          <Link href="/bubbles" className={linkClass("/bubbles")}>
            <Circle className="w-4 h-4" /> Bubbles
          </Link>
          <Link href="/songs" className={linkClass("/songs")}>
            <Music className="w-4 h-4" /> Songs
          </Link>
          <Link href="/samples" className={linkClass("/samples")}>
            <Package className="w-4 h-4" /> Samples
          </Link>
          {session && (
            <Link href="/review" className={linkClass("/review")}>
              <Shield className="w-4 h-4" /> {isPrivileged ? "Review" : "My Requests"}
            </Link>
          )}
          {isPrivileged && (
            <Link href="/import" className={linkClass("/import")}>
              <Upload className="w-4 h-4" /> Import
            </Link>
          )}
          {session?.user?.role === "ADMIN" && (
            <Link href="/admin" className={linkClass("/admin")}>
              <Settings className="w-4 h-4" /> Admin
            </Link>
          )}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Link href="/review" className="flex items-center gap-2">
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name ?? "Profile"}
                    className="w-8 h-8 rounded-full border border-[var(--muted)]"
                  />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center">
                    <User className="w-4 h-4" />
                  </span>
                )}
                <span className="hidden md:block text-sm font-semibold">
                  {session.user.name}
                </span>
              </Link>
              <button
                onClick={() => signOut()}
                className="p-2 rounded-lg text-[var(--muted-foreground)] hover:text-white transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <button
              onClick={() => signIn("google")}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent)] hover:bg-[#a21caf] text-white text-sm font-bold transition-all shadow-[0_0_15px_var(--accent-glow)]"
            >
              <LogIn className="w-4 h-4" /> Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
