import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets parallel QA runs use separate dev servers (NEXT_DIST_DIR=.next-<name>).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
