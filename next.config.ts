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
  // Same file-tracing gap as above, for two more pdf-parse-internal files
  // Next's tracer doesn't follow:
  //  - @napi-rs/canvas's platform-specific native (.node) binary
  //    (e.g. @napi-rs/canvas-linux-x64-gnu on Vercel).
  //  - pdfjs-dist's worker script (legacy/build/pdf.worker.mjs), which
  //    pdf-parse loads dynamically at runtime rather than via a static
  //    `require`/`import` the tracer can follow. Without it present in the
  //    deployed function, pdfjs falls back to a "fake worker" it also
  //    can't set up, and text extraction silently degrades to generic
  //    interview questions instead of resume-grounded ones.
  // Force-including both matches Next's own documented pattern for native
  // packages like sharp.
  outputFileTracingIncludes: {
    "/*": ["node_modules/@napi-rs/canvas*/**/*", "node_modules/pdfjs-dist/**/*"],
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
