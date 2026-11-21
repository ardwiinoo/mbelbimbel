import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Image Docker kecil: server.js + node_modules hasil tracing (lihat Dockerfile).
  output: "standalone",
  // File migrasi SQL tidak di-import kode, jadi disertakan manual ke output standalone
  // (dijalankan saat server start oleh src/instrumentation.ts).
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*"],
  },
  serverExternalPackages: ["@react-pdf/renderer"],
  // Badge dev Next.js default di kiri bawah menutupi bottom-nav mobile
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
