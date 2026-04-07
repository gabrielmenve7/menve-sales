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

/** Só na coluna Ação: unifica “definir” e “remover” responsável em uma opção. */
export type PipelineAutomationActionOnlyKind = "DEAL_ALTER_ASSIGNEES";

export type PipelineAutomationActionKindType =
  | Exclude<
      PipelineAutomationTriggerType,
      "DEAL_ASSIGNEE_ASSIGNED" | "DEAL_ASSIGNEE_REMOVED"
    >
  | PipelineAutomationActionOnlyKind;

/** Rótulos da lista de tipo de ação (diferem do gatilho onde aplicável). */
export function pipelineAutomationActionKindLabel(
  k: PipelineAutomationActionKindType,
): string {
  if (k === "DEAL_ALTER_ASSIGNEES") return "Alterar responsável";
  if (k === "DEAL_CUSTOM_FIELD_CHANGED") return "Definir campo personalizado";
  return PIPELINE_AUTOMATION_TRIGGER_LABELS[k];
}

/** Presets de valor para campo personalizado tipo data (ação). */
export type PipelineAutomationActionDatePreset =
  | "DAYS_AFTER_TRIGGER"
  | "ON_TRIGGER_DATE"
  | "ON_TRIGGER_DATETIME"
  | "TRIGGER_FIELDS"
  | "PICK_DATE"
  | "REMOVE_DATE";

export const PIPELINE_AUTOMATION_ACTION_DATE_PRESET_LABELS: Record<
  PipelineAutomationActionDatePreset,
  string
> = {
  DAYS_AFTER_TRIGGER: "Dias após data de gatilho",
  ON_TRIGGER_DATE: "Na data de gatilho",
  ON_TRIGGER_DATETIME: "Na data e hora do gatilho",
  TRIGGER_FIELDS: "Campos do disparador",
  PICK_DATE: "Escolha uma data",
  REMOVE_DATE: "Remover data",
};
