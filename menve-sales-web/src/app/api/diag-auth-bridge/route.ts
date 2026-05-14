import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Diagnóstico server-side da ponte Next → API (somente o que está nas envs do host atual).
 *
 * Proteção: header `x-diag-key` deve coincidir com `INTERNAL_API_KEY`.
 * Não devolve segredos; só host/path da URL, contagem de caracteres e status HTTP.
 *
 * Uso:
 *   curl -X POST -H "x-diag-key: <INTERNAL_API_KEY>" https://<seu-site>/api/diag-auth-bridge
 */
function maskUrl(value: string | undefined): {
  configured: boolean;
  origin: string | null;
  pathname: string | null;
  raw_length: number;
  trailing_slash: boolean;
} {
  if (!value) {
    return {
      configured: false,
      origin: null,
      pathname: null,
      raw_length: 0,
      trailing_slash: false,
    };
  }
  const trimmed = value.trim();
  const trailing_slash = trimmed.endsWith("/");
  try {
    const u = new URL(trimmed);
    return {
      configured: true,
      origin: `${u.protocol}//${u.host}`,
      pathname: u.pathname === "/" ? "" : u.pathname,
      raw_length: trimmed.length,
      trailing_slash,
    };
  } catch {
    return {
      configured: true,
      origin: null,
      pathname: null,
      raw_length: trimmed.length,
      trailing_slash,
    };
  }
}

async function probe(url: string, init: RequestInit) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...init, cache: "no-store" });
    const text = await r.text().catch(() => "");
    return {
      url,
      method: init.method ?? "GET",
      ok: r.ok,
      status: r.status,
      content_type: r.headers.get("content-type"),
      body_snippet: text.slice(0, 200),
      duration_ms: Date.now() - t0,
    };
  } catch (e) {
    return {
      url,
      method: init.method ?? "GET",
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : String(e),
      duration_ms: Date.now() - t0,
    };
  }
}

async function runDiagnostic(req: Request) {
  const expected = process.env.INTERNAL_API_KEY?.trim();
  const provided = req.headers.get("x-diag-key")?.trim();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "INTERNAL_API_KEY não configurado no Next." },
      { status: 500 },
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { ok: false, error: "x-diag-key inválido." },
      { status: 401 },
    );
  }

  const rawBase = process.env.INTERNAL_API_URL;
  const internalApiUrl = maskUrl(rawBase);
  const base = rawBase?.replace(/\/$/, "") ?? "http://localhost:4000";

  const probes = await Promise.all([
    probe(`${base}/health`, { method: "GET" }),
    probe(`${base}/health/live`, { method: "GET" }),
    probe(`${base}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "_diag@invalid.local",
        password: "wrong-password-diag",
      }),
    }),
    probe(`${base}/auth/me`, { method: "GET" }),
  ]);

  const verdict: string[] = [];
  const health = probes[0];
  const login = probes[2];

  if (!internalApiUrl.configured) {
    verdict.push(
      "INTERNAL_API_URL não está definido. Defina-o na Vercel apontando para a URL pública HTTPS da API Nest (sem barra no final).",
    );
  }
  if (internalApiUrl.trailing_slash) {
    verdict.push(
      "INTERNAL_API_URL termina com '/'. Remova a barra final na Vercel.",
    );
  }
  if (internalApiUrl.pathname && internalApiUrl.pathname.length > 0) {
    verdict.push(
      `INTERNAL_API_URL tem path "${internalApiUrl.pathname}". Use só a base (origin) da API Nest; o código já anexa /auth/login.`,
    );
  }
  if (health.status !== 200) {
    verdict.push(
      `GET /health não retornou 200 (status ${health.status}). URL pode não ser a API Nest, ou o serviço está fora.`,
    );
  } else if (login.status === 404) {
    verdict.push(
      "GET /health OK mas POST /auth/login deu 404. A URL parece ser de outro serviço (Next, proxy) sem as rotas da API Nest.",
    );
  } else if (login.status === 401) {
    verdict.push(
      "POST /auth/login com credenciais inválidas → 401 (esperado). A ponte está OK; o erro do usuário é senha errada ou outra causa.",
    );
  } else if (login.status >= 500) {
    verdict.push(
      `POST /auth/login devolveu ${login.status} — erro interno na API (Prisma, JWT, banco). Veja logs do serviço da API.`,
    );
  }

  return NextResponse.json({
    ok: true,
    env: {
      NODE_ENV: process.env.NODE_ENV ?? null,
      VERCEL: Boolean(process.env.VERCEL),
      VERCEL_ENV: process.env.VERCEL_ENV ?? null,
      NEXTAUTH_URL_configured: Boolean(process.env.NEXTAUTH_URL),
      AUTH_SECRET_present: Boolean(
        process.env.AUTH_SECRET?.trim() ||
          process.env.NEXTAUTH_SECRET?.trim(),
      ),
      INTERNAL_API_KEY_present: true,
      INTERNAL_API_URL: internalApiUrl,
      DATABASE_URL_present: Boolean(process.env.DATABASE_URL?.trim()),
      DIRECT_URL_present: Boolean(process.env.DIRECT_URL?.trim()),
    },
    base_used: base,
    probes,
    verdict,
  });
}

export async function POST(req: Request) {
  return runDiagnostic(req);
}

export async function GET(req: Request) {
  return runDiagnostic(req);
}
