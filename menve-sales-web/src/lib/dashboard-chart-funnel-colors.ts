import { CHART_BAR_SEQUENCE } from "@/lib/chart-colors";
import type { PipelineListItem } from "@/lib/dashboard-builder-types";

function normalizeHex(c: string | null | undefined): string | null {
  if (!c || typeof c !== "string") return null;
  const t = c.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(t)) return null;
  return t;
}

function pipelineById(
  pipelines: PipelineListItem[],
  pipelineId: string,
): PipelineListItem | undefined {
  return pipelines.find((p) => p.id === pipelineId);
}

/** Cor da etapa “ganha” do funil (ou cor do pipeline), para série única temporal / meta. */
export function dashboardWonAccentFill(
  pipelines: PipelineListItem[],
  pipelineId: string,
): string {
  const pl = pipelineById(pipelines, pipelineId);
  const stages = pl?.stages ?? [];
  const byId = new Map(stages.map((s) => [s.id, s.color]));
  if (pl?.wonStageId) {
    const hex = normalizeHex(byId.get(pl.wonStageId) ?? null);
    if (hex) return hex;
  }
  const fromPipeline = normalizeHex(pl?.color ?? null);
  if (fromPipeline) return fromPipeline;
  return CHART_BAR_SEQUENCE[0];
}

const STATUS_LABEL_GANHO = "Ganho";

/**
 * Cor de cada fatia/barra: etapas do funil quando a dimensão é por etapa;
 * etapas ganho/perdido quando é por status; cor “ganha” em série temporal;
 * paleta padrão nos demais casos.
 */
export function dashboardChartSegmentFill(args: {
  pipelines: PipelineListItem[];
  pipelineId: string;
  dimension: string | null | undefined;
  segmentLabel: string;
  seriesIndex: number;
}): string {
  const { pipelines, pipelineId, dimension, segmentLabel, seriesIndex } =
    args;
  const fallback =
    CHART_BAR_SEQUENCE[seriesIndex % CHART_BAR_SEQUENCE.length]!;
  const pl = pipelineById(pipelines, pipelineId);
  const stages = pl?.stages ?? [];
  const byName = new Map(stages.map((s) => [s.name, s.color]));
  const byId = new Map(stages.map((s) => [s.id, s.color]));

  if (dimension === "BY_STAGE") {
    return normalizeHex(byName.get(segmentLabel) ?? null) ?? fallback;
  }

  if (dimension === "BY_STATUS") {
    if (segmentLabel === STATUS_LABEL_GANHO) {
      if (pl?.wonStageId) {
        const hex = normalizeHex(byId.get(pl.wonStageId) ?? null);
        if (hex) return hex;
      }
      return normalizeHex(pl?.color ?? null) ?? fallback;
    }
    if (segmentLabel === "Perdido") {
      if (pl?.lostStageId) {
        const hex = normalizeHex(byId.get(pl.lostStageId) ?? null);
        if (hex) return hex;
      }
      return fallback;
    }
    if (segmentLabel === "Aberto") {
      return normalizeHex(pl?.color ?? null) ?? fallback;
    }
    return fallback;
  }

  if (dimension === "BY_DAY") {
    return dashboardWonAccentFill(pipelines, pipelineId);
  }

  if (dimension === "BY_GOAL_PROGRESS") {
    if (segmentLabel === "Realizado") {
      return dashboardWonAccentFill(pipelines, pipelineId);
    }
    if (segmentLabel === "Restante") {
      return "var(--muted)";
    }
    return fallback;
  }

  return fallback;
}
