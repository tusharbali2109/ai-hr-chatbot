import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
