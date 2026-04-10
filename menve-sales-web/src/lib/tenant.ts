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
      "[menve/tenant] Falha ao resolver tenant por slug:",
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
