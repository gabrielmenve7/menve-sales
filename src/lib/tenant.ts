import { headers } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { resolveTenantSlug } from "@/lib/tenant-edge";

export function getSubdomain(host: string): string | null {
  const hostOnly = host.split(":")[0]?.toLowerCase() ?? "";
  const parts = hostOnly.split(".");
  if (parts.length < 2) return null;
  const sub = parts[0];
  if (!sub || sub === "www") return null;
  return sub;
}

export async function getTenantFromRequest() {
  const h = await headers();
  const slug = resolveTenantSlug(
    h.get("x-tenant-slug"),
    process.env.DEFAULT_TENANT_SLUG,
  );
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  return tenant;
}

export async function requireTenant() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  return tenant;
}
