"use server";

import prisma from "@/lib/prisma";
import {
  assertCanConfigureTenant,
  getActiveTenantId,
} from "@/lib/session";
import { assertPipelineInTenant } from "@/actions/pipelines";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CRM_PATHS = ["/pipeline", "/dashboard", "/analytics", "/settings"] as const;

function revalidateCrm() {
  for (const p of CRM_PATHS) {
    revalidatePath(p);
  }
}

function parseOptionalHex(v: string | undefined | null): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = v.trim();
  if (t === "") return null;
  if (!/^#[0-9A-Fa-f]{6}$/.test(t)) {
    throw new Error("Cor inválida (use #RRGGBB)");
  }
  return t;
}

async function assertStageInTenantStage(stageId: string, tenantId: string) {
  const stage = await prisma.stage.findFirst({
    where: { id: stageId, pipeline: { tenantId } },
    select: { id: true },
  });
  if (!stage) throw new Error("Etapa inválida");
}

const createSchema = z.object({
  pipelineId: z.string().min(1),
  name: z.string().min(1).max(128),
  probability: z.number().min(0).max(100).nullable().optional(),
  color: z.string().max(16).optional().nullable(),
});

export async function createStage(input: z.infer<typeof createSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const data = createSchema.parse(input);
  await assertPipelineInTenant(data.pipelineId, tenantId);
  const color = parseOptionalHex(data.color ?? undefined);

  const agg = await prisma.stage.aggregate({
    where: { pipelineId: data.pipelineId },
    _max: { sortOrder: true },
  });
  const next = (agg._max.sortOrder ?? -1) + 1;

  await prisma.stage.create({
    data: {
      pipelineId: data.pipelineId,
      name: data.name.trim(),
      sortOrder: next,
      probability: data.probability ?? null,
      ...(color !== undefined ? { color } : {}),
    },
  });
  revalidateCrm();
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128).optional(),
  probability: z.number().min(0).max(100).nullable().optional(),
  color: z.string().max(16).optional().nullable(),
});

export async function updateStage(input: z.infer<typeof updateSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const data = updateSchema.parse(input);
  await assertStageInTenantStage(data.id, tenantId);

  const color =
    data.color !== undefined ? parseOptionalHex(data.color) : undefined;

  await prisma.stage.update({
    where: { id: data.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.probability !== undefined ? { probability: data.probability } : {}),
      ...(color !== undefined ? { color } : {}),
    },
  });
  revalidateCrm();
}

export async function deleteStage(stageId: string) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  await assertStageInTenantStage(stageId, tenantId);

  const dealCount = await prisma.deal.count({ where: { stageId } });
  if (dealCount > 0) {
    throw new Error(
      "Não é possível excluir: há oportunidades nesta etapa. Mova-as no pipeline antes.",
    );
  }

  await prisma.stage.delete({ where: { id: stageId } });
  revalidateCrm();
}

const reorderSchema = z.object({
  pipelineId: z.string().min(1),
  orderedStageIds: z.array(z.string().min(1)),
});

export async function reorderStages(input: z.infer<typeof reorderSchema>) {
  await assertCanConfigureTenant();
  const tenantId = await getActiveTenantId();
  const { pipelineId, orderedStageIds } = reorderSchema.parse(input);
  await assertPipelineInTenant(pipelineId, tenantId);

  const existing = await prisma.stage.findMany({
    where: { pipelineId },
    select: { id: true },
  });
  const idSet = new Set(existing.map((s) => s.id));
  if (
    orderedStageIds.length !== existing.length ||
    orderedStageIds.some((id) => !idSet.has(id))
  ) {
    throw new Error("Ordem de etapas inválida");
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < orderedStageIds.length; i++) {
      await tx.stage.update({
        where: { id: orderedStageIds[i] },
        data: { sortOrder: 1000 + i },
      });
    }
    for (let i = 0; i < orderedStageIds.length; i++) {
      await tx.stage.update({
        where: { id: orderedStageIds[i] },
        data: { sortOrder: i },
      });
    }
  });
  revalidateCrm();
}
