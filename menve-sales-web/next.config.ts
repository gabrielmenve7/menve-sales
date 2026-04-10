import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

/** Somente `menve-sales-web/.env` — Evolution e webhook da API ficam em `menve-sales-api/.env`. */
const appRoot = __dirname;
loadEnvConfig(appRoot);

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  async redirects() {
    return [
      { source: "/analytics", destination: "/dashboard", permanent: true },
      { source: "/activities", destination: "/dashboard", permanent: true },
    ];
  },
};

export default nextConfig;
