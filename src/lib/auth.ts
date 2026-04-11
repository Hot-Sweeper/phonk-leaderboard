import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

// Only admins are bootstrapped via env. Moderators are managed in-app via invite codes.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
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
