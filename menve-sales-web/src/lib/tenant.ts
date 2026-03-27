import { headers } from "next/headers";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getSubdomain, resolveTenantSlug } from "@/lib/tenant-edge";

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
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  return tenant;
}

export async function requireTenant() {
  const tenant = await getTenantFromRequest();
  if (!tenant) redirect("/setup");
  return tenant;
}
