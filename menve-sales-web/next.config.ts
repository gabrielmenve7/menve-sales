import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

/** Somente `menve-sales-web/.env` — Evolution e webhook da API ficam em `menve-sales-api/.env`. */
const appRoot = __dirname;
loadEnvConfig(appRoot);

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  /** Resposta do pareamento Evolution inclui data URL do QR; o padrão 1MB pode truncar/falhar no Flight. */
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  turbopack: {
    root: path.join(__dirname, ".."),
  },
  async redirects() {
    return [
      { source: "/analytics", destination: "/relatorios", permanent: true },
      { source: "/activities", destination: "/agenda", permanent: true },
      { source: "/pesquisa", destination: "/lista", permanent: true },
      { source: "/pesquisa/:path*", destination: "/lista/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
