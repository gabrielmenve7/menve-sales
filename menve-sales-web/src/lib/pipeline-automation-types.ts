export type PipelineAutomationTriggerType =
  | "DEAL_CREATED"
  | "DEAL_ENTERED_STAGE"
  | "DEAL_LEFT_STAGE"
  | "DEAL_STAGE_TRANSITION"
  | "DEAL_CUSTOM_FIELD_CHANGED"
  | "DEAL_ASSIGNEE_ASSIGNED"
  | "DEAL_ASSIGNEE_REMOVED"
  | "CONTACT_TAG_ADDED"
  | "CONTACT_TAG_REMOVED"
  | "DEAL_MARKED_WON"
  | "DEAL_MARKED_LOST";

export type PipelineAutomationRunStatus = "SUCCESS" | "FAILED" | "SKIPPED";

export type PipelineAutomationAction = {
  type: "MOVE_TO_STAGE";
  stageId: string;
};

export type PipelineAutomationTriggerFilter = {
  toStageId?: string;
  fromStageId?: string;
  campaignSourceIds?: string[];
  customFieldKey?: string;
  fromCustomValue?: unknown;
  toCustomValue?: unknown;
  tagId?: string;
};

export type PipelineAutomationRuleRow = {
  id: string;
  tenantId: string;
  pipelineId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  triggerType: PipelineAutomationTriggerType;
  triggerFilter: PipelineAutomationTriggerFilter | null;
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
  DEAL_CREATED: "Lead criado",
  DEAL_ENTERED_STAGE: "Entrou na etapa",
  DEAL_LEFT_STAGE: "Saiu da etapa",
  DEAL_STAGE_TRANSITION: "Alteração de status",
  DEAL_CUSTOM_FIELD_CHANGED: "Alteração de campo personalizado",
  DEAL_ASSIGNEE_ASSIGNED: "Responsável definido",
  DEAL_ASSIGNEE_REMOVED: "Responsável removido",
  CONTACT_TAG_ADDED: "Tag adicionada ao contato",
  CONTACT_TAG_REMOVED: "Tag removida do contato",
  DEAL_MARKED_WON: "Marcada como ganha",
  DEAL_MARKED_LOST: "Marcada como perdida",
};
