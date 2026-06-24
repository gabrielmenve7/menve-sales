"use client";

import { ChevronsUpDown, ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  DealStatusCode,
  PipelineListItem,
  PipelineStageColor,
  StageLifecycleCode,
} from "@/lib/dashboard-builder-types";
import { cn } from "@/lib/utils";

const DEAL_STATUS_LABELS: { code: DealStatusCode; label: string }[] = [
  { code: "OPEN", label: "Aberto" },
  { code: "WON", label: "Ganho" },
  { code: "LOST", label: "Perdido" },
  { code: "ARCHIVED", label: "Arquivado" },
];

const LIFECYCLE_ORDER: StageLifecycleCode[] = [
  "NOT_STARTED",
  "ACTIVE",
  "DONE",
  "CLOSED",
];

const LIFECYCLE_LABEL: Record<StageLifecycleCode, string> = {
  NOT_STARTED: "Não iniciado",
  ACTIVE: "Ativo",
  DONE: "Feito",
  CLOSED: "Fechados",
};

function normalizeLifecycle(
  s: PipelineStageColor,
): StageLifecycleCode {
  const lc = s.lifecycle;
  if (
    lc === "NOT_STARTED" ||
    lc === "ACTIVE" ||
    lc === "DONE" ||
    lc === "CLOSED"
  ) {
    return lc;
  }
  return "ACTIVE";
}

function stagesForPipeline(
  pipelines: PipelineListItem[],
  pipelineId: string,
): PipelineStageColor[] {
  const p = pipelines.find((x) => x.id === pipelineId);
  return p?.stages ?? [];
}

function summarizeSelection(
  statusCodes: DealStatusCode[],
  stageIds: string[],
): string {
  const st = new Set(statusCodes);
  const onlyDefaultOpen =
    st.size === 1 && st.has("OPEN") && stageIds.length === 0;
  if (onlyDefaultOpen) return "Aberto (padrão)";
  const parts: string[] = [];
  if (stageIds.length > 0) {
    parts.push(stageIds.length === 1 ? "1 etapa" : `${stageIds.length} etapas`);
  }
  if (statusCodes.length > 0) {
    const names = statusCodes.map(
      (c) => DEAL_STATUS_LABELS.find((x) => x.code === c)?.label ?? c,
    );
    parts.push(names.join(", "));
  }
  return parts.join(" · ") || "Selecionar…";
}

export function DashPipelineStatusFilterPopover({
  pipelineId,
  pipelines,
  statusCodes,
  stageIds,
  triggerClassName,
  onChange,
}: {
  pipelineId: string;
  pipelines: PipelineListItem[];
  statusCodes: DealStatusCode[];
  stageIds: string[];
  triggerClassName: string;
  onChange: (next: {
    statusCodes: DealStatusCode[];
    stageIds: string[];
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Record<StageLifecycleCode, boolean>>(
    () => ({
      NOT_STARTED: true,
      ACTIVE: true,
      DONE: true,
      CLOSED: true,
    }),
  );

  const allStages = useMemo(
    () => stagesForPipeline(pipelines, pipelineId),
    [pipelines, pipelineId],
  );

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const buckets = new Map<StageLifecycleCode, PipelineStageColor[]>();
    for (const lc of LIFECYCLE_ORDER) buckets.set(lc, []);
    for (const s of allStages) {
      const lc = normalizeLifecycle(s);
      if (needle && !s.name.toLowerCase().includes(needle)) continue;
      buckets.get(lc)!.push(s);
    }
    return LIFECYCLE_ORDER.map((lifecycle) => ({
      lifecycle,
      stages: buckets.get(lifecycle)!,
    })).filter((g) => g.stages.length > 0);
  }, [allStages, q]);

  const toggleStatus = (code: DealStatusCode, checked: boolean) => {
    const set = new Set(statusCodes);
    if (checked) set.add(code);
    else set.delete(code);
    let next = [...set] as DealStatusCode[];
    if (next.length === 0) next = ["OPEN"];
    onChange({ statusCodes: next, stageIds });
  };

  const toggleStage = (id: string, checked: boolean) => {
    const set = new Set(stageIds);
    if (checked) set.add(id);
    else set.delete(id);
    onChange({ statusCodes, stageIds: [...set] });
  };

  const selectAllInLifecycle = (lifecycle: StageLifecycleCode) => {
    const ids = allStages
      .filter((s) => normalizeLifecycle(s) === lifecycle)
      .map((s) => s.id);
    const inGroup = ids.filter((id) => stageIds.includes(id));
    const allOn = inGroup.length === ids.length && ids.length > 0;
    const set = new Set(stageIds);
    if (allOn) for (const id of ids) set.delete(id);
    else for (const id of ids) set.add(id);
    onChange({ statusCodes, stageIds: [...set] });
  };

  const hasStages = allStages.length > 0;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQ("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-10 min-w-[12rem] max-w-[18rem] justify-between rounded-md border border-input bg-background px-2 text-left text-sm font-normal shadow-sm ring-offset-background",
            triggerClassName,
          )}
        >
          <span className="min-w-0 flex-1 truncate">
            {summarizeSelection(statusCodes, stageIds)}
          </span>
          <ChevronsUpDown className="ml-1 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[min(22rem,calc(100vw-2rem))] border-border/60 p-0 shadow-lg"
        align="start"
      >
        <div className="border-b border-border/60 p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar…"
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="max-h-[min(22rem,50vh)] overflow-y-auto overscroll-contain p-2">
          <div className="mb-2 border-b border-border/40 pb-2">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Situação do negócio
            </p>
            <div className="grid gap-1.5">
              {DEAL_STATUS_LABELS.map(({ code, label }) => (
                <label
                  key={code}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60"
                >
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 rounded border-input accent-primary"
                    checked={statusCodes.includes(code)}
                    onChange={(e) => toggleStatus(code, e.target.checked)}
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {hasStages ? (
            <>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Etapas do funil
              </p>
              {grouped.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Nada encontrado.
                </p>
              ) : (
                grouped.map(({ lifecycle, stages }) => (
                  <div key={lifecycle} className="mb-2 last:mb-0">
                    <div className="flex items-center justify-between gap-2 px-1 py-1">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium text-foreground"
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [lifecycle]: !prev[lifecycle],
                          }))
                        }
                      >
                        {expanded[lifecycle] ? (
                          <ChevronDown className="size-4 shrink-0 opacity-70" />
                        ) : (
                          <ChevronRight className="size-4 shrink-0 opacity-70" />
                        )}
                        <span className="truncate">
                          {LIFECYCLE_LABEL[lifecycle]}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="shrink-0 text-xs font-medium text-primary hover:underline"
                        onClick={() => selectAllInLifecycle(lifecycle)}
                      >
                        Marcar tudo
                      </button>
                    </div>
                    {expanded[lifecycle] ? (
                      <div className="ml-5 space-y-0.5 border-l border-border/30 pl-2">
                        {stages.map((s) => {
                          const hex = s.color?.trim();
                          const dotStyle =
                            hex && /^#[0-9A-Fa-f]{6}$/.test(hex)
                              ? { backgroundColor: hex }
                              : { backgroundColor: "hsl(var(--muted-foreground))" };
                          return (
                            <label
                              key={s.id}
                              className="flex cursor-pointer items-center gap-2 rounded-md py-1 pr-1 hover:bg-muted/50"
                            >
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 rounded border-input accent-primary"
                                checked={stageIds.includes(s.id)}
                                onChange={(e) =>
                                  toggleStage(s.id, e.target.checked)
                                }
                              />
                              <span
                                className="size-2.5 shrink-0 rounded-full ring-1 ring-border"
                                style={dotStyle}
                                aria-hidden
                              />
                              <span className="min-w-0 flex-1 truncate text-sm">
                                {s.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Este funil ainda não tem etapas cadastradas. Use só a situação do
              negócio acima.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
