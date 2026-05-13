#!/usr/bin/env node
/**
 * Build na Vercel: Prisma + Neon costumam falhar na 1ª conexão com
 * "FATAL: terminating connection due to administrator command" (compute suspend / pooler).
 * Este script valida DIRECT_URL, gera o client e roda migrate deploy com retentativas.
 *
 * @see https://neon.tech/docs/guides/prisma
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, "..");
const schema = "./menve-sales-api/prisma/schema.prisma";

function prismaCliEntry() {
  return path.join(
    path.dirname(require.resolve("prisma/package.json")),
    "build",
    "index.js",
  );
}

function runPrisma(args) {
  const cli = prismaCliEntry();
  const r = spawnSync(process.execPath, [cli, ...args], {
    cwd: monorepoRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (r.error && (r.status === null || r.status === undefined)) {
    console.error("[vercel] prisma CLI:", r.error.message);
    return 1;
  }
  return r.status ?? 1;
}

function runNodeScript(rel) {
  const script = path.join(monorepoRoot, rel);
  const r = spawnSync(process.execPath, [script], {
    cwd: monorepoRoot,
    stdio: "inherit",
    env: process.env,
  });
  return r.status ?? 1;
}

async function runPrismaWithRetry(label, args, attempts, baseDelayMs) {
  for (let i = 1; i <= attempts; i++) {
    const code = runPrisma(args);
    if (code === 0) return;
    const wait = baseDelayMs * i;
    console.error(
      `[vercel] ${label} falhou com código ${code} (tentativa ${i}/${attempts}).`,
    );
    if (i === attempts) process.exit(code);
    console.error(`[vercel] Aguardando ${wait}ms antes de tentar de novo…`);
    await delay(wait);
  }
}

const codeCheck = runNodeScript("./scripts/vercel-check-direct-url.mjs");
if (codeCheck !== 0) process.exit(codeCheck);

await runPrismaWithRetry(
  "prisma generate",
  ["generate", "--schema", schema],
  4,
  3000,
);

await runPrismaWithRetry(
  "prisma migrate deploy",
  ["migrate", "deploy", "--schema", schema],
  6,
  5000,
);
