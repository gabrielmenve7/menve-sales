"use client";

import type { Pipeline, Stage } from "@prisma/client";
import { ArrowRight, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import Link from "next/link";
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
import type {
  PipelineAutomationAction,
  PipelineAutomationRunRow,
  PipelineAutomationRuleRow,
  PipelineAutomationTriggerType,
} from "@/lib/pipeline-automation-types";
import { PIPELINE_AUTOMATION_TRIGGER_LABELS } from "@/lib/pipeline-automation-types";
import {
  pipelineFieldSelectClass,
  pipelineSelectClass,
} from "@/lib/pipeline-ui-tokens";

const TRIGGER_OPTIONS: PipelineAutomationTriggerType[] = [
  "DEAL_CREATED",
  "DEAL_ENTERED_STAGE",
  "DEAL_LEFT_STAGE",
  "DEAL_MARKED_WON",
  "DEAL_MARKED_LOST",
];

function stageName(stages: Stage[], id: string) {
  return stages.find((s) => s.id === id)?.name ?? id.slice(0, 8);
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
    const tf = o.triggerFilter;
    let triggerFilter: PipelineAutomationRuleRow["triggerFilter"] = null;
    if (tf && typeof tf === "object") {
      const t = tf as Record<string, unknown>;
      triggerFilter = {
        ...(typeof t.toStageId === "string"
          ? { toStageId: t.toStageId }
          : {}),
        ...(typeof t.fromStageId === "string"
          ? { fromStageId: t.fromStageId }
          : {}),
      };
      if (!triggerFilter.toStageId && !triggerFilter.fromStageId) {
        triggerFilter = null;
      }
    }
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

export function PipelineAutomationsPanel({
  pipeline,
  rulesRaw,
  canConfigure,
}: {
  pipeline: Pipeline & { stages: Stage[] };
  rulesRaw: unknown;
  canConfigure: boolean;
}) {
  const stages = useMemo(
    () => [...pipeline.stages].sort((a, b) => a.sortOrder - b.sortOrder),
    [pipeline.stages],
  );
  const rules = useMemo(() => parseRulesFromApi(rulesRaw), [rulesRaw]);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] =
    useState<PipelineAutomationTriggerType>("DEAL_CREATED");
  const [filterStageId, setFilterStageId] = useState("");
  const [targetStageId, setTargetStageId] = useState(
    () => stages[0]?.id ?? "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [openRunsId, setOpenRunsId] = useState<string | null>(null);
  const [runsByRule, setRunsByRule] = useState<
    Record<string, PipelineAutomationRunRow[]>
  >({});
  const [runsLoading, setRunsLoading] = useState<string | null>(null);

  function buildTriggerFilter(): {
    toStageId?: string;
    fromStageId?: string;
  } | null {
    if (triggerType === "DEAL_ENTERED_STAGE" && filterStageId.trim()) {
      return { toStageId: filterStageId.trim() };
    }
    if (triggerType === "DEAL_LEFT_STAGE" && filterStageId.trim()) {
      return { fromStageId: filterStageId.trim() };
    }
    return null;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Informe um nome para a automação.");
      return;
    }
    if (!targetStageId) {
      setFormError("Selecione a etapa de destino.");
      return;
    }
    startTransition(async () => {
      try {
        await createPipelineAutomationRule({
          pipelineId: pipeline.id,
          name: name.trim(),
          triggerType,
          triggerFilter: buildTriggerFilter(),
          actions: [{ type: "MOVE_TO_STAGE", stageId: targetStageId }],
        });
        setName("");
        setTriggerType("DEAL_CREATED");
        setFilterStageId("");
        setTargetStageId(stages[0]?.id ?? "");
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

  return (
    <div className="flex min-h-0 flex-1 flex-col space-y-6">
      <p className="text-[12px] text-muted-foreground">
        Funil:{" "}
        <span className="font-medium text-foreground">{pipeline.name}</span>
        . As regras são avaliadas na ordem abaixo quando o evento ocorre.
      </p>

      {canConfigure ? (
        <form
          onSubmit={onSubmit}
          className="shrink-0 space-y-4 rounded-lg border border-border/60 bg-muted/20 p-4 dark:bg-muted/10"
        >
          <div className="space-y-1.5">
            <Label
              htmlFor="auto-name"
              className="text-[11px] font-medium text-muted-foreground"
            >
              Nome da automação
            </Label>
            <Input
              id="auto-name"
              placeholder="Dê um nome a esta automação…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl border-border/50 text-[14px] shadow-sm"
            />
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1 space-y-2 rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Quando
              </p>
              <div className="space-y-2">
                <Label className="text-[10px] text-muted-foreground">
                  Gatilho
                </Label>
                <select
                  className={pipelineSelectClass}
                  value={triggerType}
                  onChange={(e) =>
                    setTriggerType(
                      e.target.value as PipelineAutomationTriggerType,
                    )
                  }
                  aria-label="Gatilho"
                >
                  {TRIGGER_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {PIPELINE_AUTOMATION_TRIGGER_LABELS[t]}
                    </option>
                  ))}
                </select>
                {(triggerType === "DEAL_ENTERED_STAGE" ||
                  triggerType === "DEAL_LEFT_STAGE") && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      {triggerType === "DEAL_ENTERED_STAGE"
                        ? "Etapa de destino (opcional)"
                        : "Etapa de origem (opcional)"}
                    </Label>
                    <select
                      className={pipelineSelectClass}
                      value={filterStageId}
                      onChange={(e) => setFilterStageId(e.target.value)}
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
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-center px-1 lg:px-2">
              <ArrowRight
                className="size-6 text-muted-foreground lg:size-7"
                strokeWidth={1.75}
                aria-hidden
              />
            </div>

            <div className="min-w-0 flex-1 space-y-2 rounded-lg border border-border/50 bg-background/80 p-3 shadow-sm">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Então
              </p>
              <Label className="text-[10px] text-muted-foreground">
                Mover oportunidade para
              </Label>
              <select
                className={pipelineFieldSelectClass}
                value={targetStageId}
                onChange={(e) => setTargetStageId(e.target.value)}
                aria-label="Etapa de destino da ação"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError ? (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          ) : null}

          <Button type="submit" disabled={pending} className="font-medium">
            {pending ? "Salvando…" : "Salvar automação"}
          </Button>
        </form>
      ) : (
        <div className="rounded-lg border border-border/60 bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
          Apenas administradores e gestores podem criar ou editar automações.{" "}
          <Link
            href="/settings"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Configurações
          </Link>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-3">
        <p className="text-sm font-semibold">Regras ativas</p>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma automação ainda. {canConfigure ? "Crie uma regra acima." : ""}
          </p>
        ) : (
          <ul className="space-y-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-border/60 bg-muted/15 p-3 dark:bg-muted/10"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{r.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {PIPELINE_AUTOMATION_TRIGGER_LABELS[r.triggerType]}
                      {r.triggerFilter?.toStageId
                        ? ` · etapa ${stageName(stages, r.triggerFilter.toStageId)}`
                        : null}
                      {r.triggerFilter?.fromStageId
                        ? ` · saiu de ${stageName(stages, r.triggerFilter.fromStageId)}`
                        : null}
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
                              startTransition(() =>
                                togglePipelineAutomationRule({
                                  pipelineId: pipeline.id,
                                  ruleId: r.id,
                                  enabled: e.target.checked,
                                }),
                              );
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
                            startTransition(() =>
                              deletePipelineAutomationRule({
                                pipelineId: pipeline.id,
                                ruleId: r.id,
                              }),
                            );
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
