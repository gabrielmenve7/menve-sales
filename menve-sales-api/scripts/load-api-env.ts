import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Garante `menve-sales-api/.env` carregado ao rodar scripts via `tsx` a partir da raiz do monorepo. */
const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiEnvPath = resolve(scriptDir, "..", ".env");

if (existsSync(apiEnvPath)) {
  const content = readFileSync(apiEnvPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}
