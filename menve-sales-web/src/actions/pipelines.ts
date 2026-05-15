"use server";

import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const CRM_PATHS = [
  "/pipeline",
  "/pipeline/configure",
  "/dashboard",
  "/settings",
] as const;

function revalidateCrm() {
  for (const p of CRM_PATHS) {
    revalidatePath(p);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(128),
  color: z.string().max(16).optional().nullable(),
});

export async function createPipeline(input: z.infer<typeof createSchema>) {
  await assertCanConfigureTenant();
  const data = createSchema.parse(input);
  await apiServer("/pipelines", {
    method: "POST",
    json: { name: data.name.trim(), color: data.color },
  });
  revalidateCrm();
}

const updatePipelineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(128).optional(),
  color: z.string().max(16).optional().nullable(),
  wonStageId: z.string().min(1).nullable().optional(),
  lostStageId: z.string().min(1).nullable().optional(),
});

export async function updatePipeline(input: z.infer<typeof updatePipelineSchema>) {
  await assertCanConfigureTenant();
  const data = updatePipelineSchema.parse(input);
  await apiServer(`/pipelines/${data.id}`, {
    method: "PUT",
    json: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.color !== undefined ? { color: data.color } : {}),
      ...(data.wonStageId !== undefined
        ? { wonStageId: data.wonStageId }
        : {}),
      ...(data.lostStageId !== undefined
        ? { lostStageId: data.lostStageId }
        : {}),
    },
  });
  revalidateCrm();
}

export async function deletePipeline(pipelineId: string) {
  await assertCanConfigureTenant();
  await apiServer(`/pipelines/${pipelineId}`, { method: "DELETE" });
  revalidateCrm();
}

export async function setDefaultPipeline(pipelineId: string) {
  await assertCanConfigureTenant();
  await apiServer(`/pipelines/${pipelineId}/default`, { method: "PATCH" });
  revalidateCrm();
}

const reorderPipelinesSchema = z.object({
  orderedPipelineIds: z.array(z.string().min(1)),
});

export async function reorderPipelines(
  input: z.infer<typeof reorderPipelinesSchema>,
) {
  await assertCanConfigureTenant();
  const { orderedPipelineIds } = reorderPipelinesSchema.parse(input);
  await apiServer("/pipelines/reorder", {
    method: "PATCH",
    json: { orderedPipelineIds },
  });
  revalidateCrm();
}
