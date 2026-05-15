import type {
  LayoutWidget,
  WidgetDataResult,
  WidgetQuerySpec,
} from "@/lib/dashboard-builder-types";

export type MetricComparisonSemantic = "higher_is_better" | "lower_is_better";

export type MetricComparisonDisplay = {
  /** Valor absoluto da variação % (sempre ≥ 0 no texto; a seta indica subida/descida). */
  pctPoints: number;
  direction: "up" | "down" | "flat";
  sentiment: "positive" | "negative" | "neutral";
};

function statusCodesInSpec(spec: WidgetQuerySpec): Set<string> {
  const out = new Set<string>();
  for (const g of spec.filterGroups ?? []) {
    for (const r of g.rows) {
      if (r.field === "status" && r.statusCodes) {
        for (const c of r.statusCodes) out.add(c);
      }
    }
  }
  return out;
}

/** Define se “maior” ou “menor” que o período anterior é melhor para o KPI. */
export function metricComparisonSemanticForSpec(
  spec: WidgetQuerySpec,
): MetricComparisonSemantic {
  if (spec.dataMeasure === "AVG_CYCLE_DAYS") return "lower_is_better";
  const st = statusCodesInSpec(spec);
  if (st.has("LOST")) return "lower_is_better";
  return "higher_is_better";
}

const EPS = 1e-6;

export function buildMetricComparisonDisplay(
  semantic: MetricComparisonSemantic,
  current: number,
  previous: number,
): MetricComparisonDisplay | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;

  const up = current > previous + EPS;
  const down = current < previous - EPS;
  const flat = !up && !down;

  if (Math.abs(previous) < EPS) {
    if (Math.abs(current) < EPS) {
      return { pctPoints: 0, direction: "flat", sentiment: "neutral" };
    }
    return null;
  }

  const pctRaw = ((current - previous) / Math.abs(previous)) * 100;
  const pctPoints = Math.min(999, Math.max(0, Math.abs(pctRaw)));

  const direction: MetricComparisonDisplay["direction"] = flat
    ? "flat"
    : up
      ? "up"
      : "down";

  let sentiment: MetricComparisonDisplay["sentiment"] = "neutral";
  if (!flat) {
    const higher = semantic === "higher_is_better";
    if (higher) sentiment = up ? "positive" : "negative";
    else sentiment = down ? "positive" : "negative";
  }

  return { pctPoints, direction, sentiment };
}

export function buildMetricComparisonByWidgetId(
  widgets: LayoutWidget[],
  currentRows: WidgetDataResult[],
  prevRows: WidgetDataResult[],
): Record<string, MetricComparisonDisplay | null> {
  const out: Record<string, MetricComparisonDisplay | null> = {};
  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i]!;
    if (w.type !== "METRIC") continue;
    const c = currentRows[i];
    const p = prevRows[i];
    if (!c || c.kind !== "scalar" || !p || p.kind !== "scalar") {
      out[w.id] = null;
      continue;
    }
    const sem = metricComparisonSemanticForSpec(w.querySpec);
    out[w.id] = buildMetricComparisonDisplay(sem, c.value, p.value);
  }
  return out;
}
