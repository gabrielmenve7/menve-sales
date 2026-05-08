import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { cache } from "react";
import type { UserRole } from "@/types/domain";

const cwd = process.cwd();
const monorepoRoot =
  path.basename(cwd) === "menve-sales-web" ? path.resolve(cwd, "..") : cwd;
loadEnvConfig(monorepoRoot);
loadEnvConfig(cwd);

export type WorkspaceListRow = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  image?: string | null;
  role: UserRole;
};

export type AuthMeForWebSession = {
  name: string | null;
  email: string;
  image: string | null;
  workspaces: WorkspaceListRow[];
};

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

/**
 * Uma chamada GET /auth/me hidrata shell e páginas sem colocar lista/foto no cookie JWT
 * (evita REQUEST_HEADER_TOO_LARGE na Vercel). Dedup por request React (`cache`).
 */
async function fetchAuthMeForWebSessionImpl(
  accessToken: string,
): Promise<AuthMeForWebSession | null> {
  const token = accessToken.trim();
  if (!token) return null;

  const r = await fetch(`${apiBase()}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) return null;

  const u = (await r.json()) as {
    name?: string | null;
    email?: string;
    image?: string | null;
    workspaces?: WorkspaceListRow[];
  };

  return {
    name: u.name ?? null,
    email: typeof u.email === "string" ? u.email : "",
    image: typeof u.image === "string" ? u.image : null,
    workspaces: Array.isArray(u.workspaces) ? u.workspaces : [],
  };
}

export const fetchAuthMeForWebSession = cache(fetchAuthMeForWebSessionImpl);
