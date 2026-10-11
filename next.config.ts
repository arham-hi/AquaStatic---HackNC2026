import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server must not overwrite the main server's generated chunks.
  distDir: process.env.AQUA_PREVIEW === "true" ? ".next-preview" : ".next",
  serverExternalPackages: ["postgres", "spectrum-ts"],
  experimental: { serverActions: { bodySizeLimit: "1mb" } },
};

export default nextConfig;
