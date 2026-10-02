import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@student-academic-ai/core",
    "@student-academic-ai/types",
    "@student-academic-ai/database",
    "@student-academic-ai/api",
  ],
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./node_modules/@prisma/client/**/*",
      "../../node_modules/@prisma/client/**/*",
      "../../packages/database/prisma/**/*",
    ],
  },
};

export default nextConfig;

