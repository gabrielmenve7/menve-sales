import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

export async function getTenantFromRequest() {
  const slug = await getTenantSlugFromRequest();

  // Produção na Vercel: mesmo DATABASE_URL do `migrate deploy` → leitura direta,
  // sem depender de INTERNAL_API_URL / rede até a Railway.
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
      // fallback HTTP abaixo
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

export async function requireTenant() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  return tenant;
}
