/**
 * Diagnóstico local do fluxo de login (Next → API).
 * Não imprime valores de segredo; só presença/tamanho e origem da URL.
 *
 * Uso:
 *   node menve-sales-api/scripts/validate-auth-bridge.mjs
 *
 * Testar a URL pública da API (ex.: Railway), sem alterar o .env:
 *   VALIDATE_AUTH_BRIDGE_BASE=https://sua-api.example.com node menve-sales-api/scripts/validate-auth-bridge.mjs
 *
 * Testar produção via rota /api/_diag/auth-bridge do Next (revela INTERNAL_API_URL real):
 *   DIAG_SITE_URL=https://mnvsales.vercel.app DIAG_KEY=<INTERNAL_API_KEY> \
 *     node menve-sales-api/scripts/validate-auth-bridge.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiEnvPath = path.join(__dirname, "..", ".env");
const webEnvPath = path.join(__dirname, "..", "..", "menve-sales-web", ".env");

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return { __fileMissing: true };
  const o = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    let s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const i = s.indexOf("=");
    if (i === -1) continue;
    const k = s.slice(0, i).trim();
    let v = s.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[k] = v;
  }
  return o;
}

function statusKey(name, v) {
  if (v === undefined) return `${name}: AUSENTE`;
  if (String(v).trim() === "") return `${name}: VAZIO`;
  return `${name}: OK (${String(v).length} caracteres)`;
}

function safeOrigin(urlStr) {
  try {
    const u = new URL(urlStr);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "(URL inválida)";
  }
}

let exitCode = 0;
function fail(msg) {
  console.error("FALHA:", msg);
  exitCode = 1;
}

const api = parseEnv(apiEnvPath);
const web = parseEnv(webEnvPath);

console.log("\n=== Arquivos .env ===");
console.log(
  api.__fileMissing
    ? `API: ${apiEnvPath} — arquivo não encontrado`
    : `API: ${apiEnvPath} — encontrado`,
);
console.log(
  web.__fileMissing
    ? `Web: ${webEnvPath} — arquivo não encontrado`
    : `Web: ${webEnvPath} — encontrado`,
);

console.log("\n=== Variáveis API (menve-sales-api/.env) ===");
if (!api.__fileMissing) {
  console.log(statusKey("JWT_SECRET", api.JWT_SECRET));
  console.log(statusKey("DATABASE_URL", api.DATABASE_URL));
  console.log(statusKey("INTERNAL_API_KEY", api.INTERNAL_API_KEY));
  if (process.env.NODE_ENV === "production" || api.NODE_ENV === "production") {
    if (!api.JWT_SECRET?.trim()) fail("Em produção JWT_SECRET é obrigatório.");
  } else {
    console.log(
      "(Checagem NODE_ENV=production no host: sem JWT_SECRET a API não sobe.)",
    );
  }
}

console.log("\n=== Variáveis Web (menve-sales-web/.env) ===");
if (!web.__fileMissing) {
  const base =
    web.INTERNAL_API_URL?.replace(/\/$/, "") || "http://localhost:4000";
  console.log(statusKey("INTERNAL_API_URL", web.INTERNAL_API_URL));
  console.log("  → origem resolvida:", safeOrigin(base));
  if (base.includes("localhost") || base.includes("127.0.0.1")) {
    console.log(
      "  → aviso: localhost é OK só em dev; na Vercel (Production) use a URL HTTPS da API.",
    );
  }
  console.log(statusKey("INTERNAL_API_KEY", web.INTERNAL_API_KEY));
}

if (!api.__fileMissing && !web.__fileMissing) {
  const ak = api.INTERNAL_API_KEY?.trim();
  const wk = web.INTERNAL_API_KEY?.trim();
  if (ak && wk && ak !== wk) {
    fail("INTERNAL_API_KEY da API e do Web não coincidem (pode quebrar outras rotas server-side).");
  } else if (ak && wk) {
    console.log("\nINTERNAL_API_KEY: API e Web coincidem (OK).");
  }
}

const apiBase = (() => {
  const override = process.env.VALIDATE_AUTH_BRIDGE_BASE?.trim();
  if (override) return override.replace(/\/$/, "");
  if (!web.__fileMissing && web.INTERNAL_API_URL?.trim()) {
    return web.INTERNAL_API_URL.replace(/\/$/, "");
  }
  return "http://localhost:4000";
})();

console.log("\n=== Chamadas HTTP (fetch) ===");
if (process.env.VALIDATE_AUTH_BRIDGE_BASE?.trim()) {
  console.log(
    "(Base via VALIDATE_AUTH_BRIDGE_BASE — fetches não usam INTERNAL_API_URL do .env.)",
  );
}
console.log("Base usada:", apiBase);

try {
  const h = await fetch(`${apiBase}/health`, { method: "GET" });
  const ht = await h.text();
  console.log(`GET /health → ${h.status} ${h.statusText}`);
  if (!h.ok) {
    fail(`/health não OK — API pode estar fora ou URL errada.`);
    console.error("  corpo (trecho):", ht.slice(0, 200));
  }
} catch (e) {
  fail(`Rede em GET /health: ${e?.message || e}`);
}

try {
  const r = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "_validate_bridge@invalid.local",
      password: "wrong-password-validate-bridge",
    }),
  });
  const t = await r.text();
  console.log(`POST /auth/login (credenciais inválidas) → ${r.status}`);
  if (r.status === 401) {
    console.log(
      "  → esperado para login inválido: API respondeu 401 (rota e auth OK).",
    );
  } else if (r.status === 429) {
    console.log("  → 429 rate limit (rota existe; credencial não foi o foco).");
  } else if (r.status >= 500) {
    fail(`POST /auth/login retornou ${r.status} — investigar logs da API / DB / Prisma.`);
    console.error("  corpo (trecho):", t.slice(0, 300));
  } else {
    console.log("  corpo (trecho):", t.slice(0, 200));
    if (r.status === 404) {
      fail("404 em /auth/login — INTERNAL_API_URL pode não ser a API Nest (ex.: domínio do Next).");
    }
  }
} catch (e) {
  fail(`Rede em POST /auth/login: ${e?.message || e}`);
}

const diagSite = process.env.DIAG_SITE_URL?.trim();
const diagKey = process.env.DIAG_KEY?.trim();
if (diagSite && diagKey) {
  const url = `${diagSite.replace(/\/$/, "")}/api/_diag/auth-bridge`;
  console.log("\n=== Diagnóstico remoto (via Next /api/_diag/auth-bridge) ===");
  console.log("URL:", url);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "x-diag-key": diagKey },
    });
    const t = await r.text();
    console.log("Status:", r.status);
    try {
      const j = JSON.parse(t);
      console.log(JSON.stringify(j, null, 2));
    } catch {
      console.log(t.slice(0, 800));
    }
    if (!r.ok) fail(`Diagnóstico remoto retornou ${r.status}.`);
  } catch (e) {
    fail(`Falha ao chamar diagnóstico remoto: ${e?.message || e}`);
  }
} else {
  console.log(
    "\n(Defina DIAG_SITE_URL e DIAG_KEY para diagnóstico remoto em produção.)",
  );
}

console.log("\n=== Fim do relatório ===\n");
process.exit(exitCode);
