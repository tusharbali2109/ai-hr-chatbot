import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls in pdfjs-dist, which references browser-only globals
  // (DOMMatrix) at module-eval time. Bundling it with Turbopack (the default
  // build bundler since Next 16) evaluates that code path and crashes with
  // "ReferenceError: DOMMatrix is not defined" — opting it out here keeps it
  // as a native Node `require` instead, which avoids the bad code path.
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    // Default is 1MB — too small for the open-ended assessment brief/
    // submission uploads (lib/actions/assessment.ts), which validate up to
    // 10MB themselves. Without this override those uploads 413 before ever
    // reaching that check.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
