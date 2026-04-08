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

const pad2 = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD no calendário local (igual `toIsoDateLocal` no web). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfLocalDay(base: Date): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
    0,
  );
}

/**
 * Limites inclusivos em YYYY-MM-DD para comparar com strings em customData (campo DATE).
 */
export function isoRangeFromRollingPreset(
  now: Date,
  preset: WidgetFilterRollingDatePreset,
): { from: string; to: string } | null {
  switch (preset) {
    case "today": {
      const s = startOfLocalDay(now);
      const x = isoLocal(s);
      return { from: x, to: x };
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = startOfLocalDay(y);
      const x = isoLocal(s);
      return { from: x, to: x };
    }
    case "last7": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return {
        from: isoLocal(startOfLocalDay(start)),
        to: isoLocal(startOfLocalDay(now)),
      };
    }
    case "thisWeek": {
      const day = now.getDay();
      const offset = (day + 6) % 7;
      const monday = new Date(now);
      monday.setDate(monday.getDate() - offset);
      return {
        from: isoLocal(startOfLocalDay(monday)),
        to: isoLocal(startOfLocalDay(now)),
      };
    }
    case "thisMonth": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        from: isoLocal(start),
        to: isoLocal(startOfLocalDay(now)),
      };
    }
    case "lastMonth": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        from: isoLocal(startOfLocalDay(first)),
        to: isoLocal(startOfLocalDay(last)),
      };
    }
    default:
      return null;
  }
}
