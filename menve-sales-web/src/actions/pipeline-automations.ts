"use server";

import { apiServer } from "@/lib/api-server";
import { assertCanConfigureTenant } from "@/lib/session";

/** Lista regras do funil (leitura para qualquer usuário do tenant autenticado). */
export async function fetchPipelineAutomations(pipelineId: string) {
  return apiServer<unknown>(`/pipelines/${pipelineId}/automations`);
}
import type {
  PipelineAutomationAction,
  PipelineAutomationTriggerFilter,
  PipelineAutomationTriggerType,
} from "@/lib/pipeline-automation-types";
import { revalidatePath } from "next/cache";

export async function createPipelineAutomationRule(input: {
  pipelineId: string;
  name: string;
  triggerType: PipelineAutomationTriggerType;
  /** Legado (filtro plano) ou `{ composite: { op, clauses } }`. */
  triggerFilter: PipelineAutomationTriggerFilter | null | Record<string, unknown>;
  actions: PipelineAutomationAction[];
  enabled?: boolean;
}) {
  await assertCanConfigureTenant();
  await apiServer(`/pipelines/${input.pipelineId}/automations`, {
    method: "POST",
    json: {
      name: input.name,
      triggerType: input.triggerType,
      triggerFilter: input.triggerFilter,
      actions: input.actions,
      enabled: input.enabled ?? true,
    },
  });
  revalidatePath("/pipeline");
}

export async function updatePipelineAutomationRule(input: {
  pipelineId: string;
  ruleId: string;
  name: string;
  triggerType: PipelineAutomationTriggerType;
  triggerFilter: PipelineAutomationTriggerFilter | null | Record<string, unknown>;
  actions: PipelineAutomationAction[];
}) {
  await assertCanConfigureTenant();
  await apiServer(
    `/pipelines/${input.pipelineId}/automations/${input.ruleId}`,
    {
      method: "PATCH",
      json: {
        name: input.name,
        triggerType: input.triggerType,
        triggerFilter: input.triggerFilter,
        actions: input.actions,
      },
    },
  );
  revalidatePath("/pipeline");
}

export async function deletePipelineAutomationRule(input: {
  pipelineId: string;
  ruleId: string;
}) {
  await assertCanConfigureTenant();
  await apiServer(
    `/pipelines/${input.pipelineId}/automations/${input.ruleId}`,
    { method: "DELETE" },
  );
  revalidatePath("/pipeline");
}

export async function togglePipelineAutomationRule(input: {
  pipelineId: string;
  ruleId: string;
  enabled: boolean;
}) {
  await assertCanConfigureTenant();
  await apiServer(
    `/pipelines/${input.pipelineId}/automations/${input.ruleId}`,
    {
      method: "PATCH",
      json: { enabled: input.enabled },
    },
  );
  revalidatePath("/pipeline");
}

export async function listPipelineAutomationRuns(input: {
  pipelineId: string;
  ruleId: string;
  take?: number;
}) {
  const q =
    input.take != null
      ? `?take=${encodeURIComponent(String(input.take))}`
      : "";
  return apiServer<unknown>(
    `/pipelines/${input.pipelineId}/automations/${input.ruleId}/runs${q}`,
  );
}
