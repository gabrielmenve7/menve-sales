"use client";

import type { CustomField } from "@prisma/client";
import type { Pipeline, Stage } from "@prisma/client";
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  ListTree,
  PencilLine,
  Search,
  Tag,
  Target,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useState, useTransition } from "react";
import {
  createPipelineAutomationRule,
  deletePipelineAutomationRule,
  listPipelineAutomationRuns,
  togglePipelineAutomationRule,
} from "@/actions/pipeline-automations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TenantMemberOption } from "@/lib/custom-field-types";
import type {
  PipelineAutomationAction,
  PipelineAutomationActionDatePreset,
  PipelineAutomationActionKindType,
  PipelineAutomationRunRow,
  PipelineAutomationRuleRow,
  PipelineAutomationTriggerFilter,
  PipelineAutomationTriggerType,
} from "@/lib/pipeline-automation-types";
import {
  PIPELINE_AUTOMATION_ACTION_DATE_PRESET_LABELS,
  PIPELINE_AUTOMATION_TRIGGER_LABELS,
  pipelineAutomationActionKindLabel,
} from "@/lib/pipeline-automation-types";
import { pipelineSelectClass } from "@/lib/pipeline-ui-tokens";
import { cn } from "@/lib/utils";

/** Página / embed: cabeçalho dos blocos Acionar / Ação. */
const groupHeaderClass =
  "flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 shadow-sm dark:bg-muted/10";
const fieldLabelClass = "text-[11px] font-medium text-muted-foreground";
const selectFullWidth = cn(pipelineSelectClass, "w-full min-w-0");
const triggerTypeButtonClass = cn(
  pipelineSelectClass,
  "flex h-10 w-full min-w-0 cursor-pointer items-center justify-between gap-2 text-left font-normal",
);
const dashedV = "border-l border-dashed border-border/50";

/** Modal: campos direto no fundo charcoal, sem cartões. */
const dialogSelectFull = cn(
  "w-full min-w-0 rounded-lg border border-zinc-700/90 bg-zinc-900/45 px-3 py-2 text-sm text-zinc-100 shadow-none",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/35",
);
const dialogTriggerBtn = cn(
  dialogSelectFull,
  "flex h-10 cursor-pointer items-center justify-between gap-2 text-left font-normal",
);
const dialogDashedV = "border-l border-dashed border-zinc-700/50";

const TRIGGER_GROUPS: { heading: string; types: PipelineAutomationTriggerType[] }[] =
  [
    {
      heading: "Gatilhos",
      types: [
        "DEAL_STAGE_TRANSITION",
        "DEAL_CREATED",
        "DEAL_CUSTOM_FIELD_CHANGED",
        "DEAL_ASSIGNEE_ASSIGNED",
        "DEAL_ASSIGNEE_REMOVED",
        "DEAL_ENTERED_STAGE",
        "DEAL_LEFT_STAGE",
        "DEAL_MARKED_WON",
        "DEAL_MARKED_LOST",
        "CONTACT_TAG_ADDED",
        "CONTACT_TAG_REMOVED",
      ],
    },
  ];

/** Lista do popover “Tipo de ação”: um item só para responsáveis. */
const ACTION_KIND_GROUPS: {
  heading: string;
  types: PipelineAutomationActionKindType[];
}[] = [
  {
    heading: "Ações",
    types: [
      "DEAL_STAGE_TRANSITION",
      "DEAL_CREATED",
      "DEAL_CUSTOM_FIELD_CHANGED",
      "DEAL_ALTER_ASSIGNEES",
      "DEAL_ENTERED_STAGE",
      "DEAL_LEFT_STAGE",
      "DEAL_MARKED_WON",
      "DEAL_MARKED_LOST",
      "CONTACT_TAG_ADDED",
      "CONTACT_TAG_REMOVED",
    ],
  },
];

const ACTION_DATE_PRESET_ORDER: PipelineAutomationActionDatePreset[] = [
  "DAYS_AFTER_TRIGGER",
  "ON_TRIGGER_DATE",
  "ON_TRIGGER_DATETIME",
  "TRIGGER_FIELDS",
  "PICK_DATE",
  "REMOVE_DATE",
];

const MAX_GROUPED_TRIGGERS = 8;
const MAX_GROUPED_ACTIONS = 5;

type AutomationTriggerStepRow = {
  id: string;
  triggerType: PipelineAutomationTriggerType;
  stageFromId: string;
  stageToId: string;
  legacyStageFilterId: string;
  selectedCampaignIds: string[];
  customFieldKey: string;
  fromCustomStr: string;
  toCustomStr: string;
  tagFilterId: string;
};

type AutomationActionStepRow = {
  id: string;
  actionKindType: PipelineAutomationActionKindType;
  actionStageFromId: string;
  actionStageToId: string;
  actionLegacyStageFilterId: string;
  actionSelectedCampaignIds: string[];
  actionCustomFieldKey: string;
  actionFromCustomStr: string;
  actionToCustomStr: string;
  actionTagFilterId: string;
  actionAddAssigneeUserId: string;
  actionRemoveAssigneeUserId: string;
  actionDatePreset: PipelineAutomationActionDatePreset | "";
  actionDateDaysAfter: string;
  actionDatePick: string;
};

function newAutomationRowId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
}

function createTriggerStepRow(): AutomationTriggerStepRow {
  return {
    id: newAutomationRowId(),
    triggerType: "DEAL_STAGE_TRANSITION",
    stageFromId: "",
    stageToId: "",
    legacyStageFilterId: "",
    selectedCampaignIds: [],
    customFieldKey: "",
    fromCustomStr: "",
    toCustomStr: "",
    tagFilterId: "",
  };
}

function createActionStepRow(): AutomationActionStepRow {
  return {
    id: newAutomationRowId(),
    actionKindType: "DEAL_STAGE_TRANSITION",
    actionStageFromId: "",
    actionStageToId: "",
    actionLegacyStageFilterId: "",
    actionSelectedCampaignIds: [],
    actionCustomFieldKey: "",
    actionFromCustomStr: "",
    actionToCustomStr: "",
    actionTagFilterId: "",
    actionAddAssigneeUserId: "",
    actionRemoveAssigneeUserId: "",
    actionDatePreset: "",
    actionDateDaysAfter: "",
    actionDatePick: "",
  };
}

function clearedFieldsForTriggerType(
  t: PipelineAutomationTriggerType,
): Partial<AutomationTriggerStepRow> {
  return {
    triggerType: t,
    stageFromId: "",
    stageToId: "",
    legacyStageFilterId: "",
    selectedCampaignIds: [],
    customFieldKey: "",
    fromCustomStr: "",
    toCustomStr: "",
    tagFilterId: "",
  };
}

function clearedFieldsForActionKind(
  k: PipelineAutomationActionKindType,
): Partial<AutomationActionStepRow> {
  return {
    actionKindType: k,
    actionStageFromId: "",
    actionStageToId: "",
    actionLegacyStageFilterId: "",
    actionSelectedCampaignIds: [],
    actionCustomFieldKey: "",
    actionFromCustomStr: "",
    actionToCustomStr: "",
    actionTagFilterId: "",
    actionAddAssigneeUserId: "",
    actionRemoveAssigneeUserId: "",
    actionDatePreset: "",
    actionDateDaysAfter: "",
    actionDatePick: "",
  };
}

function buildTriggerFilterFromStep(
  step: AutomationTriggerStepRow,
): PipelineAutomationTriggerFilter | null {
  const out: PipelineAutomationTriggerFilter = {};
  switch (step.triggerType) {
    case "DEAL_STAGE_TRANSITION":
      if (step.stageFromId.trim()) out.fromStageId = step.stageFromId.trim();
      if (step.stageToId.trim()) out.toStageId = step.stageToId.trim();
      break;
    case "DEAL_ENTERED_STAGE":
      if (step.legacyStageFilterId.trim())
        out.toStageId = step.legacyStageFilterId.trim();
      break;
    case "DEAL_LEFT_STAGE":
      if (step.legacyStageFilterId.trim())
        out.fromStageId = step.legacyStageFilterId.trim();
      break;
    case "DEAL_CREATED":
      if (step.selectedCampaignIds.length)
        out.campaignSourceIds = [...step.selectedCampaignIds];
      break;
    case "DEAL_CUSTOM_FIELD_CHANGED":
      out.customFieldKey = step.customFieldKey.trim();
      {
        const fv = parseOptionalAutomationValue(step.fromCustomStr);
        if (fv !== undefined) out.fromCustomValue = fv;
        const tv = parseOptionalAutomationValue(step.toCustomStr);
        if (tv !== undefined) out.toCustomValue = tv;
      }
      break;
    case "CONTACT_TAG_ADDED":
    case "CONTACT_TAG_REMOVED":
      if (step.tagFilterId.trim()) out.tagId = step.tagFilterId.trim();
      break;
    default:
      break;
  }
  return Object.keys(out).length ? out : null;
}

function buildMoveActionsFromSteps(
  steps: AutomationActionStepRow[],
): PipelineAutomationAction[] {
  const out: PipelineAutomationAction[] = [];
  for (const s of steps) {
    if (s.actionKindType !== "DEAL_STAGE_TRANSITION") continue;
    const sid = s.actionStageToId.trim();
    if (sid) out.push({ type: "MOVE_TO_STAGE", stageId: sid });
  }
  return out;
}

function validateTriggerStep(
  step: AutomationTriggerStepRow,
  index: number,
): string | null {
  const n = index + 1;
  if (
    step.triggerType === "DEAL_CUSTOM_FIELD_CHANGED" &&
    !step.customFieldKey.trim()
  ) {
    return `Gatilho ${n}: selecione o campo personalizado.`;
  }
  return null;
}

function validateActionStep(
  step: AutomationActionStepRow,
  dealCustomFieldDefs: CustomField[],
  index: number,
): string | null {
  const n = index + 1;
  if (step.actionKindType === "DEAL_CUSTOM_FIELD_CHANGED") {
    if (!step.actionCustomFieldKey.trim()) {
      return `Ação ${n}: selecione o campo personalizado.`;
    }
    const af = dealCustomFieldDefs.find(
      (d) => d.key === step.actionCustomFieldKey.trim(),
    );
    if (af?.fieldType === "DATE") {
      if (!step.actionDatePreset) {
        return `Ação ${n}: selecione um valor para a data.`;
      }
      if (step.actionDatePreset === "DAYS_AFTER_TRIGGER") {
        const x = parseInt(step.actionDateDaysAfter.trim(), 10);
        if (!Number.isFinite(x) || x < 0) {
          return `Ação ${n}: informe quantos dias após o gatilho.`;
        }
      }
      if (step.actionDatePreset === "PICK_DATE" && !step.actionDatePick.trim()) {
        return `Ação ${n}: escolha uma data.`;
      }
    }
  }
  return null;
}

function triggerIcon(t: PipelineAutomationTriggerType) {
  switch (t) {
    case "DEAL_STAGE_TRANSITION":
    case "DEAL_ENTERED_STAGE":
    case "DEAL_LEFT_STAGE":
      return Target;
    case "DEAL_CREATED":
      return CircleDot;
    case "DEAL_CUSTOM_FIELD_CHANGED":
      return ListTree;
    case "DEAL_ASSIGNEE_ASSIGNED":
      return UserPlus;
    case "DEAL_ASSIGNEE_REMOVED":
      return UserMinus;
    case "CONTACT_TAG_ADDED":
    case "CONTACT_TAG_REMOVED":
      return Tag;
    default:
      return Target;
  }
}

function actionKindIcon(k: PipelineAutomationActionKindType) {
  if (k === "DEAL_ALTER_ASSIGNEES") return Users;
  if (k === "DEAL_CUSTOM_FIELD_CHANGED") return PencilLine;
  return triggerIcon(k);
}

function stageName(stages: Stage[], id: string) {
  return stages.find((s) => s.id === id)?.name ?? id.slice(0, 8);
}

function previewTriggerLabel(steps: AutomationTriggerStepRow[]): string {
  if (steps.length === 1) {
    return PIPELINE_AUTOMATION_TRIGGER_LABELS[steps[0].triggerType];
  }
  if (steps.length > 1) {
    return `${steps.length} gatilhos · uma regra para cada`;
  }
  return "…";
}

function previewActionLabel(steps: AutomationActionStepRow[]): string {
  if (steps.length === 1) {
    return pipelineAutomationActionKindLabel(steps[0].actionKindType);
  }
  if (steps.length > 1) {
    return steps
      .map((s) => pipelineAutomationActionKindLabel(s.actionKindType))
      .join(" · ");
  }
  return "…";
}

function previewMoveStageChain(
  actionSteps: AutomationActionStepRow[],
  stages: Stage[],
): string | null {
  const names = actionSteps
    .filter(
      (s) =>
        s.actionKindType === "DEAL_STAGE_TRANSITION" &&
        s.actionStageToId.trim(),
    )
    .map((s) => stageName(stages, s.actionStageToId.trim()));
  if (names.length === 0) return null;
  return names.join(" → ");
}

function parseOptionalAutomationValue(raw: string): unknown | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return s;
  }
}

function parseAutomationTriggerFilter(
  tf: unknown,
): PipelineAutomationRuleRow["triggerFilter"] {
  if (!tf || typeof tf !== "object") return null;
  const t = tf as Record<string, unknown>;
  const out: PipelineAutomationTriggerFilter = {};
  if (typeof t.toStageId === "string" && t.toStageId)
    out.toStageId = t.toStageId;
  if (typeof t.fromStageId === "string" && t.fromStageId)
    out.fromStageId = t.fromStageId;
  if (Array.isArray(t.campaignSourceIds)) {
    const ids = t.campaignSourceIds.filter((x) => typeof x === "string");
    if (ids.length) out.campaignSourceIds = ids;
  }
  if (typeof t.customFieldKey === "string" && t.customFieldKey)
    out.customFieldKey = t.customFieldKey;
  if ("fromCustomValue" in t) out.fromCustomValue = t.fromCustomValue;
  if ("toCustomValue" in t) out.toCustomValue = t.toCustomValue;
  if (typeof t.tagId === "string" && t.tagId) out.tagId = t.tagId;
  return Object.keys(out).length ? out : null;
}

function describeTriggerFilter(
  r: PipelineAutomationRuleRow,
  stages: Stage[],
  campaignSources: { id: string; name: string }[],
  dealFields: CustomField[],
  tags: { id: string; name: string }[],
): string {
  const f = r.triggerFilter;
  if (!f) return "";
  const parts: string[] = [];
  if (f.fromStageId)
    parts.push(`de “${stageName(stages, f.fromStageId)}”`);
  if (f.toStageId) parts.push(`para “${stageName(stages, f.toStageId)}”`);
  if (f.campaignSourceIds?.length) {
    const names = f.campaignSourceIds.map(
      (id) => campaignSources.find((c) => c.id === id)?.name ?? id.slice(0, 6),
    );
    parts.push(`origens: ${names.join(", ")}`);
  }
  if (f.customFieldKey) {
    const fn =
      dealFields.find((d) => d.key === f.customFieldKey)?.name ??
      f.customFieldKey;
    parts.push(`campo “${fn}”`);
  }
  if (f.tagId) {
    const tn = tags.find((x) => x.id === f.tagId)?.name ?? f.tagId.slice(0, 6);
    parts.push(`tag “${tn}”`);
  }
  return parts.length ? ` · ${parts.join(" · ")}` : "";
}

function summarizeRule(r: PipelineAutomationRuleRow, stages: Stage[]) {
  const acts = r.actions;
  if (acts.length === 0) {
    return "Sem mover etapa";
  }
  const first = acts[0];
  if (first?.type === "MOVE_TO_STAGE") {
    return `Mover para “${stageName(stages, first.stageId)}”`;
  }
  return JSON.stringify(acts);
}

function parseRulesFromApi(raw: unknown): PipelineAutomationRuleRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PipelineAutomationRuleRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const actionsRaw = o.actions;
    if (!Array.isArray(actionsRaw)) continue;
    const actions: PipelineAutomationAction[] = [];
    for (const a of actionsRaw) {
      if (!a || typeof a !== "object") continue;
      const ao = a as Record<string, unknown>;
      if (ao.type === "MOVE_TO_STAGE" && typeof ao.stageId === "string") {
        actions.push({ type: "MOVE_TO_STAGE", stageId: ao.stageId });
      }
    }
    const triggerFilter = parseAutomationTriggerFilter(o.triggerFilter);
    const tt = o.triggerType;
    if (typeof tt !== "string") continue;
    if (!(tt in PIPELINE_AUTOMATION_TRIGGER_LABELS)) continue;
    out.push({
      id: String(o.id),
      tenantId: String(o.tenantId),
      pipelineId: String(o.pipelineId),
      name: String(o.name ?? ""),
      enabled: Boolean(o.enabled),
      sortOrder: Number(o.sortOrder ?? 0),
      triggerType: tt as PipelineAutomationTriggerType,
      triggerFilter,
      actions,
      createdAt: String(o.createdAt ?? ""),
      updatedAt: String(o.updatedAt ?? ""),
    });
  }
  return out;
}

function parseRuns(raw: unknown): PipelineAutomationRunRow[] {
  if (!Array.isArray(raw)) return [];
  const out: PipelineAutomationRunRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const st = o.status;
    if (st !== "SUCCESS" && st !== "FAILED" && st !== "SKIPPED") continue;
    const tt = o.triggerType;
    if (typeof tt !== "string" || !(tt in PIPELINE_AUTOMATION_TRIGGER_LABELS))
      continue;
    out.push({
      id: String(o.id),
      dealId: String(o.dealId ?? ""),
      triggerType: tt as PipelineAutomationTriggerType,
      status: st,
      errorMessage:
        o.errorMessage == null ? null : String(o.errorMessage),
      createdAt: String(o.createdAt ?? ""),
    });
  }
  return out;
}

function selectOptionsFromCustomField(field: CustomField | undefined) {
  if (!field?.options || !Array.isArray(field.options)) return [];
  return field.options.map((opt) => {
    if (opt && typeof opt === "object" && "value" in opt) {
      const v = (opt as { value?: string; label?: string }).value;
      const l = (opt as { label?: string }).label;
      return { value: String(v ?? ""), label: String(l ?? v ?? "") };
    }
    return { value: String(opt), label: String(opt) };
  });
}

export type AutomationKindFieldBundle = {
  stageFromId: string;
  setStageFromId: (v: string) => void;
  stageToId: string;
  setStageToId: (v: string) => void;
  legacyStageFilterId: string;
  setLegacyStageFilterId: (v: string) => void;
  selectedCampaignIds: string[];
  setSelectedCampaignIds: Dispatch<SetStateAction<string[]>>;
  customFieldKey: string;
  setCustomFieldKey: (v: string) => void;
  fromCustomStr: string;
  setFromCustomStr: (v: string) => void;
  toCustomStr: string;
  setToCustomStr: (v: string) => void;
  tagFilterId: string;
  setTagFilterId: (v: string) => void;
};

/** Campos condicionais iguais para gatilho ou ação (mesmos tipos que o acionamento). */
function AutomationKindConfigFields({
  kind,
  bundle,
  isDialog,
  lbl,
  sel,
  stages,
  campaignSources,
  dealCustomFieldDefs,
  sortedTags,
}: {
  kind: PipelineAutomationTriggerType;
  bundle: AutomationKindFieldBundle;
  isDialog: boolean;
  lbl: string;
  sel: string;
  stages: Stage[];
  campaignSources: { id: string; name: string }[];
  dealCustomFieldDefs: CustomField[];
  sortedTags: { id: string; name: string }[];
}) {
  const {
    stageFromId,
    setStageFromId,
    stageToId,
    setStageToId,
    legacyStageFilterId,
    setLegacyStageFilterId,
    selectedCampaignIds,
    setSelectedCampaignIds,
    customFieldKey,
    setCustomFieldKey,
    fromCustomStr,
    setFromCustomStr,
    toCustomStr,
    setToCustomStr,
    tagFilterId,
    setTagFilterId,
  } = bundle;

  const selectedField = useMemo(
    () => dealCustomFieldDefs.find((d) => d.key === customFieldKey),
    [dealCustomFieldDefs, customFieldKey],
  );
  const fieldSelectOptions = useMemo(
    () => selectOptionsFromCustomField(selectedField),
    [selectedField],
  );

  return (
    <div className="mt-4 space-y-3">
      {kind === "DEAL_STAGE_TRANSITION" ? (
        <>
          <div className="space-y-1">
            <p className={lbl}>De</p>
            <select
              className={sel}
              value={stageFromId}
              onChange={(e) => setStageFromId(e.target.value)}
              aria-label="Etapa de origem"
            >
              <option value="">Qualquer status</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className={lbl}>Para</p>
            <select
              className={sel}
              value={stageToId}
              onChange={(e) => setStageToId(e.target.value)}
              aria-label="Etapa de destino"
            >
              <option value="">Qualquer status</option>
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}

      {kind === "DEAL_ENTERED_STAGE" || kind === "DEAL_LEFT_STAGE" ? (
        <div className="space-y-1">
          <p className={lbl}>
            {kind === "DEAL_ENTERED_STAGE"
              ? "Etapa de destino (opcional)"
              : "Etapa de origem (opcional)"}
          </p>
          <select
            className={sel}
            value={legacyStageFilterId}
            onChange={(e) => setLegacyStageFilterId(e.target.value)}
            aria-label="Filtro de etapa"
          >
            <option value="">Qualquer etapa</option>
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {kind === "DEAL_CREATED" ? (
        <div className="space-y-2">
          <p className={lbl}>Origens de criação (vazio = todas)</p>
          <div
            className={cn(
              "max-h-36 space-y-1.5 overflow-y-auto rounded-md p-2",
              isDialog
                ? "border border-zinc-800/80 bg-zinc-950/30"
                : "border border-border/60 bg-background shadow-sm",
            )}
          >
            {campaignSources.length === 0 ? (
              <p
                className={cn(
                  "text-[12px]",
                  isDialog ? "text-zinc-500" : "text-muted-foreground",
                )}
              >
                Nenhuma origem cadastrada.
              </p>
            ) : (
              campaignSources.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className={cn(
                      "rounded",
                      isDialog
                        ? "border-zinc-600 bg-zinc-900"
                        : "border-input",
                    )}
                    checked={selectedCampaignIds.includes(c.id)}
                    onChange={(e) => {
                      setSelectedCampaignIds((prev) =>
                        e.target.checked
                          ? [...prev, c.id]
                          : prev.filter((x) => x !== c.id),
                      );
                    }}
                  />
                  <span className="truncate">{c.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}

      {kind === "DEAL_CUSTOM_FIELD_CHANGED" ? (
        <>
          <div className="space-y-1">
            <p className={lbl}>Campo</p>
            <select
              className={sel}
              value={customFieldKey}
              onChange={(e) => {
                setCustomFieldKey(e.target.value);
                setFromCustomStr("");
                setToCustomStr("");
              }}
              aria-label="Campo personalizado"
            >
              <option value="">Selecionar…</option>
              {dealCustomFieldDefs.map((d) => (
                <option key={d.id} value={d.key}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          {selectedField?.fieldType === "SELECT" &&
          fieldSelectOptions.length > 0 ? (
            <>
              <div className="space-y-1">
                <p className={lbl}>De (opcional)</p>
                <select
                  className={sel}
                  value={fromCustomStr}
                  onChange={(e) => setFromCustomStr(e.target.value)}
                  aria-label="Valor anterior"
                >
                  <option value="">Qualquer</option>
                  {fieldSelectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <p className={lbl}>Para (opcional)</p>
                <select
                  className={sel}
                  value={toCustomStr}
                  onChange={(e) => setToCustomStr(e.target.value)}
                  aria-label="Novo valor"
                >
                  <option value="">Qualquer</option>
                  {fieldSelectOptions.map((o) => (
                    <option key={`t-${o.value}`} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1">
                <p className={lbl}>
                  Valor anterior (opcional, JSON ou texto)
                </p>
                <Input
                  value={fromCustomStr}
                  onChange={(e) => setFromCustomStr(e.target.value)}
                  placeholder="Vazio = qualquer"
                  className={cn(
                    "h-10 text-sm shadow-none",
                    isDialog
                      ? "border-zinc-700/90 bg-zinc-900/45 text-zinc-100 placeholder:text-zinc-600"
                      : "border-border/50 bg-background shadow-sm",
                  )}
                />
              </div>
              <div className="space-y-1">
                <p className={lbl}>Novo valor (opcional)</p>
                <Input
                  value={toCustomStr}
                  onChange={(e) => setToCustomStr(e.target.value)}
                  placeholder="Vazio = qualquer"
                  className={cn(
                    "h-10 text-sm shadow-none",
                    isDialog
                      ? "border-zinc-700/90 bg-zinc-900/45 text-zinc-100 placeholder:text-zinc-600"
                      : "border-border/50 bg-background shadow-sm",
                  )}
                />
              </div>
            </>
          )}
        </>
      ) : null}

      {(kind === "CONTACT_TAG_ADDED" || kind === "CONTACT_TAG_REMOVED") && (
        <div className="space-y-1">
          <p className={lbl}>Tag (opcional)</p>
          <select
            className={sel}
            value={tagFilterId}
            onChange={(e) => setTagFilterId(e.target.value)}
            aria-label="Filtrar por tag"
          >
            <option value="">Qualquer tag</option>
            {sortedTags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <p
            className={cn(
              "text-[11px] leading-snug",
              isDialog ? "text-zinc-500" : "text-muted-foreground",
            )}
          >
            {kind === "CONTACT_TAG_ADDED"
              ? "Para oportunidades abertas deste funil quando a tag é aplicada no contato vinculado."
              : "Para oportunidades abertas deste funil quando a tag é removida do contato vinculado."}
          </p>
        </div>
      )}

      {(kind === "DEAL_ASSIGNEE_ASSIGNED" ||
        kind === "DEAL_ASSIGNEE_REMOVED" ||
        kind === "DEAL_MARKED_WON" ||
        kind === "DEAL_MARKED_LOST") && (
        <p
          className={cn(
            "text-[12px]",
            isDialog ? "text-zinc-500" : "text-muted-foreground",
          )}
        >
          Sem filtros adicionais.
        </p>
      )}
    </div>
  );
}

function ActionAlterAssigneeBlock({
  members,
  addUserId,
  setAddUserId,
  removeUserId,
  setRemoveUserId,
  lbl,
  sel,
  isDialog,
}: {
  members: TenantMemberOption[];
  addUserId: string;
  setAddUserId: (v: string) => void;
  removeUserId: string;
  setRemoveUserId: (v: string) => void;
  lbl: string;
  sel: string;
  isDialog: boolean;
}) {
  const display = (m: TenantMemberOption) =>
    (m.name?.trim() ? m.name : m.email) ?? m.email;

  return (
    <div className="relative mt-4 space-y-3 pb-8">
      <div className="space-y-1">
        <p className={lbl}>Adicionar responsáveis</p>
        <select
          className={sel}
          value={addUserId}
          onChange={(e) => setAddUserId(e.target.value)}
          aria-label="Adicionar responsável"
        >
          <option value="">Selecione um usuário</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {display(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <p className={lbl}>Remover responsáveis</p>
        <select
          className={sel}
          value={removeUserId}
          onChange={(e) => setRemoveUserId(e.target.value)}
          aria-label="Remover responsável"
        >
          <option value="">Selecione um usuário</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {display(m)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        className={cn(
          "absolute bottom-0 right-0 text-[11px] underline-offset-2 hover:underline",
          isDialog ? "text-zinc-500 hover:text-zinc-400" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Avançado
      </button>
    </div>
  );
}

function ActionDateCustomFieldBlock({
  dealCustomFieldDefs,
  customFieldKey,
  setCustomFieldKey,
  preset,
  setPreset,
  daysAfter,
  setDaysAfter,
  pick,
  setPick,
  lbl,
  sel,
  isDialog,
  valueTrigBtn,
}: {
  dealCustomFieldDefs: CustomField[];
  customFieldKey: string;
  setCustomFieldKey: (v: string) => void;
  preset: PipelineAutomationActionDatePreset | "";
  setPreset: (v: PipelineAutomationActionDatePreset | "") => void;
  daysAfter: string;
  setDaysAfter: (v: string) => void;
  pick: string;
  setPick: (v: string) => void;
  lbl: string;
  sel: string;
  isDialog: boolean;
  valueTrigBtn: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filteredPresets = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = [...ACTION_DATE_PRESET_ORDER];
    if (q) {
      list = list.filter((p) =>
        PIPELINE_AUTOMATION_ACTION_DATE_PRESET_LABELS[p]
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [search]);

  const triggerLabel = preset
    ? PIPELINE_AUTOMATION_ACTION_DATE_PRESET_LABELS[preset]
    : "Selecione uma data";

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-1">
        <p className={lbl}>Campo personalizado</p>
        <select
          className={sel}
          value={customFieldKey}
          onChange={(e) => setCustomFieldKey(e.target.value)}
          aria-label="Campo personalizado"
        >
          <option value="">Selecionar…</option>
          {dealCustomFieldDefs.map((d) => (
            <option key={d.id} value={d.key}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <p className={lbl}>Valor</p>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={valueTrigBtn}
              aria-expanded={open}
              aria-label="Valor da data"
            >
              <span className="min-w-0 flex-1 truncate text-left">
                {triggerLabel}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0",
                  isDialog ? "text-zinc-500" : "text-muted-foreground",
                )}
                aria-hidden
              />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className={cn(
              "p-0 shadow-lg",
              isDialog
                ? "w-[min(100vw-2rem,25rem)] border-zinc-700 bg-zinc-900 text-zinc-100"
                : "w-[min(100vw-2rem,20rem)] border-border/60",
            )}
          >
            <div
              className={cn(
                "border-b p-2",
                isDialog ? "border-zinc-800" : "border-border/40",
              )}
            >
              <div className="relative">
                <Search
                  className={cn(
                    "absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2",
                    isDialog ? "text-zinc-500" : "text-muted-foreground",
                  )}
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar…"
                  className={cn(
                    "h-9 pl-8 text-sm shadow-none",
                    isDialog
                      ? "border-zinc-700 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600"
                      : "border-border/50 bg-background placeholder:text-muted-foreground/70",
                  )}
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filteredPresets.map((p) => {
                const selected = p === preset;
                return (
                  <button
                    key={p}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                      isDialog
                        ? cn(
                            "hover:bg-zinc-800/80",
                            selected && "bg-zinc-800",
                          )
                        : cn(
                            "hover:bg-muted/50",
                            selected && "bg-muted/40",
                          ),
                    )}
                    onClick={() => {
                      setPreset(p);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <span className="flex-1 truncate">
                      {PIPELINE_AUTOMATION_ACTION_DATE_PRESET_LABELS[p]}
                    </span>
                    {selected ? (
                      <span
                        className={
                          isDialog ? "text-zinc-200" : "text-foreground"
                        }
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {preset === "DAYS_AFTER_TRIGGER" ? (
        <div className="space-y-1">
          <p className={lbl}>Dias após o gatilho</p>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={daysAfter}
            onChange={(e) => setDaysAfter(e.target.value)}
            placeholder="0"
            className={cn(
              "h-10 text-sm shadow-none",
              isDialog
                ? "border-zinc-700/90 bg-zinc-900/45 text-zinc-100 placeholder:text-zinc-600"
                : "border-border/50 bg-background shadow-sm",
            )}
          />
        </div>
      ) : null}
      {preset === "PICK_DATE" ? (
        <div className="space-y-1">
          <p className={lbl}>Data</p>
          <Input
            type="date"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className={cn(
              "h-10 text-sm shadow-none",
              isDialog
                ? "border-zinc-700/90 bg-zinc-900/45 text-zinc-100 [color-scheme:dark]"
                : "border-border/50 bg-background shadow-sm",
            )}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PipelineAutomationsPanel({
  pipeline,
  rulesRaw,
  canConfigure,
  variant = "page",
  onRulesChanged,
  onCancel,
  dealCustomFieldDefs = [],
  campaignSources = [],
  tenantTags = [],
  tenantMembers = [],
  dialogAppearance,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  rulesRaw: unknown;
  canConfigure: boolean;
  variant?: "page" | "dialog";
  /** Modal: aparência do cromado (claro = tema do app). */
  dialogAppearance?: "light" | "dark";
  onRulesChanged?: () => void;
  /** Modal: fecha sem salvar (botão Cancelar). */
  onCancel?: () => void;
  dealCustomFieldDefs?: CustomField[];
  campaignSources?: { id: string; name: string }[];
  tenantTags?: { id: string; name: string }[];
  tenantMembers?: TenantMemberOption[];
}) {
  const stages = useMemo(
    () => [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [pipeline.stages],
  );
  const rules = useMemo(() => parseRulesFromApi(rulesRaw), [rulesRaw]);
  const sortedTags = useMemo(
    () => [...tenantTags].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [tenantTags],
  );
  const sortedTenantMembers = useMemo(
    () =>
      [...tenantMembers].sort((a, b) => {
        const an = (a.name ?? a.email).toLowerCase();
        const bn = (b.name ?? b.email).toLowerCase();
        return an.localeCompare(bn, "pt-BR");
      }),
    [tenantMembers],
  );

  const [name, setName] = useState("");
  const [triggerSteps, setTriggerSteps] = useState<AutomationTriggerStepRow[]>(
    () => [createTriggerStepRow()],
  );
  const [actionSteps, setActionSteps] = useState<AutomationActionStepRow[]>(
    () => [createActionStepRow()],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openTriggerMenuId, setOpenTriggerMenuId] = useState<string | null>(
    null,
  );
  const [triggerSearch, setTriggerSearch] = useState("");
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [actionSearch, setActionSearch] = useState("");

  const [openRunsId, setOpenRunsId] = useState<string | null>(null);
  const [runsByRule, setRunsByRule] = useState<
    Record<string, PipelineAutomationRunRow[]>
  >({});
  const [runsLoading, setRunsLoading] = useState<string | null>(null);

  const filteredTriggerGroups = useMemo(() => {
    const q = triggerSearch.trim().toLowerCase();
    if (!q) return TRIGGER_GROUPS;
    return TRIGGER_GROUPS.map((g) => ({
      ...g,
      types: g.types.filter((t) =>
        PIPELINE_AUTOMATION_TRIGGER_LABELS[t].toLowerCase().includes(q),
      ),
    })).filter((g) => g.types.length > 0);
  }, [triggerSearch]);

  const filteredActionGroups = useMemo(() => {
    const q = actionSearch.trim().toLowerCase();
    if (!q) return ACTION_KIND_GROUPS;
    return ACTION_KIND_GROUPS.map((g) => ({
      ...g,
      types: g.types.filter((t) =>
        pipelineAutomationActionKindLabel(t).toLowerCase().includes(q),
      ),
    })).filter((g) => g.types.length > 0);
  }, [actionSearch]);

  function patchTriggerStep(
    id: string,
    partial: Partial<AutomationTriggerStepRow>,
  ) {
    setTriggerSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...partial } : s)),
    );
  }

  function patchActionStep(
    id: string,
    partial: Partial<AutomationActionStepRow>,
  ) {
    setActionSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...partial } : s)),
    );
  }

  function triggerBundleFor(
    step: AutomationTriggerStepRow,
  ): AutomationKindFieldBundle {
    const id = step.id;
    return {
      stageFromId: step.stageFromId,
      setStageFromId: (v) => patchTriggerStep(id, { stageFromId: v }),
      stageToId: step.stageToId,
      setStageToId: (v) => patchTriggerStep(id, { stageToId: v }),
      legacyStageFilterId: step.legacyStageFilterId,
      setLegacyStageFilterId: (v) =>
        patchTriggerStep(id, { legacyStageFilterId: v }),
      selectedCampaignIds: step.selectedCampaignIds,
      setSelectedCampaignIds: (fn) => {
        setTriggerSteps((prev) =>
          prev.map((s) => {
            if (s.id !== id) return s;
            const next =
              typeof fn === "function" ? fn(s.selectedCampaignIds) : fn;
            return { ...s, selectedCampaignIds: next };
          }),
        );
      },
      customFieldKey: step.customFieldKey,
      setCustomFieldKey: (v) => patchTriggerStep(id, { customFieldKey: v }),
      fromCustomStr: step.fromCustomStr,
      setFromCustomStr: (v) => patchTriggerStep(id, { fromCustomStr: v }),
      toCustomStr: step.toCustomStr,
      setToCustomStr: (v) => patchTriggerStep(id, { toCustomStr: v }),
      tagFilterId: step.tagFilterId,
      setTagFilterId: (v) => patchTriggerStep(id, { tagFilterId: v }),
    };
  }

  function actionBundleFor(
    step: AutomationActionStepRow,
  ): AutomationKindFieldBundle {
    const id = step.id;
    return {
      stageFromId: step.actionStageFromId,
      setStageFromId: (v) => patchActionStep(id, { actionStageFromId: v }),
      stageToId: step.actionStageToId,
      setStageToId: (v) => patchActionStep(id, { actionStageToId: v }),
      legacyStageFilterId: step.actionLegacyStageFilterId,
      setLegacyStageFilterId: (v) =>
        patchActionStep(id, { actionLegacyStageFilterId: v }),
      selectedCampaignIds: step.actionSelectedCampaignIds,
      setSelectedCampaignIds: (fn) => {
        setActionSteps((prev) =>
          prev.map((s) => {
            if (s.id !== id) return s;
            const next =
              typeof fn === "function"
                ? fn(s.actionSelectedCampaignIds)
                : fn;
            return { ...s, actionSelectedCampaignIds: next };
          }),
        );
      },
      customFieldKey: step.actionCustomFieldKey,
      setCustomFieldKey: (v) =>
        patchActionStep(id, { actionCustomFieldKey: v }),
      fromCustomStr: step.actionFromCustomStr,
      setFromCustomStr: (v) =>
        patchActionStep(id, { actionFromCustomStr: v }),
      toCustomStr: step.actionToCustomStr,
      setToCustomStr: (v) => patchActionStep(id, { actionToCustomStr: v }),
      tagFilterId: step.actionTagFilterId,
      setTagFilterId: (v) => patchActionStep(id, { actionTagFilterId: v }),
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Informe um nome para a automação.");
      return;
    }
    for (let i = 0; i < triggerSteps.length; i++) {
      const err = validateTriggerStep(triggerSteps[i], i);
      if (err) {
        setFormError(err);
        return;
      }
    }
    for (let i = 0; i < actionSteps.length; i++) {
      const err = validateActionStep(actionSteps[i], dealCustomFieldDefs, i);
      if (err) {
        setFormError(err);
        return;
      }
    }
    const actions = buildMoveActionsFromSteps(actionSteps);
    if (actions.length > MAX_GROUPED_ACTIONS) {
      setFormError(
        `No máximo ${MAX_GROUPED_ACTIONS} movimentações de etapa por automação.`,
      );
      return;
    }
    const baseName = name.trim();
    startTransition(async () => {
      try {
        for (let i = 0; i < triggerSteps.length; i++) {
          const step = triggerSteps[i];
          const ruleName =
            triggerSteps.length > 1
              ? `${baseName} · gatilho ${i + 1}`
              : baseName;
          await createPipelineAutomationRule({
            pipelineId: pipeline.id,
            name: ruleName,
            triggerType: step.triggerType,
            triggerFilter: buildTriggerFilterFromStep(step),
            actions,
          });
        }
        onRulesChanged?.();
        setName("");
        setTriggerSteps([createTriggerStepRow()]);
        setActionSteps([createActionStepRow()]);
        setOpenTriggerMenuId(null);
        setOpenActionMenuId(null);
        setTriggerSearch("");
        setActionSearch("");
      } catch (err) {
        setFormError(
          err instanceof Error ? err.message : "Não foi possível salvar.",
        );
      }
    });
  }

  async function loadRuns(ruleId: string) {
    if (openRunsId === ruleId) {
      setOpenRunsId(null);
      return;
    }
    setOpenRunsId(ruleId);
    if (runsByRule[ruleId]?.length) return;
    setRunsLoading(ruleId);
    try {
      const raw = await listPipelineAutomationRuns({
        pipelineId: pipeline.id,
        ruleId,
        take: 20,
      });
      setRunsByRule((prev) => ({
        ...prev,
        [ruleId]: parseRuns(raw),
      }));
    } finally {
      setRunsLoading(null);
    }
  }

  const formShell =
    "rounded-lg border border-border/60 bg-muted/20 p-4 shadow-sm dark:bg-muted/10";
  const isDialogLayout = variant === "dialog";
  const dialogChromeDark =
    isDialogLayout && (dialogAppearance ?? "dark") === "dark";
  const sel = dialogChromeDark ? dialogSelectFull : selectFullWidth;
  const trigBtn = dialogChromeDark ? dialogTriggerBtn : triggerTypeButtonClass;
  const dashV = dialogChromeDark ? dialogDashedV : dashedV;
  const lbl = dialogChromeDark
    ? "text-[11px] font-medium text-zinc-500"
    : fieldLabelClass;

  const previewTriggerText = useMemo(
    () => previewTriggerLabel(triggerSteps),
    [triggerSteps],
  );
  const previewActionText = useMemo(
    () => previewActionLabel(actionSteps),
    [actionSteps],
  );
  const previewMoveChain = useMemo(
    () => previewMoveStageChain(actionSteps, stages),
    [actionSteps, stages],
  );

  const previewPillClass = dialogChromeDark
    ? "max-w-full truncate rounded-md border border-zinc-600/90 bg-zinc-950/55 px-2.5 py-1 text-left text-xs font-medium text-zinc-100"
    : "max-w-full truncate rounded-md border border-border/80 bg-background px-2.5 py-1 text-left text-xs font-medium text-foreground shadow-sm";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col space-y-6",
        dialogChromeDark && "text-zinc-100",
      )}
    >
      {variant === "dialog" ? (
        <p
          className={cn(
            "text-[12px]",
            dialogChromeDark ? "text-zinc-500" : "text-muted-foreground",
          )}
        >
          As regras são avaliadas na ordem abaixo quando o evento ocorre.
        </p>
      ) : (
        <p className="text-[12px] text-muted-foreground">
          Funil:{" "}
          <span className="font-medium text-foreground">{pipeline.name}</span>
          . As regras são avaliadas na ordem abaixo quando o evento ocorre.
        </p>
      )}

      {canConfigure ? (
        <form
          id={isDialogLayout ? "pipeline-automation-form" : undefined}
          onSubmit={onSubmit}
          className={cn(
            "shrink-0 space-y-5",
            isDialogLayout && "scroll-mt-4",
            (!isDialogLayout || !dialogChromeDark) && formShell,
          )}
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-name"
              className={cn(
                "text-[11px] font-medium",
                dialogChromeDark ? "text-zinc-500" : "text-muted-foreground",
              )}
            >
              Nome da automação
            </Label>
            <Input
              id="auto-name"
              placeholder="Dê um nome a esta automação…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(
                "h-11 text-[14px]",
                dialogChromeDark
                  ? "rounded-lg border-zinc-700/90 bg-zinc-900/45 text-zinc-100 shadow-none placeholder:text-zinc-600 focus-visible:ring-zinc-500/35"
                  : "rounded-xl border-border/50 bg-background shadow-sm placeholder:text-muted-foreground/70",
              )}
            />
          </div>

          <div
            className={cn(
              "grid gap-6 lg:items-start",
              isDialogLayout
                ? "lg:grid-cols-[minmax(0,1.25fr)_auto_minmax(0,1.25fr)]"
                : "lg:grid-cols-[1fr_auto_1fr]",
              dialogChromeDark ? "text-zinc-100" : "text-foreground",
            )}
          >
            {/* Acionar */}
            <div className="relative min-w-0 space-y-0">
              <div className="flex justify-center">
                <div className={cn("h-4 w-px", dashV)} />
              </div>
              <div
                className={cn(
                  dialogChromeDark
                    ? "flex items-center justify-between gap-3 py-0.5"
                    : groupHeaderClass,
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md",
                      dialogChromeDark
                        ? "bg-violet-500/20 text-violet-300"
                        : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
                    )}
                  >
                    <Zap className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-semibold",
                      dialogChromeDark ? "text-zinc-50" : "text-foreground",
                    )}
                  >
                    Acionar
                  </span>
                </div>
                <span
                  className={cn(
                    "hidden shrink-0 rounded-md border px-2 py-1 text-[11px] sm:inline",
                    dialogChromeDark
                      ? "border-zinc-700 bg-zinc-900/50 text-zinc-400"
                      : "border-border/60 bg-background text-muted-foreground shadow-sm",
                  )}
                >
                  Oportunidades neste funil
                </span>
              </div>
              <div className="flex justify-center py-1">
                <div className={cn("min-h-[12px] w-px flex-1", dashV)} />
              </div>

              <div
                className={cn(
                  "space-y-4",
                  (!isDialogLayout || !dialogChromeDark) && "rounded-lg border border-border/60 bg-muted/20 p-3 shadow-sm dark:bg-muted/10",
                )}
              >
                {triggerSteps.map((step, stepIndex) => {
                  const StepTriggerIcon = triggerIcon(step.triggerType);
                  return (
                    <div key={step.id} className="space-y-3">
                      {stepIndex > 0 ? (
                        <p
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide",
                            lbl,
                          )}
                        >
                          Gatilho {stepIndex + 1}
                        </p>
                      ) : null}
                      <div
                        className={cn(
                          "relative space-y-3",
                          dialogChromeDark ? "" : "rounded-md border border-border/50 bg-background/40 p-3",
                        )}
                      >
                        {triggerSteps.length > 1 ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className={cn(
                                "rounded-md p-1.5",
                                dialogChromeDark
                                  ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                              aria-label="Remover gatilho"
                              onClick={() =>
                                setTriggerSteps((prev) =>
                                  prev.filter((s) => s.id !== step.id),
                                )
                              }
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </div>
                        ) : null}
                        <p className={cn("uppercase tracking-wide", lbl)}>
                          Tipo de gatilho
                        </p>
                        <Popover
                          open={openTriggerMenuId === step.id}
                          onOpenChange={(o) => {
                            setOpenTriggerMenuId(o ? step.id : null);
                            if (!o) setTriggerSearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={trigBtn}
                              aria-expanded={openTriggerMenuId === step.id}
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <StepTriggerIcon
                                  className={cn(
                                    "size-4 shrink-0",
                                    dialogChromeDark
                                      ? "text-zinc-400"
                                      : "text-muted-foreground",
                                  )}
                                  strokeWidth={2}
                                  aria-hidden
                                />
                                <span className="truncate">
                                  {
                                    PIPELINE_AUTOMATION_TRIGGER_LABELS[
                                      step.triggerType
                                    ]
                                  }
                                </span>
                              </span>
                              <ChevronDown
                                className={cn(
                                  "size-4 shrink-0",
                                  dialogChromeDark
                                    ? "text-zinc-500"
                                    : "text-muted-foreground",
                                )}
                                aria-hidden
                              />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className={cn(
                              "p-0 shadow-lg",
                              dialogChromeDark
                                ? "w-[min(100vw-2rem,25rem)] border-zinc-700 bg-zinc-900 text-zinc-100"
                                : "w-[min(100vw-2rem,20rem)] border-border/60",
                            )}
                          >
                            <div
                              className={cn(
                                "border-b p-2",
                                dialogChromeDark
                                  ? "border-zinc-800"
                                  : "border-border/40",
                              )}
                            >
                              <div className="relative">
                                <Search
                                  className={cn(
                                    "absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2",
                                    dialogChromeDark
                                      ? "text-zinc-500"
                                      : "text-muted-foreground",
                                  )}
                                />
                                <Input
                                  value={triggerSearch}
                                  onChange={(e) =>
                                    setTriggerSearch(e.target.value)
                                  }
                                  placeholder="Pesquisar…"
                                  className={cn(
                                    "h-9 pl-8 text-sm shadow-none",
                                    dialogChromeDark
                                      ? "border-zinc-700 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600"
                                      : "border-border/50 bg-background placeholder:text-muted-foreground/70",
                                  )}
                                />
                              </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto py-1">
                              {filteredTriggerGroups.map((group) => (
                                <div key={group.heading}>
                                  <p
                                    className={cn(
                                      "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide",
                                      dialogChromeDark
                                        ? "text-zinc-500"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {group.heading}
                                  </p>
                                  {group.types.map((t) => {
                                    const Icon = triggerIcon(t);
                                    const selected = t === step.triggerType;
                                    return (
                                      <button
                                        key={t}
                                        type="button"
                                        className={cn(
                                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                          dialogChromeDark
                                            ? cn(
                                                "hover:bg-zinc-800/80",
                                                selected && "bg-zinc-800",
                                              )
                                            : cn(
                                                "hover:bg-muted/50",
                                                selected && "bg-muted/40",
                                              ),
                                        )}
                                        onClick={() => {
                                          patchTriggerStep(
                                            step.id,
                                            clearedFieldsForTriggerType(t),
                                          );
                                          setOpenTriggerMenuId(null);
                                          setTriggerSearch("");
                                        }}
                                      >
                                        <Icon
                                          className={cn(
                                            "size-4 shrink-0",
                                            dialogChromeDark
                                              ? "text-zinc-400"
                                              : "text-muted-foreground",
                                          )}
                                          strokeWidth={2}
                                          aria-hidden
                                        />
                                        <span className="flex-1 truncate">
                                          {PIPELINE_AUTOMATION_TRIGGER_LABELS[t]}
                                        </span>
                                        {selected ? (
                                          <span
                                            className={
                                              dialogChromeDark
                                                ? "text-zinc-200"
                                                : "text-foreground"
                                            }
                                          >
                                            ✓
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        <AutomationKindConfigFields
                          kind={step.triggerType}
                          bundle={triggerBundleFor(step)}
                          isDialog={dialogChromeDark}
                          lbl={lbl}
                          sel={sel}
                          stages={stages}
                          campaignSources={campaignSources}
                          dealCustomFieldDefs={dealCustomFieldDefs}
                          sortedTags={sortedTags}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-center pt-2">
                <div className={cn("h-6 w-px", dashV)} />
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={triggerSteps.length >= MAX_GROUPED_TRIGGERS}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border border-dashed transition-colors",
                    dialogChromeDark
                      ? "border-zinc-600 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-40"
                      : "border-border/60 bg-muted/30 text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                  aria-label="Adicionar outro gatilho (cria uma regra por gatilho com as mesmas ações)"
                  title="Cada gatilho adicional gera uma regra separada com as mesmas ações."
                  onClick={() =>
                    setTriggerSteps((prev) => {
                      if (prev.length >= MAX_GROUPED_TRIGGERS) return prev;
                      return [...prev, createTriggerStepRow()];
                    })
                  }
                >
                  +
                </button>
              </div>
            </div>

            {/* Seta central */}
            <div className="flex flex-col items-center justify-center gap-2 lg:pt-16">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-lg border text-lg",
                  dialogChromeDark
                    ? "border-zinc-700 bg-zinc-900/50 text-zinc-400"
                    : "border-border/60 bg-muted/20 text-muted-foreground shadow-sm dark:bg-muted/10",
                )}
              >
                →
              </div>
            </div>

            {/* Ação — mesma hierarquia visual do bloco Acionar */}
            <div className="relative min-w-0 space-y-0">
              <div className="flex justify-center">
                <div className={cn("h-4 w-px", dashV)} />
              </div>
              <div
                className={cn(
                  dialogChromeDark
                    ? "flex items-center justify-between gap-3 py-0.5"
                    : groupHeaderClass,
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md",
                      dialogChromeDark
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    <CircleDot className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-semibold",
                      dialogChromeDark ? "text-zinc-50" : "text-foreground",
                    )}
                  >
                    Ação
                  </span>
                </div>
                <span
                  className={cn(
                    "hidden shrink-0 rounded-md border px-2 py-1 text-[11px] sm:inline",
                    dialogChromeDark
                      ? "border-zinc-700 bg-zinc-900/50 text-zinc-400"
                      : "border-border/60 bg-background text-muted-foreground shadow-sm",
                  )}
                >
                  Neste funil
                </span>
              </div>
              <div className="flex justify-center py-1">
                <div className={cn("min-h-[12px] w-px flex-1", dashV)} />
              </div>

              <div
                className={cn(
                  "space-y-4",
                  !dialogChromeDark && "rounded-lg border border-border/60 bg-muted/20 p-3 shadow-sm dark:bg-muted/10",
                )}
              >
                {actionSteps.map((step, stepIndex) => {
                  const StepActionIcon = actionKindIcon(step.actionKindType);
                  const stepDateField = dealCustomFieldDefs.find(
                    (d) => d.key === step.actionCustomFieldKey,
                  );
                  return (
                    <div key={step.id} className="space-y-3">
                      {stepIndex > 0 ? (
                        <p
                          className={cn(
                            "text-[10px] font-semibold uppercase tracking-wide",
                            lbl,
                          )}
                        >
                          Ação {stepIndex + 1}
                        </p>
                      ) : null}
                      <div
                        className={cn(
                          "relative space-y-3",
                          dialogChromeDark ? "" : "rounded-md border border-border/50 bg-background/40 p-3",
                        )}
                      >
                        {actionSteps.length > 1 ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className={cn(
                                "rounded-md p-1.5",
                                dialogChromeDark
                                  ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
                              )}
                              aria-label="Remover ação"
                              onClick={() =>
                                setActionSteps((prev) =>
                                  prev.filter((s) => s.id !== step.id),
                                )
                              }
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          </div>
                        ) : null}
                        <p className={cn("uppercase tracking-wide", lbl)}>
                          Tipo de ação
                        </p>
                        <Popover
                          open={openActionMenuId === step.id}
                          onOpenChange={(o) => {
                            setOpenActionMenuId(o ? step.id : null);
                            if (!o) setActionSearch("");
                          }}
                        >
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className={trigBtn}
                              aria-expanded={openActionMenuId === step.id}
                              aria-label="Tipo de ação"
                            >
                              <span className="flex min-w-0 items-center gap-2">
                                <StepActionIcon
                                  className={cn(
                                    "size-4 shrink-0",
                                    dialogChromeDark
                                      ? "text-zinc-400"
                                      : "text-muted-foreground",
                                  )}
                                  strokeWidth={2}
                                  aria-hidden
                                />
                                <span className="truncate">
                                  {pipelineAutomationActionKindLabel(
                                    step.actionKindType,
                                  )}
                                </span>
                              </span>
                              <ChevronDown
                                className={cn(
                                  "size-4 shrink-0",
                                  dialogChromeDark
                                    ? "text-zinc-500"
                                    : "text-muted-foreground",
                                )}
                                aria-hidden
                              />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className={cn(
                              "p-0 shadow-lg",
                              dialogChromeDark
                                ? "w-[min(100vw-2rem,25rem)] border-zinc-700 bg-zinc-900 text-zinc-100"
                                : "w-[min(100vw-2rem,20rem)] border-border/60",
                            )}
                          >
                            <div
                              className={cn(
                                "border-b p-2",
                                dialogChromeDark
                                  ? "border-zinc-800"
                                  : "border-border/40",
                              )}
                            >
                              <div className="relative">
                                <Search
                                  className={cn(
                                    "absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2",
                                    dialogChromeDark
                                      ? "text-zinc-500"
                                      : "text-muted-foreground",
                                  )}
                                />
                                <Input
                                  value={actionSearch}
                                  onChange={(e) =>
                                    setActionSearch(e.target.value)
                                  }
                                  placeholder="Pesquisar…"
                                  className={cn(
                                    "h-9 pl-8 text-sm shadow-none",
                                    dialogChromeDark
                                      ? "border-zinc-700 bg-zinc-950/80 text-zinc-100 placeholder:text-zinc-600"
                                      : "border-border/50 bg-background placeholder:text-muted-foreground/70",
                                  )}
                                />
                              </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto py-1">
                              {filteredActionGroups.map((group) => (
                                <div key={group.heading}>
                                  <p
                                    className={cn(
                                      "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide",
                                      dialogChromeDark
                                        ? "text-zinc-500"
                                        : "text-muted-foreground",
                                    )}
                                  >
                                    {group.heading}
                                  </p>
                                  {group.types.map((t) => {
                                    const Icon = actionKindIcon(t);
                                    const selected = t === step.actionKindType;
                                    return (
                                      <button
                                        key={t}
                                        type="button"
                                        className={cn(
                                          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                                          dialogChromeDark
                                            ? cn(
                                                "hover:bg-zinc-800/80",
                                                selected && "bg-zinc-800",
                                              )
                                            : cn(
                                                "hover:bg-muted/50",
                                                selected && "bg-muted/40",
                                              ),
                                        )}
                                        onClick={() => {
                                          patchActionStep(
                                            step.id,
                                            clearedFieldsForActionKind(t),
                                          );
                                          setOpenActionMenuId(null);
                                          setActionSearch("");
                                        }}
                                      >
                                        <Icon
                                          className={cn(
                                            "size-4 shrink-0",
                                            dialogChromeDark
                                              ? "text-zinc-400"
                                              : "text-muted-foreground",
                                          )}
                                          strokeWidth={2}
                                          aria-hidden
                                        />
                                        <span className="flex-1 truncate">
                                          {pipelineAutomationActionKindLabel(t)}
                                        </span>
                                        {selected ? (
                                          <span
                                            className={
                                              dialogChromeDark
                                                ? "text-zinc-200"
                                                : "text-foreground"
                                            }
                                          >
                                            ✓
                                          </span>
                                        ) : null}
                                      </button>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {step.actionKindType === "DEAL_ALTER_ASSIGNEES" ? (
                          <ActionAlterAssigneeBlock
                            members={sortedTenantMembers}
                            addUserId={step.actionAddAssigneeUserId}
                            setAddUserId={(v) =>
                              patchActionStep(step.id, {
                                actionAddAssigneeUserId: v,
                              })
                            }
                            removeUserId={step.actionRemoveAssigneeUserId}
                            setRemoveUserId={(v) =>
                              patchActionStep(step.id, {
                                actionRemoveAssigneeUserId: v,
                              })
                            }
                            lbl={lbl}
                            sel={sel}
                            isDialog={dialogChromeDark}
                          />
                        ) : step.actionKindType ===
                            "DEAL_CUSTOM_FIELD_CHANGED" &&
                          stepDateField?.fieldType === "DATE" ? (
                          <ActionDateCustomFieldBlock
                            dealCustomFieldDefs={dealCustomFieldDefs}
                            customFieldKey={step.actionCustomFieldKey}
                            setCustomFieldKey={(v) =>
                              patchActionStep(step.id, {
                                actionCustomFieldKey: v,
                              })
                            }
                            preset={step.actionDatePreset}
                            setPreset={(v) =>
                              patchActionStep(step.id, { actionDatePreset: v })
                            }
                            daysAfter={step.actionDateDaysAfter}
                            setDaysAfter={(v) =>
                              patchActionStep(step.id, {
                                actionDateDaysAfter: v,
                              })
                            }
                            pick={step.actionDatePick}
                            setPick={(v) =>
                              patchActionStep(step.id, { actionDatePick: v })
                            }
                            lbl={lbl}
                            sel={sel}
                            isDialog={dialogChromeDark}
                            valueTrigBtn={trigBtn}
                          />
                        ) : (
                          <AutomationKindConfigFields
                            kind={
                              step.actionKindType as PipelineAutomationTriggerType
                            }
                            bundle={actionBundleFor(step)}
                            isDialog={dialogChromeDark}
                            lbl={lbl}
                            sel={sel}
                            stages={stages}
                            campaignSources={campaignSources}
                            dealCustomFieldDefs={dealCustomFieldDefs}
                            sortedTags={sortedTags}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-center pt-2">
                <div className={cn("h-6 w-px", dashV)} />
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={actionSteps.length >= MAX_GROUPED_ACTIONS}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border border-dashed transition-colors",
                    dialogChromeDark
                      ? "border-zinc-600 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-800/80 disabled:cursor-not-allowed disabled:opacity-40"
                      : "border-border/60 bg-muted/30 text-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                  aria-label="Adicionar outra ação (até 5 movimentações de etapa em sequência)"
                  title="Cada bloco extra pode definir mais uma movimentação (tipo Alteração de status com Para)."
                  onClick={() =>
                    setActionSteps((prev) => {
                      if (prev.length >= MAX_GROUPED_ACTIONS) return prev;
                      return [...prev, createActionStepRow()];
                    })
                  }
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div
            aria-live="polite"
            className={cn(
              "mt-6 rounded-lg border px-4 py-3",
              dialogChromeDark
                ? "border-zinc-700/80 bg-zinc-950/40"
                : "border-border/60 bg-muted/15",
            )}
          >
            <p
              className={cn(
                "flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[13px] leading-snug",
                dialogChromeDark ? "text-zinc-300" : "text-foreground",
              )}
            >
              <span
                className={dialogChromeDark ? "text-zinc-500" : "text-muted-foreground"}
              >
                Quando
              </span>
              <span className={previewPillClass} title={previewTriggerText}>
                {previewTriggerText}
              </span>
              <span
                className={dialogChromeDark ? "text-zinc-500" : "text-muted-foreground"}
              >
                então
              </span>
              <span className={previewPillClass} title={previewActionText}>
                {previewActionText}
              </span>
            </p>
            {previewMoveChain ? (
              <p
                className={cn(
                  "mt-2 text-[11px] leading-snug",
                  dialogChromeDark ? "text-zinc-500" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "font-medium",
                    dialogChromeDark ? "text-zinc-400" : "text-foreground/80",
                  )}
                >
                  Movimentação:
                </span>{" "}
                {previewMoveChain}
              </p>
            ) : null}
            <p
              className={cn(
                "mt-2 text-[11px]",
                dialogChromeDark ? "text-zinc-600" : "text-muted-foreground/90",
              )}
            >
              {name.trim() ? (
                <>
                  <span
                    className={cn(
                      "font-medium",
                      dialogChromeDark ? "text-zinc-500" : "text-muted-foreground",
                    )}
                  >
                    Nome:
                  </span>{" "}
                  {name.trim()}
                </>
              ) : (
                <span className="italic opacity-90">
                  Dê um nome à automação no campo acima.
                </span>
              )}
            </p>
          </div>

          {formError ? (
            <p
              className={cn(
                "text-sm",
                dialogChromeDark ? "text-rose-400" : "text-destructive",
              )}
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <div
            className={cn(
              "flex gap-2",
              isDialogLayout
                ? cn(
                    "mt-8 justify-end border-t pt-5",
                    dialogChromeDark ? "border-zinc-800" : "border-border",
                  )
                : "justify-start",
            )}
          >
            {isDialogLayout && onCancel ? (
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  dialogChromeDark
                    ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={onCancel}
              >
                Cancelar
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={pending}
              className={cn(
                "font-medium",
                dialogChromeDark &&
                  "bg-zinc-100 text-zinc-950 hover:bg-white dark:bg-zinc-200",
              )}
            >
              {pending ? "Salvando…" : "Salvar automação"}
            </Button>
          </div>
        </form>
      ) : (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            dialogChromeDark
              ? "border-zinc-800 bg-zinc-900/40 text-zinc-400"
              : "border-border/60 bg-muted/15 text-muted-foreground",
          )}
        >
          Apenas administradores e gestores podem criar ou editar automações.{" "}
          <Link
            href="/settings"
            className={cn(
              "font-medium underline-offset-4 hover:underline",
              dialogChromeDark
                ? "text-zinc-200 hover:text-white"
                : "text-foreground",
            )}
          >
            Configurações
          </Link>
        </div>
      )}

      <div
        id="pipeline-automation-rules"
        className="min-h-0 flex-1 space-y-3 scroll-mt-4"
      >
        <p
          className={cn(
            "text-sm font-semibold",
            dialogChromeDark ? "text-zinc-200" : "text-foreground",
          )}
        >
          Regras ativas
        </p>
        {rules.length === 0 ? (
          <p
            className={cn(
              "text-sm",
              dialogChromeDark ? "text-zinc-500" : "text-muted-foreground",
            )}
          >
            Nenhuma automação ainda. {canConfigure ? "Crie uma regra acima." : ""}
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className={cn(
                  "rounded-lg border p-3",
                  dialogChromeDark
                    ? "border-zinc-800 bg-zinc-900/35"
                    : "border-border/60 bg-muted/15 dark:bg-muted/10",
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {PIPELINE_AUTOMATION_TRIGGER_LABELS[r.triggerType]}
                      {describeTriggerFilter(
                        r,
                        stages,
                        campaignSources,
                        dealCustomFieldDefs,
                        sortedTags,
                      )}
                    </p>
                    <p className="text-[13px] text-foreground/90">
                      {summarizeRule(r, stages)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {canConfigure ? (
                      <>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={r.enabled}
                            onChange={(e) => {
                              startTransition(() => {
                                void (async () => {
                                  await togglePipelineAutomationRule({
                                    pipelineId: pipeline.id,
                                    ruleId: r.id,
                                    enabled: e.target.checked,
                                  });
                                  onRulesChanged?.();
                                })();
                              });
                            }}
                            className="rounded border-input"
                          />
                          Ativa
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs text-muted-foreground"
                          onClick={() => loadRuns(r.id)}
                        >
                          {openRunsId === r.id ? (
                            <ChevronUp className="size-3.5" />
                          ) : (
                            <ChevronDown className="size-3.5" />
                          )}
                          Execuções
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 text-muted-foreground hover:text-destructive"
                          aria-label="Excluir regra"
                          onClick={() => {
                            if (
                              !confirm(
                                `Excluir a automação “${r.name}”?`,
                              )
                            )
                              return;
                            startTransition(() => {
                              void (async () => {
                                await deletePipelineAutomationRule({
                                  pipelineId: pipeline.id,
                                  ruleId: r.id,
                                });
                                onRulesChanged?.();
                              })();
                            });
                          }}
                        >
                          <Trash2 className="size-4" strokeWidth={2} />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs text-muted-foreground"
                        onClick={() => loadRuns(r.id)}
                      >
                        {openRunsId === r.id ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                        Execuções
                      </Button>
                    )}
                  </div>
                </div>
                {openRunsId === r.id ? (
                  <div className="mt-3 border-t border-border/40 pt-3">
                    {runsLoading === r.id ? (
                      <p className="text-xs text-muted-foreground">
                        Carregando…
                      </p>
                    ) : (runsByRule[r.id] ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        Nenhuma execução registrada.
                      </p>
                    ) : (
                      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                        {(runsByRule[r.id] ?? []).map((run) => (
                          <li
                            key={run.id}
                            className="flex flex-wrap gap-x-2 text-muted-foreground"
                          >
                            <span className="font-medium text-foreground">
                              {run.status}
                            </span>
                            <span>· deal {run.dealId.slice(0, 8)}…</span>
                            {run.errorMessage ? (
                              <span className="text-destructive">
                                · {run.errorMessage}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
