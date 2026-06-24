import "./load-api-env";
import { scriptPrisma as prisma } from "./_prisma";

const PRIMARY_LIST_CODE = "primary";
const PRIMARY_LIST_NAME = "Lista principal";

/**
 * Cria a lista principal por tenant (se não existir) e adiciona todos os
 * ProspectResult que ainda não estão nela.
 *
 * Uso (na pasta menve-sales-api):
 *   npx tsx scripts/backfill-primary-prospect-list.ts
 */

async function ensurePrimaryList(
  tenantId: string,
  createdById: string,
): Promise<string> {
  const existing = await prisma.prospectList.findFirst({
    where: { tenantId, code: PRIMARY_LIST_CODE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const owner = await prisma.user.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const userId = owner?.id ?? createdById;

  const created = await prisma.prospectList.create({
    data: {
      tenantId,
      name: PRIMARY_LIST_NAME,
      code: PRIMARY_LIST_CODE,
      description:
        "Empresas capturadas no Google Maps — alimentada automaticamente a cada captura.",
      createdById: userId,
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { researchEnabled: true },
    select: { id: true, name: true },
  });

  let totalAdded = 0;

  for (const tenant of tenants) {
    const results = await prisma.prospectResult.findMany({
      where: { tenantId: tenant.id },
      select: {
        id: true,
        contactId: true,
        search: { select: { userId: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    if (results.length === 0) {
      console.log(`[${tenant.name}] sem resultados de prospecção — ignorado`);
      continue;
    }

    const fallbackUserId =
      results.find((r) => r.search?.userId)?.search?.userId ??
      (
        await prisma.user.findFirst({
          where: { tenantId: tenant.id },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id;

    if (!fallbackUserId) {
      console.warn(`[${tenant.name}] sem usuário — ignorado`);
      continue;
    }

    const listId = await ensurePrimaryList(tenant.id, fallbackUserId);

    const existingItems = await prisma.prospectListItem.findMany({
      where: { listId },
      select: { prospectResultId: true },
    });
    const inList = new Set(
      existingItems
        .map((i) => i.prospectResultId)
        .filter((id): id is string => !!id),
    );

    const toAdd = results.filter((r) => !inList.has(r.id));
    if (toAdd.length === 0) {
      console.log(
        `[${tenant.name}] lista principal ok (${results.length} já na lista)`,
      );
      continue;
    }

    const batch = await prisma.prospectListItem.createMany({
      data: toAdd.map((r) => ({
        listId,
        prospectResultId: r.id,
        contactId: r.contactId,
      })),
      skipDuplicates: true,
    });

    totalAdded += batch.count;
    console.log(
      `[${tenant.name}] +${batch.count} itens (total capturas: ${results.length})`,
    );
  }

  console.log(`\nBackfill concluído. ${totalAdded} item(ns) adicionado(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
