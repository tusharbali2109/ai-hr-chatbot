import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse pulls in pdfjs-dist, which references browser-only globals
  // (DOMMatrix) at module-eval time. Bundling it with Turbopack (the default
  // build bundler since Next 16) evaluates that code path and crashes with
  // "ReferenceError: DOMMatrix is not defined" — opting it out here keeps it
  // as a native Node `require` instead, which avoids the bad code path.
  // @napi-rs/canvas ships a native (.node) binary — same reasoning as
  // pdf-parse above, external so its platform binary is resolved via native
  // Node require rather than mis-traced/mishandled by the bundler.
  serverExternalPackages: ["pdf-parse", "@napi-rs/canvas"],
  // @napi-rs/canvas's platform-specific native (.node) binary
  // (e.g. @napi-rs/canvas-linux-x64-gnu on Vercel) isn't picked up by
  // Next's automatic file tracer, so it's dropped from the deployed
  // function and require() fails at runtime in production even though it
  // works locally. Force-include it, matching Next's own documented
  // pattern for native packages like sharp.
  outputFileTracingIncludes: {
    "/*": ["node_modules/@napi-rs/canvas*/**/*"],
  },
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
