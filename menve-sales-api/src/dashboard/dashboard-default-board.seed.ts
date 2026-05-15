import { firstOfMonthYmd, todayYmdBrazil } from "../common/calendar-brazil.util";
import type { LayoutJson } from "./dashboard-layout.zod";

/** Meta padrão (R$) para cartão de atingimento — ajustável no cartão depois. */
export const DEFAULT_SALES_GOAL_MONEY = 100_000;

function monthTitlePtBr(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m) return ymd;
  const day = d && d >= 1 && d <= 28 ? d : 15;
  const d0 = new Date(Date.UTC(y, m - 1, day));
  const raw = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(d0);
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Layout pronto do painel "Vendas — Visão geral".
 * KPIs do mês por data de atualização (fechamento aproximado em WON),
 * barras de receita ganha no mês civil, gauge de meta.
 *
 * Grid de 12 colunas; linha de KPI h=3; gráficos h=6; rankings h=6.
 */
export function buildDefaultSalesBoardLayout(pipelineId: string): LayoutJson {
  const todayBr = todayYmdBrazil();
  const monthStart = firstOfMonthYmd(todayBr);
  const monthTitle = monthTitlePtBr(monthStart);

  const filterWonUpdatedThisMonth = {
    filterGroups: [
      {
        rows: [
          { field: "status" as const, op: "IS" as const, statusCodes: ["WON" as const] },
          {
            rowJoin: "AND" as const,
            field: "updatedAt" as const,
            op: "IS" as const,
            createdFrom: monthStart,
            createdTo: todayBr,
          },
        ],
      },
    ],
  };

  let yCursor = 0;

  function kpiRow(
    items: { id: string; title: string; spec: Record<string, unknown> }[],
  ) {
    const out: LayoutJson["widgets"] = items.map((it, i) => ({
      id: it.id,
      type: "METRIC" as const,
      title: it.title,
      grid: { x: i * 3, y: yCursor, w: 3, h: 3 },
      querySpec: {
        source: "DEALS" as const,
        pipelineId,
        dimension: null,
        ...it.spec,
      } as LayoutJson["widgets"][number]["querySpec"],
    }));
    yCursor += 3;
    return out;
  }

  const widgets: LayoutJson["widgets"] = [];

  widgets.push(
    ...kpiRow([
      {
        id: "seed_kpi_sales_value_month",
        title: "Valor de vendas (no mês)",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "SUM",
          ...filterWonUpdatedThisMonth,
        },
      },
      {
        id: "seed_kpi_sales_count_month",
        title: "Número de vendas (no mês)",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...filterWonUpdatedThisMonth,
        },
      },
      {
        id: "seed_kpi_ticket_avg_month",
        title: "Ticket médio (no mês)",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "AVG",
          ...filterWonUpdatedThisMonth,
        },
      },
      {
        id: "seed_kpi_sales_cycle_month",
        title: "Ciclo de vendas (média, dias)",
        spec: {
          dataMeasure: "AVG_CYCLE_DAYS",
          ...filterWonUpdatedThisMonth,
        },
      },
    ]),
  );

  widgets.push({
    id: "seed_bar_revenue_won_month",
    type: "BAR",
    title: `Receita ganha por dia — ${monthTitle}`,
    grid: { x: 0, y: yCursor, w: 8, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_DAY",
      timelineStart: monthStart,
      fillTimelineMonth: true,
      byDayAnchor: "UPDATED_AT",
      dataMeasure: "MONEY",
      aggregation: "SUM",
          ...filterWonUpdatedThisMonth,
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
    id: "seed_donut_goal_month",
    type: "DONUT",
    title: `Atingimento da meta — ${monthTitle}`,
    grid: { x: 8, y: yCursor, w: 4, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_GOAL_PROGRESS",
      dataMeasure: "MONEY",
      aggregation: "SUM",
      gaugeTargetMoney: DEFAULT_SALES_GOAL_MONEY,
      ...filterWonUpdatedThisMonth,
    },
    donutChart: { variant: "semicircle" },
  });
  yCursor += 6;

  widgets.push({
    id: "seed_rank_products_month",
    type: "RANKING",
    title: "Produtos mais vendidos",
    grid: { x: 0, y: yCursor, w: 6, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_PRODUCT_SOLD",
      rankingLimit: 10,
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      ...filterWonUpdatedThisMonth,
    },
  });

  widgets.push({
    id: "seed_rank_assignees_month",
    type: "RANKING",
    title: "Ranking de vendas por responsável",
    grid: { x: 6, y: yCursor, w: 6, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_ASSIGNEE_RANKED_SALES",
      rankingLimit: 10,
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      ...filterWonUpdatedThisMonth,
    },
  });
  yCursor += 6;

  return { schemaVersion: 1, widgets };
}

export const DEFAULT_SALES_BOARD_NAME = "Vendas — Visão geral";
