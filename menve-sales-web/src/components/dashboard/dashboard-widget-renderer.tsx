"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CalendarClock, DollarSign, Hash, Minus, Target } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  dashboardChartSegmentFill,
  dashboardWonAccentFill,
} from "@/lib/dashboard-chart-funnel-colors";
import { cn } from "@/lib/utils";
import type { MetricComparisonDisplay } from "@/lib/dashboard-metric-comparison";
import {
  customFieldByKey,
  defaultBarChartConfig,
  formatDashboardScalar,
  type BarChartConfig,
  type BarXGroupBy,
  type DealCustomFieldDef,
  type LayoutWidget,
  type PipelineListItem,
  type WidgetDataResult,
} from "@/lib/dashboard-builder-types";

function formatDayLabel(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatMonthYm(ym: string) {
  const [y, m] = ym.split("-");
  if (!y || !m) return ym;
  return `${m}/${y}`;
}

function mondayUtcKey(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00.000Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d.getTime());
  mon.setUTCDate(d.getUTCDate() + diff);
  return mon.toISOString().slice(0, 10);
}

/** Agrega pontos diários em semanas ou meses (só eixo temporal). */
/** Largura mínima aproximada (px) para cada rótulo legível no eixo X. */
const X_LABEL_MIN_PX = 34;

function computeBarTickStride(n: number, widthPx: number): number {
  if (n <= 1) return 1;
  const w = Math.max(widthPx, 100);
  const maxLabels = Math.max(2, Math.floor(w / X_LABEL_MIN_PX));
  return Math.max(1, Math.ceil(n / maxLabels));
}

function computeBarMaxSize(n: number, widthPx: number): number {
  if (n <= 0) return 20;
  const w = Math.max(widthPx, 80);
  const perCategory = w / n;
  return Math.max(3, Math.min(56, Math.floor(perCategory * 0.72)));
}

function metricIconForSpec(spec: LayoutWidget["querySpec"]) {
  const dm =
    spec.dataMeasure ??
    (spec.measure === "SUM_VALUE"
      ? "MONEY"
      : spec.measure === "COUNT"
        ? "QUANTITY"
        : "QUANTITY");
  if (dm === "AVG_CYCLE_DAYS") return CalendarClock;
  if (dm === "MONEY") return DollarSign;
  if (dm === "CUSTOM_NUMBER") return Hash;
  return Target;
}

/** Ícone do KPI: neutro, círculo suave (referência painel padrão). */
function metricIconSurfaceClass(): string {
  return "rounded-full bg-muted/60 text-muted-foreground dark:bg-muted/45";
}

function MetricDeltaBadge({
  comparison,
}: {
  comparison: MetricComparisonDisplay;
}) {
  const Arrow =
    comparison.direction === "up"
      ? ArrowUp
      : comparison.direction === "down"
        ? ArrowDown
        : Minus;
  const sentimentCls =
    comparison.sentiment === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : comparison.sentiment === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-foreground";
  const pctLabel = comparison.pctPoints.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums",
        sentimentCls,
      )}
      aria-label={`Variação em relação ao período anterior: ${pctLabel}%`}
    >
      <Arrow className="size-3.5 shrink-0" strokeWidth={2.5} />
      {pctLabel}%
    </span>
  );
}

const chartCardNeutralFrame =
  "rounded-[10px] border border-border/60 bg-card shadow-sm dark:bg-card";

function formatBrl0(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatQtyPt(n: number) {
  const r = Math.round(n * 100) / 100;
  return r.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function RankingTableCard({
  title,
  variant,
  rows,
}: {
  title: string;
  variant: "product" | "assignee";
  rows: {
    rank: number;
    name: string;
    primaryValue: number;
    secondaryValue: number;
  }[];
}) {
  const colPrimary =
    variant === "product" ? "Quantidade" : "Valor vendido";
  const colSecondary =
    variant === "product" ? "Valor (R$)" : "Pedidos";

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-[10px]",
        chartCardNeutralFrame,
      )}
    >
      <CardHeader className="drag-handle shrink-0 cursor-grab pb-1 pt-3">
        <CardTitle className="text-xs font-normal text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-auto px-2 pb-2 pt-0">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Sem dados no período
          </p>
        ) : (
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-b border-border/60 text-muted-foreground">
                <th className="w-8 py-1.5 pr-1 font-medium">#</th>
                <th className="py-1.5 pr-2 font-medium">
                  {variant === "product" ? "Produto" : "Responsável"}
                </th>
                <th className="w-[28%] py-1.5 pr-1 text-right font-medium tabular-nums">
                  {colPrimary}
                </th>
                <th className="w-[28%] py-1.5 text-right font-medium tabular-nums">
                  {colSecondary}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.rank}-${r.name}`}
                  className="border-b border-border/40 last:border-0"
                >
                  <td className="py-1.5 pr-1 tabular-nums text-muted-foreground">
                    {r.rank}
                  </td>
                  <td className="max-w-0 truncate py-1.5 pr-2 font-medium text-foreground">
                    {r.name}
                  </td>
                  <td className="py-1.5 pr-1 text-right tabular-nums text-foreground">
                    {variant === "product"
                      ? formatQtyPt(r.primaryValue)
                      : formatBrl0(r.primaryValue)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-foreground">
                    {variant === "product"
                      ? formatBrl0(r.secondaryValue)
                      : String(Math.round(r.secondaryValue))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function rollupBarSeries(
  series: { label: string; value: number }[],
  xGroupBy: BarXGroupBy | undefined,
  dimensionIsDay: boolean,
): { label: string; value: number }[] {
  if (!dimensionIsDay || !xGroupBy || xGroupBy === "DAY") {
    return series.map((s) => ({ label: s.label, value: s.value }));
  }
  if (xGroupBy === "WEEK") {
    const buckets = new Map<string, number>();
    for (const p of series) {
      const k = mondayUtcKey(p.label);
      buckets.set(k, (buckets.get(k) ?? 0) + p.value);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, value]) => ({ label: k, value }));
  }
  const buckets = new Map<string, number>();
  for (const p of series) {
    const k = p.label.slice(0, 7);
    buckets.set(k, (buckets.get(k) ?? 0) + p.value);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, value]) => ({ label: k, value }));
}

export function DashboardWidgetRenderer({
  widget,
  data,
  loading,
  error,
  dealCustomFields,
  pipelines,
  metricComparison,
}: {
  widget: LayoutWidget;
  data: WidgetDataResult | null;
  loading: boolean;
  error: string | null;
  dealCustomFields: DealCustomFieldDef[];
  pipelines: PipelineListItem[];
  /** Só cartões METRIC: comparação com o período anterior (global). */
  metricComparison?: MetricComparisonDisplay | null;
}) {
  const cfMap = useMemo(
    () => customFieldByKey(dealCustomFields),
    [dealCustomFields],
  );
  const title =
    widget.title ||
    (widget.type === "METRIC"
      ? "Cálculo"
      : widget.type === "BAR"
        ? "Gráfico de barras"
        : widget.type === "RANKING"
          ? "Ranking"
          : "Gráfico de pizza");

  if (loading) {
    if (widget.type === "METRIC") {
      const iconSurface = metricIconSurfaceClass();
      return (
        <Card
          className={cn(
            "flex h-full flex-col overflow-hidden rounded-[10px] border border-border/60 bg-card shadow-sm",
          )}
        >
          <CardHeader className="drag-handle cursor-grab space-y-0 px-4 pb-0 pt-4">
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-xs font-normal leading-snug text-muted-foreground">
                {title}
              </CardTitle>
              <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-4 pb-4 pt-2">
            <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
            <div className="mt-2 h-4 w-16 animate-pulse rounded bg-muted/80" />
          </CardContent>
        </Card>
      );
    }
    const chartFrame = chartCardNeutralFrame;
    return (
      <Card
        className={cn(
          "flex h-full flex-col overflow-hidden",
          chartFrame,
        )}
      >
        <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
          <CardTitle className="text-xs font-normal text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-4">
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="flex h-full flex-col overflow-hidden rounded-[10px] border border-destructive/30 bg-card shadow-sm">
        <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
          <CardTitle className="text-xs font-normal text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center px-3 pb-4 text-center text-xs text-destructive">
          {error}
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    const emptyFrame =
      widget.type === "BAR" ||
      widget.type === "PIE" ||
      widget.type === "DONUT" ||
      widget.type === "RANKING"
        ? chartCardNeutralFrame
        : "rounded-[10px] border border-border/60 bg-card shadow-sm";
    return (
      <Card
        className={cn(
          "flex h-full flex-col overflow-hidden bg-card/95",
          emptyFrame,
        )}
      >
        <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
          <CardTitle className="text-xs font-normal text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-4 text-xs text-muted-foreground">
          Sem dados
        </CardContent>
      </Card>
    );
  }

  if (widget.type === "RANKING" && data.kind === "ranking") {
    return (
      <RankingTableCard
        title={title}
        variant={data.variant}
        rows={data.rows}
      />
    );
  }

  if (widget.type === "METRIC" && data.kind === "scalar") {
    const Icon = metricIconForSpec(widget.querySpec);
    const iconSurface = metricIconSurfaceClass();
    const formatted = formatDashboardScalar(
      widget.querySpec,
      data.value,
      widget.querySpec.customFieldKey
        ? cfMap.get(widget.querySpec.customFieldKey) ?? null
        : null,
    );

    return (
      <Card
        className={cn(
          "flex h-full flex-col overflow-hidden rounded-[10px] border border-border/60 bg-card shadow-sm",
        )}
      >
        <CardHeader className="drag-handle cursor-grab space-y-0 px-4 pb-0 pt-4">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-xs font-normal leading-snug text-muted-foreground">
              {title}
            </CardTitle>
            <div
              className={cn(
                "flex size-8 shrink-0 items-center justify-center",
                iconSurface,
              )}
              aria-hidden
            >
              <Icon className="size-[15px] stroke-[1.6]" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-center px-4 pb-4 pt-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-[1.65rem] font-bold leading-tight tabular-nums tracking-tight text-foreground sm:text-[1.8rem]">
              {formatted}
            </p>
            {metricComparison ? (
              <MetricDeltaBadge comparison={metricComparison} />
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (
    (widget.type === "BAR" ||
      widget.type === "PIE" ||
      widget.type === "DONUT") &&
    data.kind === "series"
  ) {
    const dimensionIsDay = widget.querySpec.dimension === "BY_DAY";
    const barCfg =
      widget.type === "BAR"
        ? { ...defaultBarChartConfig(), ...widget.barChart }
        : null;
    const rolled =
      widget.type === "BAR" && barCfg
        ? rollupBarSeries(data.series, barCfg.xGroupBy, dimensionIsDay)
        : data.series.map((s) => ({ label: s.label, value: s.value }));

    const chartData = rolled.map((s) => {
      let name = s.label;
      if (widget.querySpec.dimension === "BY_DAY") {
        const xg = barCfg?.xGroupBy ?? "DAY";
        if (xg === "DAY") name = formatDayLabel(s.label);
        else if (xg === "WEEK") name = `Sem. ${formatDayLabel(s.label)}`;
        else name = formatMonthYm(s.label);
      }
      return { name, value: s.value };
    });

    const barAvg =
      widget.type === "BAR" && chartData.length > 0
        ? chartData.reduce((a, c) => a + c.value, 0) / chartData.length
        : 0;

    const cfMeta = widget.querySpec.customFieldKey
      ? cfMap.get(widget.querySpec.customFieldKey) ?? null
      : null;
    const formatBarValue = (v: number) =>
      formatDashboardScalar(widget.querySpec, v, cfMeta);

    const isGoalGauge = widget.querySpec.dimension === "BY_GOAL_PROGRESS";
    const gaugeTarget = widget.querySpec.gaugeTargetMoney ?? 0;
    const segmentDone =
      chartData.find((s) => s.name === "Realizado")?.value ?? 0;
    const pctLabel =
      isGoalGauge && gaugeTarget > 0
        ? Math.min(100, Math.round((segmentDone / gaugeTarget) * 100))
        : null;

    const pipelineId = widget.querySpec.pipelineId;
    const dim = widget.querySpec.dimension;
    const wonAccentFill = dashboardWonAccentFill(pipelines, pipelineId);

    if (widget.type === "BAR" && barCfg) {
      return (
        <BarChartCardBody
          title={title}
          chartData={chartData}
          barCfg={barCfg}
          barAvg={barAvg}
          formatBarValue={formatBarValue}
          dimensionIsDay={dimensionIsDay}
          pipelines={pipelines}
          pipelineId={pipelineId}
          dimension={dim}
          wonAccentFill={wonAccentFill}
        />
      );
    }

    const semi =
      isGoalGauge || widget.donutChart?.variant === "semicircle";

    return (
      <Card
        className={cn(
          "flex h-full flex-col overflow-hidden",
          chartCardNeutralFrame,
        )}
      >
        <CardHeader className="drag-handle cursor-grab pb-1 pt-3">
          <CardTitle className="text-xs font-normal text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 px-2 pb-2 pt-0">
          <div className="relative h-full min-h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={semi ? { top: 4, bottom: 0 } : undefined}>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy={semi ? "82%" : "50%"}
                  startAngle={semi ? 180 : 0}
                  endAngle={semi ? 0 : 360}
                  outerRadius={semi ? "95%" : "80%"}
                  innerRadius={
                    widget.type === "DONUT"
                      ? semi
                        ? "68%"
                        : "55%"
                      : 0
                  }
                  paddingAngle={1}
                >
                  {chartData.map((row, i) => (
                    <Cell
                      key={i}
                      fill={dashboardChartSegmentFill({
                        pipelines,
                        pipelineId: widget.querySpec.pipelineId,
                        dimension: widget.querySpec.dimension,
                        segmentLabel: row.name,
                        seriesIndex: i,
                      })}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [formatBarValue(Number(v)), ""]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--card-foreground)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            {pctLabel != null ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center">
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {pctLabel}%
                </span>
                <span className="text-[10px] text-muted-foreground">
                  da meta
                </span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col overflow-hidden rounded-[10px] border border-border/60 bg-card shadow-sm">
      <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
        <CardTitle className="text-xs font-normal text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center px-3 pb-4 text-xs text-muted-foreground">
        Dados incompatíveis com o tipo de cartão.
      </CardContent>
    </Card>
  );
}

type BarChartCardBodyProps = {
  title: string;
  chartData: { name: string; value: number }[];
  barCfg: BarChartConfig;
  barAvg: number;
  formatBarValue: (v: number) => string;
  dimensionIsDay: boolean;
  pipelines: PipelineListItem[];
  pipelineId: string;
  dimension: LayoutWidget["querySpec"]["dimension"];
  wonAccentFill: string;
};

function BarChartCardBody({
  title,
  chartData,
  barCfg,
  barAvg,
  formatBarValue,
  dimensionIsDay,
  pipelines,
  pipelineId,
  dimension,
  wonAccentFill,
}: BarChartCardBodyProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);
  /** IDs únicos para gradiente SVG (vários cartões na página). */
  const areaFillGradientId = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setChartWidth(w);
    });
    ro.observe(el);
    setChartWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const n = chartData.length;
  const tickStride = useMemo(
    () => computeBarTickStride(n, chartWidth),
    [n, chartWidth],
  );
  const maxBarSize = useMemo(
    () => computeBarMaxSize(n, chartWidth),
    [n, chartWidth],
  );

  const showLine = (barCfg.seriesDisplay ?? "BAR") === "LINE";

  const perSlot = chartWidth > 0 && n > 0 ? chartWidth / n : 40;
  const rotateLabels =
    dimensionIsDay || n > 10 || (n > 6 && perSlot < X_LABEL_MIN_PX);
  const xAxisHeight = rotateLabels ? 52 : 30;
  const bottomMargin = rotateLabels ? 8 : 4;

  /** Mesmas regras do eixo X: grade vertical só onde há rótulo visível. */
  const gridVerticalValues = useMemo(() => {
    const last = n - 1;
    return chartData
      .map((row, i) => ({ name: row.name, i }))
      .filter(
        ({ i }) => i === 0 || i === last || i % tickStride === 0,
      )
      .map(({ name }) => name);
  }, [chartData, n, tickStride]);

  const renderXTick = (props: {
    x: number;
    y: number;
    payload: { value: string };
    index: number;
  }) => {
    const { x, y, payload, index } = props;
    const last = n - 1;
    const show =
      index === 0 || index === last || index % tickStride === 0;
    if (!show) {
      return <g />;
    }
    const text = payload?.value ?? "";
    if (rotateLabels) {
      return (
        <g transform={`translate(${x},${y})`}>
          <text
            x={0}
            y={0}
            dy={8}
            textAnchor="end"
            fontSize={10}
            fill="var(--foreground)"
            transform="rotate(-38)"
          >
            {text}
          </text>
        </g>
      );
    }
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={12}
          textAnchor="middle"
          fontSize={10}
          fill="var(--foreground)"
        >
          {text}
        </text>
      </g>
    );
  };

  return (
    <Card
      className={cn(
        "flex h-full flex-col overflow-hidden",
        chartCardNeutralFrame,
      )}
    >
      <CardHeader className="drag-handle cursor-grab pb-1 pt-3">
        <CardTitle className="text-xs font-normal text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-2 pb-2 pt-0">
        <div
          ref={wrapRef}
          className="h-full min-h-[120px] w-full min-w-0"
        >
          <ResponsiveContainer width="100%" height="100%">
            {showLine ? (
              <AreaChart
                data={chartData}
                margin={{
                  top: 8,
                  right: 4,
                  left: 0,
                  bottom: bottomMargin,
                }}
              >
                <defs>
                  <linearGradient
                    id={areaFillGradientId}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="0%"
                      stopColor={wonAccentFill}
                      stopOpacity={0.32}
                    />
                    <stop
                      offset="100%"
                      stopColor={wonAccentFill}
                      stopOpacity={0.04}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.14}
                  strokeDasharray="3 3"
                  verticalValues={gridVerticalValues}
                />
                <XAxis
                  dataKey="name"
                  tick={renderXTick}
                  interval={0}
                  height={xAxisHeight}
                  tickLine={{ stroke: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--muted-foreground)" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--foreground)" }}
                  width={36}
                  axisLine={{ stroke: "var(--muted-foreground)" }}
                  tickLine={{ stroke: "var(--muted-foreground)" }}
                />
                <Tooltip
                  formatter={(v) => [formatBarValue(Number(v)), ""]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--card-foreground)",
                    fontSize: 12,
                  }}
                />
                {barCfg.showLegend ? (
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                ) : null}
                {barCfg.showAverageLine && chartData.length > 0 ? (
                  <ReferenceLine
                    y={barAvg}
                    stroke="var(--chart-ref-line)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.85}
                  />
                ) : null}
                <Area
                  type="monotone"
                  dataKey="value"
                  name={title}
                  stroke={wonAccentFill}
                  strokeWidth={2.25}
                  fill={`url(#${areaFillGradientId})`}
                  dot={false}
                  activeDot={false}
                  connectNulls
                />
              </AreaChart>
            ) : (
              <BarChart
                data={chartData}
                barCategoryGap="12%"
                margin={{
                  top: 4,
                  right: 4,
                  left: 0,
                  bottom: bottomMargin,
                }}
              >
                <CartesianGrid
                  stroke="var(--muted-foreground)"
                  strokeOpacity={0.14}
                  strokeDasharray="3 3"
                  verticalValues={gridVerticalValues}
                />
                <XAxis
                  dataKey="name"
                  tick={renderXTick}
                  interval={0}
                  height={xAxisHeight}
                  tickLine={{ stroke: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--muted-foreground)" }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--foreground)" }}
                  width={36}
                  axisLine={{ stroke: "var(--muted-foreground)" }}
                  tickLine={{ stroke: "var(--muted-foreground)" }}
                />
                <Tooltip
                  formatter={(v) => [formatBarValue(Number(v)), ""]}
                  contentStyle={{
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--card)",
                    color: "var(--card-foreground)",
                    fontSize: 12,
                  }}
                />
                {barCfg.showLegend ? (
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                ) : null}
                {barCfg.showAverageLine && chartData.length > 0 ? (
                  <ReferenceLine
                    y={barAvg}
                    stroke="var(--chart-ref-line)"
                    strokeDasharray="4 4"
                    strokeOpacity={0.85}
                  />
                ) : null}
                <Bar
                  dataKey="value"
                  name={title}
                  maxBarSize={maxBarSize}
                  radius={[4, 4, 0, 0]}
                >
                  {chartData.map((row, i) => (
                    <Cell
                      key={i}
                      fill={dashboardChartSegmentFill({
                        pipelines,
                        pipelineId,
                        dimension,
                        segmentLabel: row.name,
                        seriesIndex: i,
                      })}
                    />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
            </div>
        </CardContent>
      </Card>
  );
}
