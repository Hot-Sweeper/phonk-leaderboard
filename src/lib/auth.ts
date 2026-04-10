import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const MOD_EMAILS = (process.env.MOD_EMAILS ?? "")
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
      const role = ADMIN_EMAILS.includes(email)
        ? "ADMIN"
        : MOD_EMAILS.includes(email)
          ? "MODERATOR"
          : null;
      if (role) {
        await prisma.user.update({
          where: { id: user.id! },
          data: { role },
        });
      }
    },
  },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.role = (user as { role?: string }).role as
        | "USER"
        | "MODERATOR"
        | "ADMIN";
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
