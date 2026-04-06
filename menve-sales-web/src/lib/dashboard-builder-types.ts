export type WidgetQuerySpec = {
  source: "DEALS";
  measure: "COUNT" | "SUM_VALUE";
  dimension?: "BY_STAGE" | "BY_STATUS" | "BY_DAY" | null;
  pipelineId: string;
  includeClosed?: boolean;
  includeArchived?: boolean;
  days?: number;
};

export type WidgetType = "METRIC" | "BAR" | "PIE" | "DONUT";

export type LayoutWidget = {
  id: string;
  type: WidgetType;
  title?: string;
  grid: { x: number; y: number; w: number; h: number };
  querySpec: WidgetQuerySpec;
};

export type LayoutJson = {
  schemaVersion: 1;
  widgets: LayoutWidget[];
};

export type DashboardBoardDto = {
  id: string;
  name: string;
  layoutJson: unknown;
  createdAt: string;
  updatedAt: string;
};

export type PipelineListItem = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type WidgetDataScalar = { kind: "scalar"; value: number };
export type WidgetDataSeries = {
  kind: "series";
  series: { label: string; value: number }[];
};

export type WidgetDataResult = WidgetDataScalar | WidgetDataSeries;

export function parseLayoutJson(raw: unknown): LayoutJson {
  if (
    typeof raw === "object" &&
    raw !== null &&
    (raw as LayoutJson).schemaVersion === 1 &&
    Array.isArray((raw as LayoutJson).widgets)
  ) {
    return raw as LayoutJson;
  }
  return { schemaVersion: 1, widgets: [] };
}

export function defaultQuerySpec(
  pipelineId: string,
  widgetType: WidgetType,
): WidgetQuerySpec {
  const base: WidgetQuerySpec = {
    source: "DEALS",
    measure: "COUNT",
    pipelineId,
    includeClosed: false,
    includeArchived: false,
  };
  if (widgetType === "METRIC") {
    return { ...base, dimension: null };
  }
  if (widgetType === "BAR") {
    return { ...base, dimension: "BY_STAGE" };
  }
  if (widgetType === "PIE" || widgetType === "DONUT") {
    return { ...base, dimension: "BY_STATUS" };
  }
  return base;
}

export function newWidgetId() {
  return `w_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
}
