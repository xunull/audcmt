import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['keytar', 'better-sqlite3'],
};

export default nextConfig;
