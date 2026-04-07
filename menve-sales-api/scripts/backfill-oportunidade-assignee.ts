import "./load-api-env";
import { DealStatus } from "@prisma/client";
import { scriptPrisma as prisma } from "./_prisma";

/**
 * Atribui `assignedToId` em todos os deals OPEN que estão na etapa "Oportunidade"
 * (nome da stage, case-insensitive) para o usuário indicado (padrão: Gabriel Nathan).
 *
 * Uso (pasta menve-sales-api):
 *   npx tsx scripts/backfill-oportunidade-assignee.ts
 *
 * Variáveis opcionais no .env ou ambiente:
 *   BACKFILL_ASSIGNEE_NAME   — nome exato do usuário (default: Gabriel Nathan)
 *   BACKFILL_ASSIGNEE_EMAIL  — se definido, localiza por e-mail (prioridade sobre nome)
 *   BACKFILL_STAGE_NAME      — nome da etapa (default: Oportunidade)
 *   BACKFILL_TENANT_ID       — restringe ao tenant (recomendado se houver mais de um match)
 */

async function main() {
  const stageName =
    process.env.BACKFILL_STAGE_NAME?.trim() || "Oportunidade";
  const email = process.env.BACKFILL_ASSIGNEE_EMAIL?.trim();
  const nameTarget =
    process.env.BACKFILL_ASSIGNEE_NAME?.trim() || "Gabriel Nathan";
  const tenantId = process.env.BACKFILL_TENANT_ID?.trim();

  const user = await prisma.user.findFirst({
    where: {
      ...(tenantId ? { tenantId } : {}),
      ...(email
        ? { email: email.toLowerCase() }
        : {
            name: { equals: nameTarget, mode: "insensitive" },
          }),
    },
    select: { id: true, name: true, email: true, tenantId: true },
  });

  if (!user) {
    console.error(
      "Usuário não encontrado. Ajuste BACKFILL_ASSIGNEE_EMAIL / BACKFILL_ASSIGNEE_NAME ou BACKFILL_TENANT_ID.",
    );
    process.exitCode = 1;
    return;
  }

  if (!user.tenantId) {
    console.error(
      "Usuário sem tenantId (ex.: super admin). Defina BACKFILL_TENANT_ID ou use um membro do workspace.",
    );
    process.exitCode = 1;
    return;
  }

  const stages = await prisma.stage.findMany({
    where: {
      name: { equals: stageName, mode: "insensitive" },
      pipeline: { tenantId: user.tenantId },
    },
    select: { id: true, name: true, pipeline: { select: { name: true } } },
  });

  if (stages.length === 0) {
    console.error(
      `Nenhuma etapa "${stageName}" no tenant ${user.tenantId}. Verifique o nome do estágio.`,
    );
    process.exitCode = 1;
    return;
  }

  const stageIds = stages.map((s) => s.id);

  const result = await prisma.deal.updateMany({
    where: {
      tenantId: user.tenantId,
      status: DealStatus.OPEN,
      stageId: { in: stageIds },
    },
    data: { assignedToId: user.id },
  });

  console.log(
    `Responsável: ${user.name ?? user.email} (${user.id}) · tenant ${user.tenantId}`,
  );
  console.log(
    `Etapas: ${stages.map((s) => `${s.pipeline.name} / ${s.name}`).join(" · ")}`,
  );
  console.log(`Deals OPEN atualizados: ${result.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
