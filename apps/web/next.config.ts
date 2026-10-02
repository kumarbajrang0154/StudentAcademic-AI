import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const apiUrlEnv = process.env.API_URL;

let apiUrl: string;

if (isProd) {
  if (!apiUrlEnv || !apiUrlEnv.trim()) {
    throw new Error(
      "API_URL must be a public https URL. In production, API_URL is missing.",
    );
  }

  const trimmed = apiUrlEnv.trim().replace(/\/+$/, "");
  const isLocalOrPrivate =
    trimmed.includes("localhost") ||
    trimmed.includes("127.0.0.1") ||
    trimmed.includes("0.0.0.0") ||
    /^https?:\/\/(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(trimmed);

  if (isLocalOrPrivate && process.env.ALLOW_LOCAL_API !== "true") {
    throw new Error(
      `API_URL must be a public https URL. In production, API_URL cannot be localhost or private IP ("${trimmed}"). On Vercel, this causes "404 DNS_HOSTNAME_RESOLVED_PRIVATE".`,
    );
  }

  apiUrl = trimmed;
} else {
  // In development only, fallback to localhost:4000
  apiUrl = (
    apiUrlEnv ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:4000"
  )
    .trim()
    .replace(/\/+$/, "");
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@student-academic-ai/core",
    "@student-academic-ai/types",
  ],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
