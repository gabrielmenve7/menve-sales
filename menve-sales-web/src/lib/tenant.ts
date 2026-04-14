import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getSessionCached } from "@/lib/get-session-cached";
import { getSubdomain, resolveTenantSlug } from "@/lib/tenant-edge";

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

/** Slug usado em `/tenants/by-slug/:slug` (subdomínio, header ou DEFAULT_TENANT_SLUG). */
export async function getTenantSlugFromRequest(): Promise<string> {
  const h = await headers();
  const forwarded =
    h.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase() ?? "";
  const host = (forwarded || h.get("host")?.toLowerCase() || "").trim();
  const sub = getSubdomain(host);
  return resolveTenantSlug(
    sub ?? h.get("x-tenant-slug"),
    process.env.DEFAULT_TENANT_SLUG,
  );
}

/**
 * Resolve o tenant do contexto atual.
 * Usuário logado: prioriza `session.user.tenantId` (workspace ativo na sessão).
 * Visitante: slug do host / DEFAULT_TENANT_SLUG.
 */
async function getTenantFromRequestUncached() {
  const session = await getSessionCached();
  const isSuperAdmin =
    session?.user != null &&
    (session.user.globalRole ?? session.user.role) === "SUPER_ADMIN";

  if (session?.user?.tenantId && process.env.DATABASE_URL?.trim()) {
    try {
      const { getTenantByIdFromDb } = await import("@/lib/tenant-db");
      const fromDb = await getTenantByIdFromDb(session.user.tenantId);
      if (fromDb) return fromDb;
    } catch (e) {
      console.error(
        "[menve/tenant] Postgres indisponível para tenantId da sessão:",
        session.user.tenantId,
        e,
      );
    }
    return null;
  }

  if (session?.user?.id && !session.user.tenantId && !isSuperAdmin) {
    return null;
  }

  const slug = await getTenantSlugFromRequest();

  if (process.env.DATABASE_URL?.trim()) {
    try {
      const { getTenantBySlugFromDb } = await import("@/lib/tenant-db");
      const fromDb = await getTenantBySlugFromDb(slug);
      if (fromDb) return fromDb;
      return null;
    } catch (e) {
      console.error(
        "[menve/tenant] Postgres (DATABASE_URL) indisponível para slug:",
        slug,
        e,
      );
    }
  }

  try {
    const res = await fetch(
      `${apiBase()}/tenants/by-slug/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const tenant = await res.json();
    return tenant;
  } catch (e) {
    console.error(
      "[menve/tenant] Falha ao resolver tenant por slug (API):",
      slug,
      e,
    );
    return null;
  }
}

/** Uma resolução de tenant por request (layout + vários `apiServer` em paralelo). */
export const getTenantFromRequest = cache(getTenantFromRequestUncached);

export async function requireTenant() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  return tenant;
}
