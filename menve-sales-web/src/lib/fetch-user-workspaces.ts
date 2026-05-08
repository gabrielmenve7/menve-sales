import path from "node:path";
import { loadEnvConfig } from "@next/env";
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

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

/** Lista completa de workspaces para o shell — não entra no cookie JWT (evita REQUEST_HEADER_TOO_LARGE). */
export async function fetchUserWorkspaces(
  accessToken: string,
): Promise<WorkspaceListRow[]> {
  const token = accessToken.trim();
  if (!token) return [];

  const r = await fetch(`${apiBase()}/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) return [];

  const data = (await r.json()) as WorkspaceListRow[];
  return Array.isArray(data) ? data : [];
}
