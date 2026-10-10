import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "spectrum-ts"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
