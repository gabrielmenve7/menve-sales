import type { WidgetQuerySpec } from "@/lib/dashboard-builder-types";
import {
  addCalendarDaysIso,
  endOfMonthYmd,
  firstOfMonthYmd,
  firstOfPreviousMonthYmd,
  minYmd,
  todayYmdBrazil,
} from "@/lib/brazil-calendar";

export type DashboardDatePresetId =
  | "TODAY"
  | "YESTERDAY"
  | "LAST_7"
  | "LAST_14"
  | "LAST_30"
  | "THIS_MONTH"
  | "PREV_MONTH"
  | "LAST_90"
  | "LAST_180"
  | "LAST_12_MONTHS";

export type DashboardDateRangeState =
  | { mode: "preset"; preset: DashboardDatePresetId }
  | { mode: "custom"; from: string; to: string };

export const DASHBOARD_DATE_PRESET_LABELS: Record<DashboardDatePresetId, string> =
  {
    TODAY: "Hoje",
    YESTERDAY: "Ontem",
    LAST_7: "Últimos 7 dias",
    LAST_14: "Últimos 14 dias",
    LAST_30: "Últimos 30 dias",
    THIS_MONTH: "Este mês",
    PREV_MONTH: "Mês anterior",
    LAST_90: "Últimos 90 dias",
    LAST_180: "Últimos 180 dias",
    LAST_12_MONTHS: "Últimos 12 meses",
  };

export const DEFAULT_DASHBOARD_DATE_PRESET: DashboardDatePresetId = "THIS_MONTH";

export function defaultDashboardDateRangeState(): DashboardDateRangeState {
  return { mode: "preset", preset: DEFAULT_DASHBOARD_DATE_PRESET };
}

export type ByDayInstruction =
  | { type: "rolling"; days: number }
  | { type: "thisMonth"; todayBr: string }
  | { type: "previousMonth"; todayBr: string }
  | { type: "fixed"; start: string; end: string };

export type AppliedGlobalDateRange = {
  from: string;
  to: string;
  byDay: ByDayInstruction;
  canonical:
    | { kind: "preset"; preset: DashboardDatePresetId }
    | { kind: "custom"; from: string; to: string };
};

export function formatYmdToBr(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

export function parseDdMmYyyyToYmd(input: string): string | null {
  const t = input.trim();
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(d) || !Number.isFinite(mo) || !Number.isFinite(y)) {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const [y2, m2, d2] = iso.split("-").map(Number);
  const check = new Date(Date.UTC(y2, m2 - 1, d2));
  if (
    check.getUTCFullYear() !== y2 ||
    check.getUTCMonth() !== m2 - 1 ||
    check.getUTCDate() !== d2
  ) {
    return null;
  }
  return iso;
}

/** Resolve o intervalo global (filtros + instrução BY_DAY) a partir do estado do picker. */
export function resolveAppliedGlobalDateRange(
  state: DashboardDateRangeState,
  todayBr = todayYmdBrazil(),
): AppliedGlobalDateRange {
  if (state.mode === "custom") {
    let from = state.from;
    let to = state.to;
    if (from > to) [from, to] = [to, from];
    const endCap = minYmd(to, todayBr);
    const from2 = minYmd(from, endCap);
    return {
      from: from2,
      to: endCap,
      byDay: { type: "fixed", start: from2, end: endCap },
      canonical: { kind: "custom", from: from2, to: endCap },
    };
  }

  const preset = state.preset;
  const canonical = { kind: "preset" as const, preset };

  switch (preset) {
    case "TODAY":
      return {
        from: todayBr,
        to: todayBr,
        byDay: { type: "fixed", start: todayBr, end: todayBr },
        canonical,
      };
    case "YESTERDAY": {
      const y = addCalendarDaysIso(todayBr, -1);
      return {
        from: y,
        to: y,
        byDay: { type: "fixed", start: y, end: y },
        canonical,
      };
    }
    case "LAST_7":
      return {
        from: addCalendarDaysIso(todayBr, -6),
        to: todayBr,
        byDay: { type: "rolling", days: 7 },
        canonical,
      };
    case "LAST_14":
      return {
        from: addCalendarDaysIso(todayBr, -13),
        to: todayBr,
        byDay: { type: "rolling", days: 14 },
        canonical,
      };
    case "LAST_30":
      return {
        from: addCalendarDaysIso(todayBr, -29),
        to: todayBr,
        byDay: { type: "rolling", days: 30 },
        canonical,
      };
    case "LAST_90":
      return {
        from: addCalendarDaysIso(todayBr, -89),
        to: todayBr,
        byDay: { type: "rolling", days: 90 },
        canonical,
      };
    case "LAST_180":
      return {
        from: addCalendarDaysIso(todayBr, -179),
        to: todayBr,
        byDay: { type: "rolling", days: 180 },
        canonical,
      };
    case "LAST_12_MONTHS":
      return {
        from: addCalendarDaysIso(todayBr, -364),
        to: todayBr,
        byDay: { type: "rolling", days: 365 },
        canonical,
      };
    case "THIS_MONTH": {
      const monthStart = firstOfMonthYmd(todayBr);
      const monthEnd = endOfMonthYmd(monthStart);
      const to = minYmd(todayBr, monthEnd);
      return {
        from: monthStart,
        to,
        byDay: { type: "thisMonth", todayBr },
        canonical,
      };
    }
    case "PREV_MONTH": {
      const first = firstOfPreviousMonthYmd(todayBr);
      const last = endOfMonthYmd(first);
      return {
        from: first,
        to: last,
        byDay: { type: "previousMonth", todayBr },
        canonical,
      };
    }
  }
}

function mergeGlobalUpdatedAtFilter(
  spec: WidgetQuerySpec,
  from: string,
  to: string,
): void {
  if (spec.filterGroups && spec.filterGroups.length > 0) {
    let any = false;
    for (const g of spec.filterGroups) {
      for (const row of g.rows) {
        if (row.field === "updatedAt") {
          any = true;
          row.createdFrom = from;
          row.createdTo = to;
        }
      }
    }
    if (!any) {
      const g0 = spec.filterGroups[0]!;
      g0.rows.push({
        rowJoin: "AND",
        field: "updatedAt",
        op: "IS",
        createdFrom: from,
        createdTo: to,
      });
    }
  } else {
    spec.filterUpdatedFrom = from;
    spec.filterUpdatedTo = to;
  }
}

function patchByDayForGlobalRange(
  spec: WidgetQuerySpec,
  byDay: ByDayInstruction,
): void {
  delete spec.days;
  delete spec.timelineStart;
  delete spec.timelineEnd;
  delete spec.fillTimelineMonth;

  switch (byDay.type) {
    case "rolling":
      spec.days = byDay.days;
      return;
    case "thisMonth": {
      spec.timelineStart = firstOfMonthYmd(byDay.todayBr);
      spec.fillTimelineMonth = true;
      return;
    }
    case "previousMonth": {
      const first = firstOfPreviousMonthYmd(byDay.todayBr);
      spec.timelineStart = first;
      spec.fillTimelineMonth = true;
      return;
    }
    case "fixed":
      spec.timelineStart = byDay.start;
      spec.timelineEnd = byDay.end;
      spec.fillTimelineMonth = false;
      return;
  }
}

export function applyGlobalDateRangeToQuerySpec(
  spec: WidgetQuerySpec,
  applied: AppliedGlobalDateRange,
): WidgetQuerySpec {
  const next = structuredClone(spec) as WidgetQuerySpec;
  mergeGlobalUpdatedAtFilter(next, applied.from, applied.to);
  if (next.dimension === "BY_DAY") {
    patchByDayForGlobalRange(next, applied.byDay);
  }
  return next;
}

export function buildWidgetQuerySpecsWithGlobalRange(
  widgets: { querySpec: WidgetQuerySpec }[],
  state: DashboardDateRangeState,
  todayBr = todayYmdBrazil(),
): {
  specs: WidgetQuerySpec[];
  specsKey: string;
  applied: AppliedGlobalDateRange;
} {
  const applied = resolveAppliedGlobalDateRange(state, todayBr);
  const specs = widgets.map((w) =>
    applyGlobalDateRangeToQuerySpec(w.querySpec, applied),
  );
  const specsKey = JSON.stringify({
    v: 2,
    range: applied.canonical,
    specs,
  });
  return { specs, specsKey, applied };
}

export function triggerLabelForDashboardDateRange(
  state: DashboardDateRangeState,
  applied: AppliedGlobalDateRange,
): string {
  if (state.mode === "preset") {
    return DASHBOARD_DATE_PRESET_LABELS[state.preset];
  }
  return `${formatYmdToBr(applied.from)} - ${formatYmdToBr(applied.to)}`;
}

function countInclusiveYmdDays(from: string, to: string): number {
  let n = 0;
  let c = from;
  while (c <= to) {
    n++;
    c = addCalendarDaysIso(c, 1);
    if (n > 500) break;
  }
  return n;
}

/**
 * Intervalo imediatamente anterior ao selecionado, para comparação (MoM / janela rolante / custom).
 */
export function resolvePreviousComparisonAppliedGlobalDateRange(
  state: DashboardDateRangeState,
  current: AppliedGlobalDateRange,
  todayBr = todayYmdBrazil(),
): AppliedGlobalDateRange | null {
  if (state.mode === "preset" && state.preset === "THIS_MONTH") {
    const first = firstOfPreviousMonthYmd(todayBr);
    const last = endOfMonthYmd(first);
    return resolveAppliedGlobalDateRange(
      { mode: "custom", from: first, to: last },
      todayBr,
    );
  }
  if (state.mode === "preset" && state.preset === "PREV_MONTH") {
    const prevFirst = firstOfPreviousMonthYmd(current.from);
    const prevLast = endOfMonthYmd(prevFirst);
    return resolveAppliedGlobalDateRange(
      { mode: "custom", from: prevFirst, to: prevLast },
      todayBr,
    );
  }
  if (state.mode === "preset" && state.preset === "TODAY") {
    const y = addCalendarDaysIso(todayBr, -1);
    return resolveAppliedGlobalDateRange(
      { mode: "custom", from: y, to: y },
      todayBr,
    );
  }
  if (state.mode === "preset" && state.preset === "YESTERDAY") {
    const y = addCalendarDaysIso(todayBr, -2);
    return resolveAppliedGlobalDateRange(
      { mode: "custom", from: y, to: y },
      todayBr,
    );
  }

  const n = countInclusiveYmdDays(current.from, current.to);
  if (n < 1) return null;
  const prevTo = addCalendarDaysIso(current.from, -1);
  const prevFrom = addCalendarDaysIso(prevTo, -(n - 1));
  if (prevFrom > prevTo) return null;
  return resolveAppliedGlobalDateRange(
    { mode: "custom", from: prevFrom, to: prevTo },
    todayBr,
  );
}

export function buildWidgetQuerySpecsFromApplied(
  widgets: { querySpec: WidgetQuerySpec }[],
  applied: AppliedGlobalDateRange,
): WidgetQuerySpec[] {
  return widgets.map((w) =>
    applyGlobalDateRangeToQuerySpec(w.querySpec, applied),
  );
}
