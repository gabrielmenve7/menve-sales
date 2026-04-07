export type PipelineAutomationTriggerType =
  | "DEAL_CREATED"
  | "DEAL_ENTERED_STAGE"
  | "DEAL_LEFT_STAGE"
  | "DEAL_MARKED_WON"
  | "DEAL_MARKED_LOST";

export type PipelineAutomationRunStatus = "SUCCESS" | "FAILED" | "SKIPPED";

export type PipelineAutomationAction = {
  type: "MOVE_TO_STAGE";
  stageId: string;
};

export type PipelineAutomationRuleRow = {
  id: string;
  tenantId: string;
  pipelineId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  triggerType: PipelineAutomationTriggerType;
  triggerFilter: { toStageId?: string; fromStageId?: string } | null;
  actions: PipelineAutomationAction[];
  createdAt: string;
  updatedAt: string;
};

export type PipelineAutomationRunRow = {
  id: string;
  dealId: string;
  triggerType: PipelineAutomationTriggerType;
  status: PipelineAutomationRunStatus;
  errorMessage: string | null;
  createdAt: string;
};

export const PIPELINE_AUTOMATION_TRIGGER_LABELS: Record<
  PipelineAutomationTriggerType,
  string
> = {
  DEAL_CREATED: "Oportunidade criada",
  DEAL_ENTERED_STAGE: "Entrou na etapa",
  DEAL_LEFT_STAGE: "Saiu da etapa",
  DEAL_MARKED_WON: "Marcada como ganha",
  DEAL_MARKED_LOST: "Marcada como perdida",
};
