export type DealStatusCode = "OPEN" | "WON" | "LOST" | "ARCHIVED";

export type DataMeasure = "QUANTITY" | "MONEY" | "CUSTOM_NUMBER";
export type Aggregation = "SUM" | "AVG";

/**
 * Presets relativos para filtro DATE no cartão (igual pipeline).
 * Manter em sincronia com `menve-sales-api/.../dashboard-custom-date-preset.util.ts`.
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

/** Uma linha de filtro persistida (sem ids de UI). */
export type WidgetFilterRowSaved = {
  /** Liga esta linha à anterior dentro do mesmo grupo (filtro duplo). */
  rowJoin?: "AND" | "OR";
  field: "status" | "tags" | "createdAt" | "customField";
  op?: "IS" | "OR";
  statusCodes?: DealStatusCode[];
  tagIds?: string[];
  filterTagMatch?: "ALL" | "ANY";
  createdFrom?: string;
  createdTo?: string;
  customKey?: string;
  customValue?: string | number | boolean;
  /** Filtro por intervalo em campo DATE (customData como string YYYY-MM-DD). */
  customDateFrom?: string;
  customDateTo?: string;
  /** Período relativo (Hoje, Este mês, …) para campo DATE. */
  customDatePreset?: WidgetFilterRollingDatePreset;
};

/** Grupo de filtros; `groupJoin` liga este grupo ao anterior (filtro agrupado). */
export type WidgetFilterGroupSaved = {
  groupJoin?: "AND" | "OR";
  rows: WidgetFilterRowSaved[];
};

/** Presets de período (eixo temporal) — só aplicam com dimensão BY_DAY. */
export type BarTimePreset =
  | "THIS_MONTH"
  | "NEXT_MONTH"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS"
  | "CUSTOM";

/** Granularidade exibida no eixo X quando a série é por dia (API retorna dias; agregação no cliente). */
export type BarXGroupBy = "DAY" | "WEEK" | "MONTH";

/**
 * Opções de apresentação e eixos específicas do cartão BAR (gráfico de barras).
 * Não se aplica a METRIC / PIE / DONUT.
 */
export type BarChartConfig = {
  showAverageLine?: boolean;
  showLegend?: boolean;
  timePreset?: BarTimePreset;
  xGroupBy?: BarXGroupBy;
  /** Reservado (ex.: barras empilhadas); hoje só "NONE". */
  yGroupBy?: "NONE";
};

export type WidgetQuerySpec = {
  source: "DEALS";
  pipelineId: string;
  dimension?: "BY_STAGE" | "BY_STATUS" | "BY_DAY" | null;
  days?: number;
  /**
   * Início fixo da linha do tempo (YYYY-MM-DD), inclusive.
   * Quando definido com BY_DAY, a API gera um ponto por dia até hoje (ignora janela rolante `days`).
   */
  timelineStart?: string;
  /**
   * Com BY_DAY + timelineStart (este/próximo mês): incluir todos os dias do mês no eixo;
   * dias sem dados ficam 0. Se false, a série vai só até hoje.
   */
  fillTimelineMonth?: boolean;
  /**
   * BY_DAY: agrupar por este campo Data do deal (customData). Vazio = data de criação do deal.
   */
  timelineBucketFieldKey?: string;
  /** Legado — ainda aceito pela API */
  measure?: "COUNT" | "SUM_VALUE";
  includeClosed?: boolean;
  includeArchived?: boolean;
  dataMeasure?: DataMeasure;
  aggregation?: Aggregation;
  customFieldKey?: string;
  /**
   * Filtros estruturados (grupos + linhas com E/Ou).
   * Se presente e não vazio, a API ignora os campos planos abaixo.
   */
  filterGroups?: WidgetFilterGroupSaved[];
  filterStatuses?: DealStatusCode[];
  /** ALL = todas as tags (é); ANY = qualquer uma (ou). */
  filterTagMatch?: "ALL" | "ANY";
  filterTagIds?: string[];
  filterCreatedFrom?: string;
  filterCreatedTo?: string;
  filterCustomFields?: { key: string; value: string | number | boolean }[];
};

export type WidgetType = "METRIC" | "BAR" | "PIE" | "DONUT";

export type LayoutWidget = {
  id: string;
  type: WidgetType;
  title?: string;
  grid: { x: number; y: number; w: number; h: number };
  querySpec: WidgetQuerySpec;
  /** Só tipo BAR — configuração de tela e eixos conforme UX do gráfico de barras. */
  barChart?: BarChartConfig;
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

export type TagListItem = { id: string; name: string };

export type DealCustomFieldDef = {
  id: string;
  key: string;
  name: string;
  fieldType: string;
  /** Lista de opções quando `fieldType` é SELECT (vem do JSON na API). */
  options?: unknown;
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

/** Padrão alinhado ao protótipo de configuração do gráfico de barras. */
export function defaultBarChartConfig(): BarChartConfig {
  return {
    showAverageLine: true,
    showLegend: false,
    timePreset: "LAST_30_DAYS",
    xGroupBy: "DAY",
    yGroupBy: "NONE",
  };
}

export function defaultQuerySpec(
  pipelineId: string,
  widgetType: WidgetType,
): WidgetQuerySpec {
  const base: WidgetQuerySpec = {
    source: "DEALS",
    pipelineId,
    dataMeasure: "QUANTITY",
    aggregation: "SUM",
    filterStatuses: ["OPEN"],
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

/** Spec + barChart para novo cartão BAR. */
export function defaultBarWidgetQueryAndChart(
  pipelineId: string,
): { querySpec: WidgetQuerySpec; barChart: BarChartConfig } {
  return {
    querySpec: { ...defaultQuerySpec(pipelineId, "BAR"), days: 30 },
    barChart: defaultBarChartConfig(),
  };
}

export function newWidgetId() {
  return `w_${Math.random().toString(36).slice(2, 12)}_${Date.now().toString(36)}`;
}

/** Formata valor do cartão métrica conforme medida / campo custom. */
export function formatDashboardScalar(
  spec: WidgetQuerySpec,
  value: number,
  customFieldMeta?: DealCustomFieldDef | null,
): string {
  const dm =
    spec.dataMeasure ??
    (spec.measure === "SUM_VALUE"
      ? "MONEY"
      : spec.measure === "COUNT"
        ? "QUANTITY"
        : "QUANTITY");

  if (dm === "MONEY") {
    return value.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    });
  }
  if (dm === "CUSTOM_NUMBER") {
    if (customFieldMeta?.fieldType === "MONEY_BRL") {
      return value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      });
    }
    return value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return Math.round(value).toLocaleString("pt-BR");
}

export function customFieldByKey(
  defs: DealCustomFieldDef[],
): Map<string, DealCustomFieldDef> {
  return new Map(defs.map((d) => [d.key, d]));
}
