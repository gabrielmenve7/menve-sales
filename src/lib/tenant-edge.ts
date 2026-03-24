/** Usado no middleware (Edge) — sem Prisma */

/** Evita slug "" quando DEFAULT_TENANT_SLUG está vazio na Vercel (?? não cai no fallback). */
export function resolveTenantSlug(
  first: string | null | undefined,
  envDefault: string | undefined,
): string {
  const raw = first ?? envDefault ?? "demo";
  const t = typeof raw === "string" ? raw.trim() : "";
  return t || "demo";
}

export function getSubdomain(host: string): string | null {
  const hostOnly = host.split(":")[0]?.toLowerCase() ?? "";
  const parts = hostOnly.split(".");
  if (parts.length < 2) return null;
  const sub = parts[0];
  if (!sub || sub === "www") return null;
  return sub;
}
