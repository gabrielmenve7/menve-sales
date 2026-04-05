import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSubdomain, resolveTenantSlug } from "@/lib/tenant-edge";

function apiBase() {
  return process.env.INTERNAL_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
}

export async function getTenantFromRequest() {
  const h = await headers();
  const forwarded =
    h.get("x-forwarded-host")?.split(",")[0]?.trim().toLowerCase() ?? "";
  const host = (forwarded || h.get("host")?.toLowerCase() || "").trim();
  const sub = getSubdomain(host);
  const slug = resolveTenantSlug(
    sub ?? h.get("x-tenant-slug"),
    process.env.DEFAULT_TENANT_SLUG,
  );
  const res = await fetch(
    `${apiBase()}/tenants/by-slug/${encodeURIComponent(slug)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const tenant = await res.json();
  return tenant;
}

export async function requireTenant() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  return tenant;
}
