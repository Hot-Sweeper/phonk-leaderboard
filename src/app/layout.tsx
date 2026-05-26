import type { Metadata } from "next";
import Script from "next/script";
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
      <head>
        <link rel="preconnect" href="https://open.spotify.com" />
        <link rel="preconnect" href="https://i.scdn.co" crossOrigin="" />
      </head>
      <body className="h-full bg-[var(--background)]">
        <Script id="spotify-iframe-api-bootstrap" strategy="beforeInteractive">
          {`window.onSpotifyIframeApiReady = function(api) {
  window.__spotifyIframeApi = api;
  window.__spotifyIframeScriptLoaded = true;
  window.dispatchEvent(new Event('spotify-iframe-api-ready'));
};`}
        </Script>
        <Script
          id="spotify-iframe-api"
          src="https://open.spotify.com/embed/iframe-api/v1"
          strategy="beforeInteractive"
        />
        <Providers session={initialSession}>
          <Navbar />
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
