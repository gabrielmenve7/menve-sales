import {
  addCalendarDaysIso,
  firstOfMonthYmd,
  firstOfPreviousMonthYmd,
  lastDayOfPreviousMonthYmd,
  mondayOfWeekBrazilYmd,
  todayYmdBrazil,
} from "../common/calendar-brazil.util";

/**
 * Presets de data relativos no filtro de cartão (alinhado ao pipeline web).
 * Manter em sincronia com `WIDGET_FILTER_ROLLING_DATE_PRESETS` em dashboard-builder-types (web).
 */
export const WIDGET_FILTER_ROLLING_DATE_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "thisWeek",
  "thisMonth",
  "lastMonth",
] as const;

export type WidgetFilterRollingDatePreset =
  (typeof WIDGET_FILTER_ROLLING_DATE_PRESETS)[number];

export function isWidgetFilterRollingDatePreset(
  s: string | undefined,
): s is WidgetFilterRollingDatePreset {
  return (
    s != null &&
    (WIDGET_FILTER_ROLLING_DATE_PRESETS as readonly string[]).includes(s)
  );
}

/**
 * Limites inclusivos em YYYY-MM-DD para comparar com strings em customData (campo DATE).
 * Calendário em America/Sao_Paulo (independe do TZ do servidor).
 */
export function isoRangeFromRollingPreset(
  _now: Date,
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
      return { from: firstOfMonthYmd(today), to: today };
    case "lastMonth": {
      const from = firstOfPreviousMonthYmd(today);
      const to = lastDayOfPreviousMonthYmd(today);
      return { from, to };
    }
    default:
      return null;
  }
}
