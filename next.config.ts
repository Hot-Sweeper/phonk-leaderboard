import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "mosaic.scdn.co" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "cdn-images.dzcdn.net" },
      { protocol: "https", hostname: "api.deezer.com" },
      { protocol: "https", hostname: "payhip.com" },
      { protocol: "https", hostname: "*.s3.amazonaws.com" },
      { protocol: "https", hostname: "public-files.gumroad.com" },
      { protocol: "https", hostname: "i1.sndcdn.com" },
      { protocol: "https", hostname: "*.sndcdn.com" },
    ],
  },
  async redirects() {
    return [
      { source: "/leaderboard", destination: "/rankings", permanent: true },
      { source: "/bubbles", destination: "/rankings?view=bubbles", permanent: true },
      { source: "/songs", destination: "/rankings?entity=songs", permanent: true },
      { source: "/review", destination: "/moderation", permanent: true },
      { source: "/import", destination: "/moderation", permanent: true },
    ];
  },
};

export default nextConfig;
