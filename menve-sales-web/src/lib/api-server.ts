import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { auth } from "@/auth";
import { getTenantFromRequest } from "@/lib/tenant";

function isMenveMonorepoRoot(dir: string) {
  return (
    fs.existsSync(path.join(dir, "menve-sales-web", "package.json")) &&
    fs.existsSync(path.join(dir, "menve-sales-api", "package.json"))
  );
}

/** Carrega .env da raiz do monorepo mesmo quando cwd/Turbopack não é menve-sales-web. */
function loadMonorepoEnv() {
  const chain: string[] = [];
  let d = path.resolve(process.cwd());
  for (let i = 0; i < 12; i++) {
    chain.push(d);
    if (isMenveMonorepoRoot(d)) break;
    const parent = path.dirname(d);
    if (parent === d) break;
    d = parent;
  }
  for (const dir of [...chain].reverse()) {
    loadEnvConfig(dir);
  }
}

loadMonorepoEnv();

function apiBase() {
  const u = process.env.INTERNAL_API_URL?.replace(/\/$/, "");
  return u ?? "http://localhost:4000";
}

function apiKey() {
  return process.env.INTERNAL_API_KEY?.trim() ?? "";
}

/**
 * Authenticated server-side fetch to the Nest API (internal key + tenant context).
 */
export async function apiServer<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Não autenticado");
  }
  const tenant = await getTenantFromRequest();
  if (!tenant) {
    throw new Error("tenant");
  }
  const key = apiKey();
  if (!key) {
    throw new Error("INTERNAL_API_KEY is not set");
  }
  const { json, body, headers: h, ...rest } = init;
  const payload =
    json !== undefined ? JSON.stringify(json) : (body as BodyInit | undefined);
  const res = await fetch(`${apiBase()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    body: payload ?? body,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "x-user-id": session.user.id,
      "x-tenant-id": tenant.id,
      ...(h as Record<string, string>),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status}: ${t}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export async function apiServerText(path: string, init: RequestInit = {}): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Não autenticado");
  const tenant = await getTenantFromRequest();
  if (!tenant) throw new Error("tenant");
  const key = apiKey();
  if (!key) throw new Error("INTERNAL_API_KEY is not set");
  const res = await fetch(`${apiBase()}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: {
      "x-api-key": key,
      "x-user-id": session.user.id,
      "x-tenant-id": tenant.id,
      ...(init.headers as Record<string, string>),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.text();
}
