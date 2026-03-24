import { headers } from "next/headers";
import prisma from "@/lib/prisma";

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
  const slug =
    h.get("x-tenant-slug") ??
    process.env.DEFAULT_TENANT_SLUG ??
    "demo";
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  return tenant;
}

export async function requireTenant() {
  const tenant = await getTenantFromRequest();
  if (!tenant) throw new Error("Tenant não encontrado");
  return tenant;
}
