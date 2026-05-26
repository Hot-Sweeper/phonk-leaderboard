import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import Navbar from "@/components/Navbar";
import AppShell from "@/components/AppShell";
import { auth } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Phonk Forum - The Home of Phonk",
  description: "The ultimate community hub for Phonk artists — rankings, trending songs, sample packs, and more.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const initialSession = process.env.NODE_ENV === "development"
    ? await auth()
    : undefined;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full bg-[var(--background)]">
        <Providers session={initialSession}>
          <Navbar />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
