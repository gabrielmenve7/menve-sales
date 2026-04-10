import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

for (const envPath of [
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "..", ".env"),
]) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    break;
  }
}

const WEAK_JWT = "dev-jwt-secret-change-in-production";
const WEAK_INTERNAL = "dev-internal-key-change-me";

/** Falha cedo em produção se segredos obrigatórios estiverem ausentes ou de exemplo. */
export function assertProductionSecurityEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const jwt = process.env.JWT_SECRET?.trim();
  if (!jwt || jwt === WEAK_JWT || jwt.length < 24) {
    throw new Error(
      "Produção: defina JWT_SECRET forte (≥24 caracteres), não use o valor de desenvolvimento. Ex.: openssl rand -base64 48",
    );
  }

  const internal = process.env.INTERNAL_API_KEY?.trim();
  if (!internal || internal === WEAK_INTERNAL || internal.length < 16) {
    throw new Error(
      "Produção: defina INTERNAL_API_KEY forte (≠ dev-internal-key-change-me), igual na Vercel e na Railway.",
    );
  }

  if (!process.env.CORS_ORIGIN?.trim()) {
    // eslint-disable-next-line no-console
    console.warn(
      "[menve] CORS_ORIGIN vazio em produção: qualquer origem pode chamar a API (reflect). Defina a URL do front (ex.: https://app.seudominio.com).",
    );
  }
}

assertProductionSecurityEnv();
