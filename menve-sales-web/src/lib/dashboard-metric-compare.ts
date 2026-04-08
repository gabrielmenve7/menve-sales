import type { WidgetFilterRowSaved, WidgetQuerySpec } from "@/lib/dashboard-builder-types";
import {
  isWidgetFilterRollingDatePreset,
  type WidgetFilterRollingDatePreset,
} from "@/lib/dashboard-builder-types";
import {
  addCalendarDaysIso,
  endOfMonthYmd,
  firstOfMonthYmd,
  firstOfPreviousMonthYmd,
  lastDayOfPreviousMonthYmd,
  mondayOfWeekBrazilYmd,
  todayYmdBrazil,
} from "@/lib/dashboard-calendar-brazil";

/**
 * Igual a `isoRangeFromRollingPreset` em `dashboard-custom-date-preset.util.ts` (API).
 */
export function isoRangeFromRollingPreset(
  preset: WidgetFilterRollingDatePreset,
): { from: string; to: string } | null {
  const today = todayYmdBrazil();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const x = addCalendarDaysIso(today, -1);
      return { from: x, to: x };
    }
    case "last7":
      return { from: addCalendarDaysIso(today, -6), to: today };
    case "thisWeek":
      return { from: mondayOfWeekBrazilYmd(today), to: today };
    case "thisMonth":
      return { from: firstOfMonthYmd(today), to: endOfMonthYmd(today) };
    case "lastMonth": {
      const from = firstOfPreviousMonthYmd(today);
      const to = lastDayOfPreviousMonthYmd(today);
      return { from, to };
    }
    default:
      return null;
  }
}

/** Período imediatamente anterior ao do preset (para comparativo no cartão métrica). */
export function previousRangeForRollingPreset(
  preset: WidgetFilterRollingDatePreset,
): { from: string; to: string } | null {
  const today = todayYmdBrazil();
  switch (preset) {
    case "today": {
      const y = addCalendarDaysIso(today, -1);
      return { from: y, to: y };
    }
    case "yesterday": {
      const y = addCalendarDaysIso(today, -2);
      return { from: y, to: y };
    }
    case "last7":
      return {
        from: addCalendarDaysIso(today, -13),
        to: addCalendarDaysIso(today, -7),
      };
    case "thisWeek": {
      const cur = isoRangeFromRollingPreset("thisWeek");
      if (!cur) return null;
      return {
        from: addCalendarDaysIso(cur.from, -7),
        to: addCalendarDaysIso(cur.to, -7),
      };
    }
    case "thisMonth": {
      const from = firstOfPreviousMonthYmd(today);
      const to = lastDayOfPreviousMonthYmd(today);
      return { from, to };
    }
    case "lastMonth": {
      const anchor = firstOfPreviousMonthYmd(today);
      const from = firstOfPreviousMonthYmd(anchor);
      const to = lastDayOfPreviousMonthYmd(anchor);
      return { from, to };
    }
    default:
      return null;
  }
}

function inclusiveDayCount(from: string, to: string): number {
  let n = 0;
  let cur = from;
  while (cur <= to) {
    n += 1;
    cur = addCalendarDaysIso(cur, 1);
    if (n > 400) break;
  }
  return n;
}

/** Mesmo número de dias civil, imediatamente antes de `from`. */
export function previousRangeForInclusiveYmd(
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  if (from > to) return null;
  const n = inclusiveDayCount(from, to);
  const prevTo = addCalendarDaysIso(from, -1);
  const prevFrom = addCalendarDaysIso(prevTo, -(n - 1));
  return { from: prevFrom, to: prevTo };
}

function countComparableDateRows(spec: WidgetQuerySpec): number {
  let count = 0;
  const walk = (r: WidgetFilterRowSaved) => {
    if (r.field === "customField" && r.customKey?.trim()) {
      if (isWidgetFilterRollingDatePreset(r.customDatePreset)) {
        count += 1;
        return;
      }
      if (r.customDateFrom?.trim() && r.customDateTo?.trim()) {
        count += 1;
      }
    }
    if (r.field === "createdAt" && r.createdFrom?.trim() && r.createdTo?.trim()) {
      count += 1;
    }
  };
  if (spec.filterGroups && spec.filterGroups.length > 0) {
    for (const g of spec.filterGroups) {
      for (const r of g.rows) walk(r);
    }
    return count;
  }
  if (spec.filterCreatedFrom && spec.filterCreatedTo) count += 1;
  return count;
}

function patchFirstDateRow(
  groups: NonNullable<WidgetQuerySpec["filterGroups"]>,
  range: { from: string; to: string },
  mode:
    | { type: "customField"; key: string }
    | { type: "createdAt" },
): boolean {
  for (const g of groups) {
    for (let i = 0; i < g.rows.length; i++) {
      const r = g.rows[i]!;
      if (
        mode.type === "customField" &&
        r.field === "customField" &&
        r.customKey?.trim() === mode.key
      ) {
        const next: WidgetFilterRowSaved = {
          ...r,
          customDatePreset: undefined,
          customDateFrom: range.from,
          customDateTo: range.to,
        };
        g.rows[i] = next;
        return true;
      }
      if (mode.type === "createdAt" && r.field === "createdAt") {
        g.rows[i] = {
          ...r,
          createdFrom: range.from,
          createdTo: range.to,
        };
        return true;
      }
    }
  }
  return false;
}

/**
 * Clona o spec e ajusta o único filtro de data para o período anterior.
 * Retorna null se não houver exatamente um intervalo de data comparável.
 */
export function buildMetricComparisonSpec(spec: WidgetQuerySpec): WidgetQuerySpec | null {
  if (spec.dimension != null) return null;

  if (countComparableDateRows(spec) !== 1) return null;

  const clone = structuredClone(spec) as WidgetQuerySpec;

  if (!clone.filterGroups || clone.filterGroups.length === 0) {
    const prev = previousRangeForInclusiveYmd(
      clone.filterCreatedFrom!,
      clone.filterCreatedTo!,
    );
    if (!prev) return null;
    return {
      ...clone,
      filterCreatedFrom: prev.from,
      filterCreatedTo: prev.to,
    };
  }

  const groups = clone.filterGroups;
  for (const g of groups) {
    for (const r of g.rows) {
      if (r.field === "customField" && r.customKey?.trim()) {
        if (isWidgetFilterRollingDatePreset(r.customDatePreset)) {
          const prev = previousRangeForRollingPreset(r.customDatePreset);
          if (!prev) return null;
          const ok = patchFirstDateRow(groups, prev, {
            type: "customField",
            key: r.customKey.trim(),
          });
          return ok ? clone : null;
        }
        if (r.customDateFrom?.trim() && r.customDateTo?.trim()) {
          const prev = previousRangeForInclusiveYmd(
            r.customDateFrom.trim(),
            r.customDateTo.trim(),
          );
          if (!prev) return null;
          const ok = patchFirstDateRow(groups, prev, {
            type: "customField",
            key: r.customKey.trim(),
          });
          return ok ? clone : null;
        }
      }
      if (r.field === "createdAt" && r.createdFrom?.trim() && r.createdTo?.trim()) {
        const prev = previousRangeForInclusiveYmd(
          r.createdFrom.trim(),
          r.createdTo.trim(),
        );
        if (!prev) return null;
        const ok = patchFirstDateRow(groups, prev, { type: "createdAt" });
        return ok ? clone : null;
      }
    }
  }

  return null;
}
