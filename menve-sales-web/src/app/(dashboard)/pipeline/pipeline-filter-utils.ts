import {
  endOfDay,
  endOfMonth,
  parse,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import type { StageLifecycle } from "@prisma/client";
import type { DealRow } from "./pipeline-types";

export const PIPELINE_STAGE_LIFECYCLE_ALL: readonly StageLifecycle[] = [
  "NOT_STARTED",
  "ACTIVE",
  "DONE",
  "CLOSED",
] as const;

export type PipelineDatePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "thisWeek"
  | "thisMonth"
  | "lastMonth"
  | "custom";

/** Semana começa na segunda-feira (pt-BR). */
const WEEK_OPTS = { weekStartsOn: 1 as const };

export function getDealCreatedInterval(
  now: Date,
  preset: PipelineDatePreset,
  customFrom: Date | null,
  customTo: Date | null,
): { start: Date; end: Date } | null {
  if (preset === "all") return null;
  if (preset === "custom") {
    if (!customFrom || !customTo) return null;
    if (customFrom.getTime() > customTo.getTime()) return null;
    return { start: startOfDay(customFrom), end: endOfDay(customTo) };
  }
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const y = subDays(startOfDay(now), 1);
      return { start: y, end: endOfDay(y) };
    }
    case "last7":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "thisWeek":
      return {
        start: startOfWeek(now, WEEK_OPTS),
        end: endOfDay(now),
      };
    case "thisMonth":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "lastMonth": {
      const ref = subMonths(now, 1);
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
    }
    default:
      return null;
  }
}

export function dealMatchesCreatedInterval(
  deal: DealRow,
  interval: { start: Date; end: Date } | null,
): boolean {
  if (!interval) return true;
  const t = new Date(deal.createdAt).getTime();
  return t >= interval.start.getTime() && t <= interval.end.getTime();
}

export function parseDateInputString(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  const d = parse(t, "yyyy-MM-dd", new Date());
  return Number.isNaN(d.getTime()) ? null : d;
}

export type PipelineFilterFieldId = "createdAt" | "source" | "assignee";

export type PipelineFilterRowState = {
  id: string;
  field: PipelineFilterFieldId;
  datePreset: PipelineDatePreset;
  customFromStr: string;
  customToStr: string;
  /** `__none__` ou id da origem */
  sourceValue: string;
  /** `__unassigned__` ou id do usuário */
  assigneeValue: string;
};

export type PipelineFilterGroupState = {
  id: string;
  rows: PipelineFilterRowState[];
};

export function createEmptyFilterRow(): PipelineFilterRowState {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `r-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    field: "createdAt",
    datePreset: "all",
    customFromStr: "",
    customToStr: "",
    sourceValue: "",
    assigneeValue: "",
  };
}

export function createEmptyFilterGroup(): PipelineFilterGroupState {
  return {
    id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    rows: [createEmptyFilterRow()],
  };
}

/** Um grupo com uma linha vazia; ids fixos para estado inicial (hidratação SSR). */
export function createInitialFilterGroups(): PipelineFilterGroupState[] {
  return [
    {
      id: "filter-group-shell",
      rows: [
        {
          id: "filter-row-shell",
          field: "createdAt",
          datePreset: "all",
          customFromStr: "",
          customToStr: "",
          sourceValue: "",
          assigneeValue: "",
        },
      ],
    },
  ];
}

export function rowIsComplete(row: PipelineFilterRowState): boolean {
  switch (row.field) {
    case "createdAt":
      if (row.datePreset === "all") return false;
      if (row.datePreset === "custom") {
        const a = parseDateInputString(row.customFromStr);
        const b = parseDateInputString(row.customToStr);
        return !!(a && b && a.getTime() <= b.getTime());
      }
      return true;
    case "source":
      return row.sourceValue !== "";
    case "assignee":
      return row.assigneeValue !== "";
    default:
      return false;
  }
}

export function dealMatchesFilterRow(
  deal: DealRow,
  row: PipelineFilterRowState,
): boolean {
  const now = new Date();
  switch (row.field) {
    case "createdAt": {
      const from = parseDateInputString(row.customFromStr);
      const to = parseDateInputString(row.customToStr);
      const interval = getDealCreatedInterval(
        now,
        row.datePreset,
        from,
        to,
      );
      if (row.datePreset === "custom" && !interval) return false;
      return dealMatchesCreatedInterval(deal, interval);
    }
    case "source":
      if (row.sourceValue === "__none__")
        return !deal.contact.campaignSourceId;
      return deal.contact.campaignSourceId === row.sourceValue;
    case "assignee":
      if (row.assigneeValue === "__unassigned__") return !deal.assignedTo;
      return deal.assignedTo?.id === row.assigneeValue;
    default:
      return true;
  }
}

/** OU entre grupos; E entre linhas dentro do mesmo grupo. */
export function filterDealsByGroups(
  deals: DealRow[],
  groups: PipelineFilterGroupState[],
): DealRow[] {
  const active = groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => rowIsComplete(r)),
    }))
    .filter((g) => g.rows.length > 0);

  if (active.length === 0) return deals;

  return deals.filter((d) =>
    active.some((g) => g.rows.every((r) => dealMatchesFilterRow(d, r))),
  );
}

/**
 * Visibilidade de negócios fechados como ganho (WON) no Kanban.
 * `true`: abertos + ganhos; `false`: só abertos (ganhos somem da vista).
 */
export function filterDealsByShowClosedOnBoard(
  deals: DealRow[],
  showClosedDealsOnBoard: boolean,
): DealRow[] {
  if (showClosedDealsOnBoard) {
    return deals.filter((d) => d.status === "OPEN" || d.status === "WON");
  }
  return deals.filter((d) => d.status === "OPEN");
}

/**
 * Filtra por categoria da etapa (`Stage.lifecycle`).
 * `null` ou conjunto com as 4 categorias = sem filtro adicional.
 */
export function filterDealsByStageLifecycles(
  deals: DealRow[],
  allowed: ReadonlySet<StageLifecycle> | null,
): DealRow[] {
  if (!allowed || allowed.size === 0) return [];
  if (allowed.size >= PIPELINE_STAGE_LIFECYCLE_ALL.length) return deals;
  return deals.filter((d) => allowed.has(d.stage.lifecycle));
}
