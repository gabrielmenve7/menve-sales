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

/**
 * Por padrão só **avisa** (não encerra o processo), para o container abrir porta e
 * passar no healthcheck da Railway mesmo com Neon lento ou env ainda em ajuste.
 * Modo estrito: `ENFORCE_PRODUCTION_SECRETS=1` na Railway.
 */
export function assertProductionSecurityEnv(): void {
  if (process.env.NODE_ENV !== "production") return;

  const strict = process.env.ENFORCE_PRODUCTION_SECRETS === "1";

  const warnOrThrow = (msg: string) => {
    if (strict) throw new Error(msg);
    // eslint-disable-next-line no-console
    console.warn("[menve]", msg);
  };

  const jwt = process.env.JWT_SECRET?.trim();
  if (!jwt || jwt === WEAK_JWT || jwt.length < 24) {
    warnOrThrow(
      "Produção: defina JWT_SECRET forte (≥24 caracteres). Ex.: openssl rand -base64 48. Exigir falha no deploy: ENFORCE_PRODUCTION_SECRETS=1",
    );
  }

  const internal = process.env.INTERNAL_API_KEY?.trim();
  if (!internal || internal.length < 16) {
    warnOrThrow(
      "Produção: defina INTERNAL_API_KEY (≥16 caracteres), igual na Vercel. Exigir falha no deploy: ENFORCE_PRODUCTION_SECRETS=1",
    );
  } else if (internal === WEAK_INTERNAL) {
    // eslint-disable-next-line no-console
    console.warn(
      "[menve] INTERNAL_API_KEY ainda é o placeholder de dev — rotacione na Railway e na Vercel.",
    );
  }

  if (!process.env.CORS_ORIGIN?.trim()) {
    // eslint-disable-next-line no-console
    console.warn(
      "[menve] CORS_ORIGIN vazio em produção: qualquer origem pode chamar a API (reflect). Defina a URL do front.",
    );
  }
}

assertProductionSecurityEnv();
