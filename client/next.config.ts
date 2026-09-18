import type { NextConfig } from "next";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
if (process.env.VERCEL && !apiBase) {
  throw new Error("Set NEXT_PUBLIC_API_BASE_URL to the backend HTTPS origin before deploying.");
}
if (apiBase) {
  const url = new URL(apiBase);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    (process.env.VERCEL && url.protocol !== "https:")
  ) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be a backend origin without /api or credentials; Vercel requires HTTPS.",
    );
  }
}

const nextConfig: NextConfig = {};

export default nextConfig;
