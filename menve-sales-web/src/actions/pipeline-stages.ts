"use server";

import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CRM_PATHS = ["/pipeline", "/dashboard", "/settings"] as const;

function revalidateCrm() {
  for (const p of CRM_PATHS) {
    revalidatePath(p);
  }
}

const createSchema = z.object({
  pipelineId: z.string().min(1),
  name: z.string().min(1).max(128),
  probability: z.number().min(0).max(100).nullable().optional(),
  color: z.string().max(16).optional().nullable(),
});

export async function createStage(input: z.infer<typeof createSchema>) {
  await assertCanConfigureTenant();
  const data = createSchema.parse(input);
  await apiServer(`/pipelines/${data.pipelineId}/stages`, {
    method: "POST",
    json: {
      name: data.name.trim(),
      probability: data.probability ?? null,
      color: data.color,
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
  const data = updateSchema.parse(input);
  await apiServer(`/stages/${data.id}`, {
    method: "PUT",
    json: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.probability !== undefined ? { probability: data.probability } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
    },
  });
  revalidateCrm();
}

export async function deleteStage(stageId: string) {
  await assertCanConfigureTenant();
  await apiServer(`/stages/${stageId}`, { method: "DELETE" });
  revalidateCrm();
}

const reorderSchema = z.object({
  pipelineId: z.string().min(1),
  orderedStageIds: z.array(z.string().min(1)),
});

export async function reorderStages(input: z.infer<typeof reorderSchema>) {
  await assertCanConfigureTenant();
  const { pipelineId, orderedStageIds } = reorderSchema.parse(input);
  await apiServer("/stages/reorder", {
    method: "PATCH",
    json: { pipelineId, orderedStageIds },
  });
  revalidateCrm();
}
