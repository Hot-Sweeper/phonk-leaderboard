import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const IS_DEV = process.env.NODE_ENV === "development";

// Only admins are bootstrapped via env. Moderators are managed in-app via invite codes.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// Dev-only: fake admin session so local testing works without Google OAuth credentials
const DEV_SESSION = {
  user: { id: "dev-admin", name: "Dev Admin", email: "dev@local", role: "ADMIN" as const, image: null },
  expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
};

const devHandlers = {
  GET: () => NextResponse.json(DEV_SESSION),
  POST: () => NextResponse.json(DEV_SESSION),
};

const prod = IS_DEV ? null : NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  events: {
    async createUser({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return;
      if (ADMIN_EMAILS.includes(email)) {
        await prisma.user.update({
          where: { id: user.id! },
          data: { role: "ADMIN" },
        });
      }
    },
  },
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;

      // Ensure admin env emails always have ADMIN role (even if DB says otherwise)
      const email = user.email?.toLowerCase();
      let role = (user as { role?: string }).role as "USER" | "MODERATOR" | "ADMIN";
      if (email && ADMIN_EMAILS.includes(email) && role !== "ADMIN") {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "ADMIN" },
        });
        role = "ADMIN";
      }

      session.user.role = role;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});

const dev = IS_DEV ? devHandlers : null;

export const handlers = IS_DEV ? dev! : prod!.handlers;
export const auth = IS_DEV ? (() => Promise.resolve(DEV_SESSION)) : prod!.auth;
export const signIn = IS_DEV ? (() => Promise.resolve()) : prod!.signIn;
export const signOut = IS_DEV ? (() => Promise.resolve()) : prod!.signOut;
