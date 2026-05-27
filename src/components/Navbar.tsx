"use client";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { Flame, Trophy, Shield, User, LogOut, LogIn, Settings, Package, Send, Zap } from "lucide-react";

export default function Navbar() {
  const { data: session } = useSession();
  const path = usePathname();

  const isPrivileged =
    session?.user?.role === "ADMIN" || session?.user?.role === "MODERATOR";

  const linkClass = (href: string, match?: boolean) =>
    `flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
      (match ?? path === href)
        ? "bg-[var(--muted)] text-white"
        : "text-[var(--muted-foreground)] hover:text-white"
    }`;

  const isRankings = path.startsWith("/rankings") || path === "/leaderboard" || path === "/bubbles" || path === "/songs";
  const isHype = path.startsWith("/hype");
  const isModeration = path === "/moderation" || path === "/review" || path === "/import";

  return (
    <nav className="sticky top-0 z-50 border-b border-[var(--muted)] bg-[var(--background)]/80 backdrop-blur-md">
      <div className="px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-black text-xl tracking-tighter shrink-0">
          <Flame className="w-6 h-6 text-[var(--accent)]" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-[var(--accent)]">
            Phonk Forum
          </span>
        </Link>

        {/* Nav links — only shown when sidebar is hidden (below lg) */}
        <div className="hidden sm:flex lg:hidden items-center gap-1">
          <Link href="/rankings" className={linkClass("/rankings", isRankings)}>
            <Trophy className="w-4 h-4" /> Rankings
          </Link>
          <Link href="/hype" className={linkClass("/hype", isHype)}>
            <Zap className="w-4 h-4" /> Hype
          </Link>
          <Link href="/samples" className={linkClass("/samples")}>
            <Package className="w-4 h-4" /> Samples
          </Link>
          <Link href="/submit" className={linkClass("/submit")}>
            <Send className="w-4 h-4" /> Submit
          </Link>
          {session && (
            <Link href="/moderation" className={linkClass("/moderation", isModeration)}>
              <Shield className="w-4 h-4" /> {isPrivileged ? "Moderation" : "Requests"}
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

        {/* Spotify attribution — visible on mobile (sidebar hidden on sm/md) */}
        <a
          href="https://www.spotify.com"
          target="_blank"
          rel="noopener noreferrer"
          className="lg:hidden flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-white transition-colors shrink-0"
          aria-label="Powered by Spotify"
        >
          <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0 fill-[#1DB954]" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          <span className="hidden sm:inline">Powered by Spotify</span>
        </a>
      </div>
    </nav>
  );
}
