export type DealStatusCode = "OPEN" | "WON" | "LOST" | "ARCHIVED";

export type DataMeasure =
  | "QUANTITY"
  | "MONEY"
  | "CUSTOM_NUMBER"
  | "AVG_CYCLE_DAYS";
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
  field: "status" | "tags" | "createdAt" | "updatedAt" | "customField";
  op?: "IS" | "OR";
  statusCodes?: DealStatusCode[];
  /** Etapas do funil do cartão; combinado com `statusCodes` (AND na query). */
  stageIds?: string[];
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

/** Visualização da série no cartão BAR (mesmos dados). */
export type BarSeriesDisplay = "BAR" | "LINE";

/**
 * Opções de apresentação e eixos específicas do cartão BAR (gráfico de barras).
 * Não se aplica a METRIC / PIE / DONUT.
 */
export type BarChartConfig = {
  showAverageLine?: boolean;
  showLegend?: boolean;
  timePreset?: BarTimePreset;
  xGroupBy?: BarXGroupBy;
  /** Barras (padrão) ou linha. */
  seriesDisplay?: BarSeriesDisplay;
};

export type DonutChartConfig = {
  /** `semicircle` = gauge (meia rosca). */
  variant?: "full" | "semicircle";
};

export type FunnelLayerStageIds = {
  lead: string[];
  qualified: string[];
  proposal: string[];
  sale: string[];
};

/**
 * Sugestão inicial: reparte etapas do pipeline nas 4 camadas; etapa ganha → "Venda".
 */
export function defaultFunnelLayerStageIdsFromStages(
  stageIdsInOrder: string[],
  wonStageId: string | null | undefined,
): FunnelLayerStageIds {
  if (stageIdsInOrder.length === 0) {
    return { lead: [], qualified: [], proposal: [], sale: [] };
  }
  const won =
    wonStageId && stageIdsInOrder.includes(wonStageId) ? wonStageId : null;
  const sale: string[] = won ? [won] : [];
  const rest = won
    ? stageIdsInOrder.filter((id) => id !== won)
    : [...stageIdsInOrder];
  if (rest.length === 0) {
    return { lead: [], qualified: [], proposal: [], sale };
  }
  const n = rest.length;
  const a = Math.max(1, Math.ceil(n / 3));
  const b = Math.max(1, Math.ceil((n - a) / 2));
  return {
    lead: rest.slice(0, a),
    qualified: rest.slice(a, a + b),
    proposal: rest.slice(a + b),
    sale,
  };
}

export type WidgetQuerySpec = {
  source: "DEALS";
  pipelineId: string;
  dimension?:
    | "BY_STAGE"
    | "BY_STATUS"
    | "BY_DAY"
    | "BY_ASSIGNEE"
    | "BY_CUSTOM_VALUE"
    | "BY_GOAL_PROGRESS"
    | "BY_PRODUCT_SOLD"
    | "BY_ASSIGNEE_RANKED_SALES"
    | "BY_FUNNEL_LAYERS"
    | null;
  /** Com BY_FUNNEL_LAYERS: etapas do pipeline por camada (Lead → Qualificado → Proposta → Venda). */
  funnelLayerStageIds?: FunnelLayerStageIds;
  /** Eixo X por valor de campo (não-Data) em customData. */
  groupByCustomFieldKey?: string;
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
   * Com BY_DAY + timelineStart: fim fixo da série (YYYY-MM-DD), inclusive.
   * Usado para intervalo personalizado no eixo (alinhado à API).
   */
  timelineEnd?: string;
  /**
   * BY_DAY: agrupar por este campo Data do deal (customData). Vazio = data de criação do deal.
   */
  timelineBucketFieldKey?: string;
  /**
   * BY_DAY sem campo custom de data: qual data do deal define o bucket.
   * `UPDATED_AT` aproxima o dia do fechamento (WON).
   */
  byDayAnchor?: "CREATED_AT" | "UPDATED_AT";
  /** BY_GOAL_PROGRESS: meta em R$ (atingimento). */
  gaugeTargetMoney?: number;
  /** BY_PRODUCT_SOLD / BY_ASSIGNEE_RANKED_SALES: linhas no ranking. */
  rankingLimit?: number;
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
  filterUpdatedFrom?: string;
  filterUpdatedTo?: string;
  filterCustomFields?: { key: string; value: string | number | boolean }[];
};

export type WidgetType = "METRIC" | "BAR" | "PIE" | "DONUT" | "RANKING" | "FUNNEL";

export type LayoutWidget = {
  id: string;
  type: WidgetType;
  title?: string;
  grid: { x: number; y: number; w: number; h: number };
  querySpec: WidgetQuerySpec;
  /** Só tipo BAR — configuração de tela e eixos conforme UX do gráfico de barras. */
  barChart?: BarChartConfig;
  /** Só tipo DONUT/PIE — variante visual (ex.: gauge). */
  donutChart?: DonutChartConfig;
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

/** Alinhado ao Prisma `StageLifecycle` (agrupamento visual nos filtros). */
export type StageLifecycleCode =
  | "NOT_STARTED"
  | "ACTIVE"
  | "DONE"
  | "CLOSED";

export type PipelineStageColor = {
  id: string;
  name: string;
  color: string | null;
  lifecycle?: StageLifecycleCode;
};

export type PipelineListItem = {
  id: string;
  name: string;
  isDefault: boolean;
  /** Cor do funil (#RRGGBB); usada nos gráficos quando não há etapa ganha. */
  color?: string | null;
  wonStageId?: string | null;
  lostStageId?: string | null;
  stages?: PipelineStageColor[];
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

export type WidgetDataRanking = {
  kind: "ranking";
  variant: "product" | "assignee";
  rows: {
    rank: number;
    name: string;
    primaryValue: number;
    secondaryValue: number;
  }[];
};

export type WidgetDataFunnel = {
  kind: "funnel";
  layers: {
    key: "lead" | "qualified" | "proposal" | "sale";
    label: string;
    value: number;
    conversionFromPreviousPct: number | null;
  }[];
};

export type WidgetDataResult =
  | WidgetDataScalar
  | WidgetDataSeries
  | WidgetDataRanking
  | WidgetDataFunnel;

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
    seriesDisplay: "BAR",
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
  if (widgetType === "RANKING") {
    return {
      source: "DEALS",
      pipelineId,
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      filterGroups: [
        {
          rows: [
            { field: "status", op: "IS", statusCodes: ["WON"] },
          ],
        },
      ],
      dimension: "BY_PRODUCT_SOLD",
      rankingLimit: 10,
    };
  }
  if (widgetType === "FUNNEL") {
    return {
      source: "DEALS",
      pipelineId,
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      dimension: "BY_FUNNEL_LAYERS",
      funnelLayerStageIds: {
        lead: [],
        qualified: [],
        proposal: [],
        sale: [],
      },
      filterGroups: [
        {
          rows: [
            { field: "status", op: "IS", statusCodes: ["OPEN", "WON"] },
          ],
        },
      ],
    };
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

/** Nome canónico do painel seed de vendas (alinhado a `DEFAULT_SALES_BOARD_NAME` na API). */
export const DEFAULT_SALES_DASHBOARD_BOARD_NAME = "Vendas — Visão geral";

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

  if (dm === "AVG_CYCLE_DAYS") {
    const n = Math.round(value * 10) / 10;
    return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
  }
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
