"use server";

import prisma from "@/lib/prisma";
import {
  assertCanConfigureTenant,
  getActiveTenantId,
} from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CRM_PATHS = ["/pipeline", "/dashboard", "/analytics", "/settings"] as const;

function revalidateCrm() {
  for (const p of CRM_PATHS) {
    revalidatePath(p);
  }
}

export async function assertPipelineInTenant(
  pipelineId: string,
  tenantId: string,
) {
  const p = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId },
    select: { id: true },
  });
  if (!p) throw new Error("Funil inválido");
}

function parseOptionalHex(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  if (t === "") return null;
  if (!/^#[0-9A-Fa-f]{6}$/.test(t)) {
    throw new Error("Cor inválida (use #RRGGBB)");
  }
  return t;
}

const createSchema = z.object({
  name: z.string().min(1).max(128),
  color: z.string().max(16).optional().nullable(),
});

export async function createPipeline(input: z.infer<typeof createSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const data = createSchema.parse(input);
  const color = parseOptionalHex(data.color ?? undefined);

  const existingCount = await prisma.pipeline.count({ where: { tenantId } });
  const agg = await prisma.pipeline.aggregate({
    where: { tenantId },
    _max: { sortOrder: true },
  });
  const nextSort = (agg._max.sortOrder ?? -1) + 1;
  const isFirst = existingCount === 0;

  const p = await prisma.pipeline.create({
    data: {
      tenantId,
      name: data.name.trim(),
      sortOrder: nextSort,
      isDefault: isFirst,
      color,
    },
  });

  await prisma.stage.create({
    data: {
      pipelineId: p.id,
      name: "Qualificação",
      sortOrder: 0,
    },
  });
  revalidateCrm();
}

const updatePipelineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128).optional(),
  color: z.string().max(16).optional().nullable(),
});

export async function updatePipeline(input: z.infer<typeof updatePipelineSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const data = updatePipelineSchema.parse(input);
  await assertPipelineInTenant(data.id, tenantId);

  const color =
    data.color !== undefined ? parseOptionalHex(data.color) : undefined;

  await prisma.pipeline.update({
    where: { id: data.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(color !== undefined ? { color } : {}),
    },
  });
  revalidateCrm();
}

export async function deletePipeline(pipelineId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  await assertPipelineInTenant(pipelineId, tenantId);

  const dealCount = await prisma.deal.count({ where: { pipelineId } });
  if (dealCount > 0) {
    throw new Error(
      "Não é possível excluir: há oportunidades neste funil. Transfira ou exclua antes.",
    );
  }

  const wasDefault = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId },
    select: { isDefault: true },
  });

  await prisma.pipeline.delete({ where: { id: pipelineId } });

  if (wasDefault?.isDefault) {
    const next = await prisma.pipeline.findFirst({
      where: { tenantId },
      orderBy: { sortOrder: "asc" },
    });
    if (next) {
      await prisma.pipeline.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }
  revalidateCrm();
}

export async function setDefaultPipeline(pipelineId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  await assertPipelineInTenant(pipelineId, tenantId);

  await prisma.$transaction([
    prisma.pipeline.updateMany({
      where: { tenantId },
      data: { isDefault: false },
    }),
    prisma.pipeline.update({
      where: { id: pipelineId },
      data: { isDefault: true },
    }),
  ]);
  revalidateCrm();
}

const reorderPipelinesSchema = z.object({
  orderedPipelineIds: z.array(z.string().min(1)),
});

export async function reorderPipelines(
  input: z.infer<typeof reorderPipelinesSchema>,
) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const { orderedPipelineIds } = reorderPipelinesSchema.parse(input);

  const existing = await prisma.pipeline.findMany({
    where: { tenantId },
    select: { id: true },
  });
  const idSet = new Set(existing.map((e) => e.id));
  if (
    orderedPipelineIds.length !== existing.length ||
    orderedPipelineIds.some((id) => !idSet.has(id))
  ) {
    throw new Error("Ordem de funis inválida");
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedPipelineIds.length; i++) {
      await tx.pipeline.update({
        where: { id: orderedPipelineIds[i] },
        data: { sortOrder: 1000 + i },
      });
    }
    for (let i = 0; i < orderedPipelineIds.length; i++) {
      await tx.pipeline.update({
        where: { id: orderedPipelineIds[i] },
        data: { sortOrder: i },
      });
    }
  });
  revalidateCrm();
}
