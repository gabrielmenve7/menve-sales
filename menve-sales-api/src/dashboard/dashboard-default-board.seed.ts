import type { LayoutJson } from "./dashboard-layout.zod";

/** Meta padrão (R$) para cartão de atingimento — ajustável no cartão depois. */
export const DEFAULT_SALES_GOAL_MONEY = 100_000;

const filterStatus = (codes: ("WON" | "OPEN" | "LOST")[]) => ({
  filterGroups: [
    {
      rows: [
        {
          field: "status" as const,
          op: "IS" as const,
          statusCodes: codes,
        },
      ],
    },
  ],
});

/**
 * Layout pronto do painel "Vendas — Visão geral" (referência visual Menve).
 * Período é só do filtro global — títulos sem mês/semana/dia.
 *
 * Grid 12 colunas: 7 KPIs na 1ª linha (larguras 2+2+2+2+2+1+1);
 * 2ª linha: barras (6) | produtos (3) | coluna meta + ranking (3).
 */
export function buildDefaultSalesBoardLayout(pipelineId: string): LayoutJson {
  const won = filterStatus(["WON"]);
  const open = filterStatus(["OPEN"]);
  const lost = filterStatus(["LOST"]);

  const widgets: LayoutJson["widgets"] = [];

  const kpiDefs: { id: string; title: string; spec: Record<string, unknown> }[] =
    [
      {
        id: "seed_kpi_sales_value",
        title: "Valor de vendas",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "SUM",
          ...won,
        },
      },
      {
        id: "seed_kpi_sales_count",
        title: "Número de vendas",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...won,
        },
      },
      {
        id: "seed_kpi_ticket_avg",
        title: "Ticket médio",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "AVG",
          ...won,
        },
      },
      {
        id: "seed_kpi_sales_cycle",
        title: "Ciclo de vendas",
        spec: {
          dataMeasure: "AVG_CYCLE_DAYS",
          ...won,
        },
      },
      {
        id: "seed_kpi_in_negotiation",
        title: "Em negociação",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "SUM",
          ...open,
        },
      },
      {
        id: "seed_kpi_open_count",
        title: "Em aberto",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...open,
        },
      },
      {
        id: "seed_kpi_lost_count",
        title: "Oportunidades perdidas",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...lost,
        },
      },
    ];

  const kpiWidths = [2, 2, 2, 2, 2, 1, 1] as const;
  let xKpi = 0;
  for (let i = 0; i < kpiDefs.length; i++) {
    const it = kpiDefs[i]!;
    const w = kpiWidths[i]!;
    widgets.push({
      id: it.id,
      type: "METRIC",
      title: it.title,
      grid: { x: xKpi, y: 0, w, h: 4 },
      querySpec: {
        source: "DEALS" as const,
        pipelineId,
        dimension: null,
        ...it.spec,
      } as LayoutJson["widgets"][number]["querySpec"],
    });
    xKpi += w;
  }

  const yCharts = 4;

  widgets.push({
    id: "seed_bar_revenue_won",
    type: "BAR",
    title: "Receita ganha por dia",
    grid: { x: 0, y: yCharts, w: 5, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_DAY",
      byDayAnchor: "UPDATED_AT",
      dataMeasure: "MONEY",
      aggregation: "SUM",
      ...won,
    },
    barChart: {
      showAverageLine: false,
      showLegend: false,
      timePreset: "THIS_MONTH",
      xGroupBy: "DAY",
      seriesDisplay: "BAR",
    },
  });

  widgets.push({
    id: "seed_rank_products",
    type: "RANKING",
    title: "Produtos mais vendidos",
    grid: { x: 5, y: yCharts, w: 4, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_PRODUCT_SOLD",
      rankingLimit: 10,
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      ...won,
    },
  });

  widgets.push({
    id: "seed_donut_goal",
    type: "DONUT",
    title: "Atingimento da meta",
    grid: { x: 9, y: yCharts, w: 3, h: 3 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_GOAL_PROGRESS",
      dataMeasure: "MONEY",
      aggregation: "SUM",
      gaugeTargetMoney: DEFAULT_SALES_GOAL_MONEY,
      ...won,
    },
    donutChart: { variant: "semicircle" },
  });

  widgets.push({
    id: "seed_rank_assignees",
    type: "RANKING",
    title: "Ranking de vendas por responsável",
    grid: { x: 9, y: yCharts + 3, w: 3, h: 3 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_ASSIGNEE_RANKED_SALES",
      rankingLimit: 10,
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      ...won,
    },
  });

  return { schemaVersion: 1, widgets };
}

export const DEFAULT_SALES_BOARD_NAME = "Vendas — Visão geral";
