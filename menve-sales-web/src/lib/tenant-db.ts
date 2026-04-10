import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  __menveTenantPrisma?: PrismaClient;
};

function getPrisma(): PrismaClient {
  if (globalForPrisma.__menveTenantPrisma) {
    return globalForPrisma.__menveTenantPrisma;
  }
  const client = new PrismaClient();
  globalForPrisma.__menveTenantPrisma = client;
  return client;
}

/** Formato alinhado a `GET /tenants/by-slug/:slug` na API. */
export type TenantDto = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  image: string | null;
  researchEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Resolve tenant pelo slug no mesmo Postgres do `prisma migrate deploy` na Vercel.
 * Evita depender de INTERNAL_API_URL só para esta leitura pública.
 */
export async function getTenantBySlugFromDb(
  slug: string,
): Promise<TenantDto | null> {
  const prisma = getPrisma();
  const t = await prisma.tenant.findUnique({
    where: { slug },
  });
  if (!t) return null;
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: t.plan,
    image: t.image ?? null,
    researchEnabled: t.researchEnabled,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
