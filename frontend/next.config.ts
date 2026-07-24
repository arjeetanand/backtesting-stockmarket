import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep concurrent local dev instances isolated (the launcher sets this per port).
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
