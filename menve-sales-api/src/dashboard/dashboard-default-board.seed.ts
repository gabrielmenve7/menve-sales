import { firstOfMonthYmd, todayYmdBrazil } from "../common/calendar-brazil.util";
import type { LayoutJson } from "./dashboard-layout.zod";

/**
 * Layout pronto do painel "Vendas — Visão geral".
 * Usa apenas dimensões e filtros já suportados pelo motor de query.
 *
 * Grid de 12 colunas; uma "linha de KPI" tem h=3 e cada cartão w=3.
 * Gráficos têm h=6 (≈ 264px de altura com rowHeight=44).
 */
export function buildDefaultSalesBoardLayout(pipelineId: string): LayoutJson {
  const todayBr = todayYmdBrazil();
  const monthStart = firstOfMonthYmd(todayBr);

  const baseFiltersOpen = {
    filterStatuses: ["OPEN" as const],
  };
  /** Deals criados no mês civil (BR), qualquer status — só filtro de data. */
  const baseFiltersCreatedThisMonth = {
    filterGroups: [
      {
        rows: [
          {
            field: "createdAt" as const,
            op: "IS" as const,
            createdFrom: monthStart,
            createdTo: todayBr,
          },
        ],
      },
    ],
  };
  const baseFiltersWonThisMonth = {
    filterStatuses: ["WON" as const],
    filterGroups: [
      {
        rows: [
          { field: "status" as const, op: "IS" as const, statusCodes: ["WON" as const] },
          {
            rowJoin: "AND" as const,
            field: "createdAt" as const,
            op: "IS" as const,
            createdFrom: monthStart,
            createdTo: todayBr,
          },
        ],
      },
    ],
  };
  const baseFiltersLostThisMonth = {
    filterStatuses: ["LOST" as const],
    filterGroups: [
      {
        rows: [
          { field: "status" as const, op: "IS" as const, statusCodes: ["LOST" as const] },
          {
            rowJoin: "AND" as const,
            field: "createdAt" as const,
            op: "IS" as const,
            createdFrom: monthStart,
            createdTo: todayBr,
          },
        ],
      },
    ],
  };
  const baseFiltersWonAll = {
    filterStatuses: ["WON" as const],
  };

  let yCursor = 0;

  /** Linha de 4 KPIs (h=3, w=3 cada). */
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
        id: "seed_kpi_in_neg",
        title: "Em negociação",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "SUM",
          ...baseFiltersOpen,
        },
      },
      {
        id: "seed_kpi_won_money_month",
        title: "Vendido no mês",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "SUM",
          ...baseFiltersWonThisMonth,
        },
      },
      {
        id: "seed_kpi_won_qty_month",
        title: "Ganhos no mês",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...baseFiltersWonThisMonth,
        },
      },
      {
        id: "seed_kpi_new_deals_month",
        title: "Novos no mês",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...baseFiltersCreatedThisMonth,
        },
      },
    ]),
  );

  widgets.push(
    ...kpiRow([
      {
        id: "seed_kpi_open_count",
        title: "Deals abertos",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...baseFiltersOpen,
        },
      },
      {
        id: "seed_kpi_lost_month",
        title: "Perdidos no mês",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...baseFiltersLostThisMonth,
        },
      },
      {
        id: "seed_kpi_won_total_all",
        title: "Total vendido (geral)",
        spec: {
          dataMeasure: "MONEY",
          aggregation: "SUM",
          ...baseFiltersWonAll,
        },
      },
      {
        id: "seed_kpi_won_qty_all",
        title: "Deals ganhos (total)",
        spec: {
          dataMeasure: "QUANTITY",
          aggregation: "SUM",
          ...baseFiltersWonAll,
        },
      },
    ]),
  );

  widgets.push({
    id: "seed_bar_daily_created",
    type: "BAR",
    title: "Volume diário — últimos 30 dias",
    grid: { x: 0, y: yCursor, w: 8, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_DAY",
      days: 30,
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      filterStatuses: ["OPEN", "WON", "LOST"],
    },
    barChart: {
      showAverageLine: true,
      showLegend: false,
      timePreset: "LAST_30_DAYS",
      xGroupBy: "DAY",
      seriesDisplay: "LINE",
    },
  });

  widgets.push({
    id: "seed_pie_status",
    type: "DONUT",
    title: "Distribuição por status",
    grid: { x: 8, y: yCursor, w: 4, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_STATUS",
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      filterStatuses: ["OPEN", "WON", "LOST"],
    },
  });
  yCursor += 6;

  widgets.push({
    id: "seed_bar_stage_funnel",
    type: "BAR",
    title: "Funil — deals abertos por etapa",
    grid: { x: 0, y: yCursor, w: 6, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_STAGE",
      dataMeasure: "QUANTITY",
      aggregation: "SUM",
      ...baseFiltersOpen,
    },
    barChart: {
      showAverageLine: false,
      showLegend: false,
      timePreset: "LAST_30_DAYS",
      xGroupBy: "DAY",
      seriesDisplay: "BAR",
    },
  });

  widgets.push({
    id: "seed_bar_top_products",
    type: "BAR",
    title: "Produtos mais vendidos (R$)",
    grid: { x: 6, y: yCursor, w: 6, h: 6 },
    querySpec: {
      source: "DEALS",
      pipelineId,
      dimension: "BY_PRODUCT",
      dataMeasure: "MONEY",
      aggregation: "SUM",
      ...baseFiltersWonAll,
    },
    barChart: {
      showAverageLine: false,
      showLegend: false,
      timePreset: "LAST_30_DAYS",
      xGroupBy: "DAY",
      seriesDisplay: "BAR",
    },
  });
  yCursor += 6;

  return { schemaVersion: 1, widgets };
}

export const DEFAULT_SALES_BOARD_NAME = "Vendas — Visão geral";
