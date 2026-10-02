import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@student-academic-ai/core",
    "@student-academic-ai/types",
  ],
};

export default nextConfig;
