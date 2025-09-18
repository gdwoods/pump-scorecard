// next.config.ts
import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // 👇 Move this out of experimental
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
