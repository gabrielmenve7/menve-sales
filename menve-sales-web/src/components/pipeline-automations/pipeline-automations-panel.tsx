"use client";

import type { CustomField } from "@prisma/client";
import type { Pipeline, Stage } from "@prisma/client";
import {
  ChevronDown,
  ChevronUp,
  CircleDot,
  ListTree,
  Search,
  Tag,
  Target,
  Trash2,
  UserMinus,
  UserPlus,
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
import type {
  PipelineAutomationAction,
  PipelineAutomationRunRow,
  PipelineAutomationRuleRow,
  PipelineAutomationTriggerFilter,
  PipelineAutomationTriggerType,
} from "@/lib/pipeline-automation-types";
import { PIPELINE_AUTOMATION_TRIGGER_LABELS } from "@/lib/pipeline-automation-types";
import { pipelineSelectClass } from "@/lib/pipeline-ui-tokens";
import { cn } from "@/lib/utils";

/** Página / embed: cartões alinhados aos filtros do pipeline. */
const groupPanelClass =
  "rounded-lg border border-border/60 bg-muted/20 p-3 shadow-sm dark:bg-muted/10";
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

function stageName(stages: Stage[], id: string) {
  return stages.find((s) => s.id === id)?.name ?? id.slice(0, 8);
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
    if (actions.length === 0) continue;
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
}: {
  pipeline: Pipeline & { stages: Stage[] };
  rulesRaw: unknown;
  canConfigure: boolean;
  variant?: "page" | "dialog";
  onRulesChanged?: () => void;
  /** Modal: fecha sem salvar (botão Cancelar). */
  onCancel?: () => void;
  dealCustomFieldDefs?: CustomField[];
  campaignSources?: { id: string; name: string }[];
  tenantTags?: { id: string; name: string }[];
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

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] =
    useState<PipelineAutomationTriggerType>("DEAL_STAGE_TRANSITION");
  const [stageFromId, setStageFromId] = useState("");
  const [stageToId, setStageToId] = useState("");
  const [legacyStageFilterId, setLegacyStageFilterId] = useState("");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [customFieldKey, setCustomFieldKey] = useState("");
  const [fromCustomStr, setFromCustomStr] = useState("");
  const [toCustomStr, setToCustomStr] = useState("");
  const [tagFilterId, setTagFilterId] = useState("");
  const [targetStageId, setTargetStageId] = useState(
    () => stages[0]?.id ?? "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [triggerMenuOpen, setTriggerMenuOpen] = useState(false);
  const [triggerSearch, setTriggerSearch] = useState("");
  const [actionKindType, setActionKindType] =
    useState<PipelineAutomationTriggerType>("DEAL_STAGE_TRANSITION");
  const [actionStageFromId, setActionStageFromId] = useState("");
  const [actionStageToId, setActionStageToId] = useState("");
  const [actionLegacyStageFilterId, setActionLegacyStageFilterId] =
    useState("");
  const [actionSelectedCampaignIds, setActionSelectedCampaignIds] = useState<
    string[]
  >([]);
  const [actionCustomFieldKey, setActionCustomFieldKey] = useState("");
  const [actionFromCustomStr, setActionFromCustomStr] = useState("");
  const [actionToCustomStr, setActionToCustomStr] = useState("");
  const [actionTagFilterId, setActionTagFilterId] = useState("");
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
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
    if (!q) return TRIGGER_GROUPS;
    return TRIGGER_GROUPS.map((g) => ({
      ...g,
      types: g.types.filter((t) =>
        PIPELINE_AUTOMATION_TRIGGER_LABELS[t].toLowerCase().includes(q),
      ),
    })).filter((g) => g.types.length > 0);
  }, [actionSearch]);

  function buildTriggerFilter(): PipelineAutomationTriggerFilter | null {
    const out: PipelineAutomationTriggerFilter = {};
    switch (triggerType) {
      case "DEAL_STAGE_TRANSITION":
        if (stageFromId.trim()) out.fromStageId = stageFromId.trim();
        if (stageToId.trim()) out.toStageId = stageToId.trim();
        break;
      case "DEAL_ENTERED_STAGE":
        if (legacyStageFilterId.trim())
          out.toStageId = legacyStageFilterId.trim();
        break;
      case "DEAL_LEFT_STAGE":
        if (legacyStageFilterId.trim())
          out.fromStageId = legacyStageFilterId.trim();
        break;
      case "DEAL_CREATED":
        if (selectedCampaignIds.length)
          out.campaignSourceIds = [...selectedCampaignIds];
        break;
      case "DEAL_CUSTOM_FIELD_CHANGED":
        out.customFieldKey = customFieldKey.trim();
        {
          const fv = parseOptionalAutomationValue(fromCustomStr);
          if (fv !== undefined) out.fromCustomValue = fv;
          const tv = parseOptionalAutomationValue(toCustomStr);
          if (tv !== undefined) out.toCustomValue = tv;
        }
        break;
      case "CONTACT_TAG_ADDED":
      case "CONTACT_TAG_REMOVED":
        if (tagFilterId.trim()) out.tagId = tagFilterId.trim();
        break;
      default:
        break;
    }
    return Object.keys(out).length ? out : null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Informe um nome para a automação.");
      return;
    }
    if (triggerType === "DEAL_CUSTOM_FIELD_CHANGED" && !customFieldKey.trim()) {
      setFormError("Selecione o campo personalizado no gatilho.");
      return;
    }
    if (
      actionKindType === "DEAL_CUSTOM_FIELD_CHANGED" &&
      !actionCustomFieldKey.trim()
    ) {
      setFormError("Selecione o campo personalizado na ação.");
      return;
    }
    const moveStageId =
      actionKindType === "DEAL_STAGE_TRANSITION"
        ? actionStageToId.trim()
        : targetStageId.trim();
    if (!moveStageId) {
      setFormError(
        actionKindType === "DEAL_STAGE_TRANSITION"
          ? 'Selecione "Para" na ação (etapa de destino).'
          : "Selecione a etapa de destino da ação (Status).",
      );
      return;
    }
    const triggerFilter = buildTriggerFilter();
    startTransition(async () => {
      try {
        await createPipelineAutomationRule({
          pipelineId: pipeline.id,
          name: name.trim(),
          triggerType,
          triggerFilter,
          actions: [{ type: "MOVE_TO_STAGE", stageId: moveStageId }],
        });
        onRulesChanged?.();
        setName("");
        setTriggerType("DEAL_STAGE_TRANSITION");
        setStageFromId("");
        setStageToId("");
        setLegacyStageFilterId("");
        setSelectedCampaignIds([]);
        setCustomFieldKey("");
        setFromCustomStr("");
        setToCustomStr("");
        setTagFilterId("");
        setTargetStageId(stages[0]?.id ?? "");
        setActionKindType("DEAL_STAGE_TRANSITION");
        setActionStageFromId("");
        setActionStageToId("");
        setActionLegacyStageFilterId("");
        setActionSelectedCampaignIds([]);
        setActionCustomFieldKey("");
        setActionFromCustomStr("");
        setActionToCustomStr("");
        setActionTagFilterId("");
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

  const TriggerIcon = triggerIcon(triggerType);
  const ActionIcon = triggerIcon(actionKindType);

  const triggerFieldBundle: AutomationKindFieldBundle = {
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
  };

  const actionFieldBundle: AutomationKindFieldBundle = {
    stageFromId: actionStageFromId,
    setStageFromId: setActionStageFromId,
    stageToId: actionStageToId,
    setStageToId: setActionStageToId,
    legacyStageFilterId: actionLegacyStageFilterId,
    setLegacyStageFilterId: setActionLegacyStageFilterId,
    selectedCampaignIds: actionSelectedCampaignIds,
    setSelectedCampaignIds: setActionSelectedCampaignIds,
    customFieldKey: actionCustomFieldKey,
    setCustomFieldKey: setActionCustomFieldKey,
    fromCustomStr: actionFromCustomStr,
    setFromCustomStr: setActionFromCustomStr,
    toCustomStr: actionToCustomStr,
    setToCustomStr: setActionToCustomStr,
    tagFilterId: actionTagFilterId,
    setTagFilterId: setActionTagFilterId,
  };
  const formShell =
    "rounded-lg border border-border/60 bg-muted/20 p-4 shadow-sm dark:bg-muted/10";
  const isDialog = variant === "dialog";
  const sel = isDialog ? dialogSelectFull : selectFullWidth;
  const trigBtn = isDialog ? dialogTriggerBtn : triggerTypeButtonClass;
  const dashV = isDialog ? dialogDashedV : dashedV;
  const lbl = isDialog
    ? "text-[11px] font-medium text-zinc-500"
    : fieldLabelClass;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col space-y-6",
        isDialog && "text-zinc-100",
      )}
    >
      {variant === "dialog" ? (
        <p className="text-[12px] text-zinc-500">
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
          id={isDialog ? "pipeline-automation-form" : undefined}
          onSubmit={onSubmit}
          className={cn("shrink-0 space-y-5", !isDialog && formShell)}
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-name"
              className={cn(
                "text-[11px] font-medium",
                isDialog ? "text-zinc-500" : "text-muted-foreground",
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
                isDialog
                  ? "rounded-lg border-zinc-700/90 bg-zinc-900/45 text-zinc-100 shadow-none placeholder:text-zinc-600 focus-visible:ring-zinc-500/35"
                  : "rounded-xl border-border/50 bg-background shadow-sm placeholder:text-muted-foreground/70",
              )}
            />
          </div>

          <div
            className={cn(
              "grid gap-6 lg:items-start",
              isDialog
                ? "lg:grid-cols-[minmax(0,1.25fr)_auto_minmax(0,1.25fr)]"
                : "lg:grid-cols-[1fr_auto_1fr]",
              isDialog ? "text-zinc-100" : "text-foreground",
            )}
          >
            {/* Acionar */}
            <div className="relative min-w-0 space-y-0">
              <div className="flex justify-center">
                <div className={cn("h-4 w-px", dashV)} />
              </div>
              <div
                className={cn(
                  isDialog
                    ? "flex items-center justify-between gap-3 py-0.5"
                    : groupHeaderClass,
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md",
                      isDialog
                        ? "bg-violet-500/20 text-violet-300"
                        : "bg-violet-500/15 text-violet-600 dark:text-violet-400",
                    )}
                  >
                    <Zap className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-semibold",
                      isDialog ? "text-zinc-50" : "text-foreground",
                    )}
                  >
                    Acionar
                  </span>
                </div>
                <span
                  className={cn(
                    "hidden shrink-0 rounded-md border px-2 py-1 text-[11px] sm:inline",
                    isDialog
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

              <div className={cn(isDialog ? "space-y-4" : groupPanelClass)}>
                <p className={cn("mb-1 uppercase tracking-wide", lbl)}>
                  Tipo de gatilho
                </p>
                <Popover
                  open={triggerMenuOpen}
                  onOpenChange={setTriggerMenuOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={trigBtn}
                      aria-expanded={triggerMenuOpen}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <TriggerIcon
                          className={cn(
                            "size-4 shrink-0",
                            isDialog ? "text-zinc-400" : "text-muted-foreground",
                          )}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="truncate">
                          {PIPELINE_AUTOMATION_TRIGGER_LABELS[triggerType]}
                        </span>
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
                          value={triggerSearch}
                          onChange={(e) => setTriggerSearch(e.target.value)}
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
                    <div className="max-h-64 overflow-y-auto py-1">
                      {filteredTriggerGroups.map((group) => (
                        <div key={group.heading}>
                          <p
                            className={cn(
                              "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide",
                              isDialog ? "text-zinc-500" : "text-muted-foreground",
                            )}
                          >
                            {group.heading}
                          </p>
                          {group.types.map((t) => {
                            const Icon = triggerIcon(t);
                            const selected = t === triggerType;
                            return (
                              <button
                                key={t}
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
                                  setTriggerType(t);
                                  setTriggerMenuOpen(false);
                                  setTriggerSearch("");
                                }}
                              >
                                <Icon
                                  className={cn(
                                    "size-4 shrink-0",
                                    isDialog
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
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <AutomationKindConfigFields
                  kind={triggerType}
                  bundle={triggerFieldBundle}
                  isDialog={isDialog}
                  lbl={lbl}
                  sel={sel}
                  stages={stages}
                  campaignSources={campaignSources}
                  dealCustomFieldDefs={dealCustomFieldDefs}
                  sortedTags={sortedTags}
                />
              </div>

              <div className="flex justify-center pt-2">
                <div className={cn("h-6 w-px", dashV)} />
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border border-dashed",
                    isDialog
                      ? "border-zinc-700 bg-transparent text-zinc-600"
                      : "border-border/50 bg-muted/20 text-muted-foreground",
                  )}
                  aria-label="Adicionar gatilho (em breve)"
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
                  isDialog
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
                  isDialog
                    ? "flex items-center justify-between gap-3 py-0.5"
                    : groupHeaderClass,
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-md",
                      isDialog
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    <CircleDot className="size-4" strokeWidth={2} aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "truncate text-sm font-semibold",
                      isDialog ? "text-zinc-50" : "text-foreground",
                    )}
                  >
                    Ação
                  </span>
                </div>
                <span
                  className={cn(
                    "hidden shrink-0 rounded-md border px-2 py-1 text-[11px] sm:inline",
                    isDialog
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

              <div className={cn(isDialog ? "space-y-4" : groupPanelClass)}>
                <p className={cn("mb-1 uppercase tracking-wide", lbl)}>
                  Tipo de ação
                </p>
                <Popover
                  open={actionMenuOpen}
                  onOpenChange={setActionMenuOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={trigBtn}
                      aria-expanded={actionMenuOpen}
                      aria-label="Tipo de ação"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ActionIcon
                          className={cn(
                            "size-4 shrink-0",
                            isDialog
                              ? "text-zinc-400"
                              : "text-muted-foreground",
                          )}
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="truncate">
                          {PIPELINE_AUTOMATION_TRIGGER_LABELS[actionKindType]}
                        </span>
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
                          value={actionSearch}
                          onChange={(e) => setActionSearch(e.target.value)}
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
                    <div className="max-h-64 overflow-y-auto py-1">
                      {filteredActionGroups.map((group) => (
                        <div key={group.heading}>
                          <p
                            className={cn(
                              "px-3 py-2 text-[10px] font-semibold uppercase tracking-wide",
                              isDialog ? "text-zinc-500" : "text-muted-foreground",
                            )}
                          >
                            {group.heading}
                          </p>
                          {group.types.map((t) => {
                            const Icon = triggerIcon(t);
                            const selected = t === actionKindType;
                            return (
                              <button
                                key={t}
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
                                  setActionKindType(t);
                                  setActionMenuOpen(false);
                                  setActionSearch("");
                                }}
                              >
                                <Icon
                                  className={cn(
                                    "size-4 shrink-0",
                                    isDialog
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
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <AutomationKindConfigFields
                  kind={actionKindType}
                  bundle={actionFieldBundle}
                  isDialog={isDialog}
                  lbl={lbl}
                  sel={sel}
                  stages={stages}
                  campaignSources={campaignSources}
                  dealCustomFieldDefs={dealCustomFieldDefs}
                  sortedTags={sortedTags}
                />

                <div className="mt-4 space-y-3">
                  {actionKindType !== "DEAL_STAGE_TRANSITION" ? (
                    <div className="space-y-1">
                      <p className={lbl}>
                        Status
                        <span
                          className={
                            isDialog ? "text-rose-400" : "text-destructive"
                          }
                        >
                          *
                        </span>
                      </p>
                      <select
                        className={sel}
                        value={targetStageId}
                        onChange={(e) => setTargetStageId(e.target.value)}
                        aria-label="Etapa de destino da ação"
                      >
                        <option value="">Selecionar um status</option>
                        {stages.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "flex gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug",
                      isDialog
                        ? "border-amber-500/25 bg-amber-500/10 text-amber-100/95"
                        : "border-amber-500/35 bg-amber-500/10 text-amber-950 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100",
                    )}
                  >
                    <span aria-hidden>⚠</span>
                    <span>
                      {actionKindType === "DEAL_STAGE_TRANSITION" ? (
                        <>
                          A oportunidade será movida para a etapa em{" "}
                          <strong className="font-medium">Para</strong>. Se a
                          etapa não existir mais, a regra pode falhar na execução.
                        </>
                      ) : (
                        <>
                          Por enquanto só é aplicado mover para a etapa em{" "}
                          <strong className="font-medium">Status</strong>. Os
                          demais campos acima espelham o tipo escolhido para
                          quando a API suportar ações adicionais.
                        </>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <div className={cn("h-6 w-px", dashV)} />
              </div>
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg border border-dashed",
                    isDialog
                      ? "border-zinc-700 bg-transparent text-zinc-600"
                      : "border-border/50 bg-muted/20 text-muted-foreground",
                  )}
                  aria-label="Adicionar ação (em breve)"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {formError ? (
            <p
              className={cn(
                "text-sm",
                isDialog ? "text-rose-400" : "text-destructive",
              )}
              role="alert"
            >
              {formError}
            </p>
          ) : null}

          <div
            className={cn(
              "flex gap-2",
              isDialog
                ? "mt-8 justify-end border-t border-zinc-800 pt-5"
                : "justify-start",
            )}
          >
            {isDialog && onCancel ? (
              <Button
                type="button"
                variant="ghost"
                className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
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
                isDialog &&
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
            isDialog
              ? "border-zinc-800 bg-zinc-900/40 text-zinc-400"
              : "border-border/60 bg-muted/15 text-muted-foreground",
          )}
        >
          Apenas administradores e gestores podem criar ou editar automações.{" "}
          <Link
            href="/settings"
            className={cn(
              "font-medium underline-offset-4 hover:underline",
              isDialog
                ? "text-zinc-200 hover:text-white"
                : "text-foreground",
            )}
          >
            Configurações
          </Link>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3">
        <p
          className={cn(
            "text-sm font-semibold",
            isDialog ? "text-zinc-200" : "text-foreground",
          )}
        >
          Regras ativas
        </p>
        {rules.length === 0 ? (
          <p
            className={cn(
              "text-sm",
              isDialog ? "text-zinc-500" : "text-muted-foreground",
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
                  isDialog
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
