"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DollarSign, Hash, Target } from "lucide-react";
import {
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
import { CHART_BAR_SEQUENCE } from "@/lib/chart-colors";
import {
  customFieldByKey,
  defaultBarChartConfig,
  formatDashboardScalar,
  type BarChartConfig,
  type BarXGroupBy,
  type DealCustomFieldDef,
  type LayoutWidget,
  type WidgetDataResult,
} from "@/lib/dashboard-builder-types";
import { cn } from "@/lib/utils";

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
  if (dm === "MONEY") return DollarSign;
  if (dm === "CUSTOM_NUMBER") return Hash;
  return Target;
}

function formatComparePercent(current: number, previous: number): {
  text: string;
  positive: boolean;
  neutral: boolean;
} {
  if (previous === 0) {
    if (current === 0) return { text: "0%", positive: true, neutral: true };
    return { text: "—", positive: true, neutral: true };
  }
  const raw = ((current - previous) / previous) * 100;
  const abs = Math.abs(raw);
  const text = `${new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(abs)}%`;
  if (raw === 0) return { text, positive: true, neutral: true };
  return { text, positive: raw > 0, neutral: false };
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
  previousScalar,
  loading,
  error,
  dealCustomFields,
}: {
  widget: LayoutWidget;
  data: WidgetDataResult | null;
  /** Só métrica escalar: valor no período anterior (para seta e %). */
  previousScalar?: number;
  loading: boolean;
  error: string | null;
  dealCustomFields: DealCustomFieldDef[];
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
        : "Gráfico de pizza");

  if (loading) {
    if (widget.type === "METRIC") {
      return (
        <Card className="flex h-full flex-col rounded-xl border border-border/60 bg-card shadow-sm">
          <CardHeader className="drag-handle cursor-grab space-y-0 px-5 pb-0 pt-5">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
              </CardTitle>
              <div className="size-9 shrink-0 animate-pulse rounded-lg bg-muted" />
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-5 pb-5 pt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <div className="h-9 w-28 animate-pulse rounded bg-muted" />
              <div className="h-5 w-16 animate-pulse rounded bg-muted" />
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="flex h-full flex-col border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
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
      <Card className="flex h-full flex-col border-destructive/40 bg-card/80 shadow-sm">
        <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
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
    return (
      <Card className="flex h-full flex-col border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center pb-4 text-xs text-muted-foreground">
          Sem dados
        </CardContent>
      </Card>
    );
  }

  if (widget.type === "METRIC" && data.kind === "scalar") {
    const Icon = metricIconForSpec(widget.querySpec);
    const formatted = formatDashboardScalar(
      widget.querySpec,
      data.value,
      widget.querySpec.customFieldKey
        ? cfMap.get(widget.querySpec.customFieldKey) ?? null
        : null,
    );
    const showCompare = previousScalar !== undefined;
    const cmp = showCompare
      ? formatComparePercent(data.value, previousScalar as number)
      : null;

    return (
      <Card className="flex h-full flex-col rounded-xl border border-border/60 bg-card shadow-sm">
        <CardHeader className="drag-handle cursor-grab space-y-0 px-5 pb-0 pt-5">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-sm font-medium leading-snug text-muted-foreground">
              {title}
            </CardTitle>
            <div
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-foreground dark:bg-sky-400/15"
              aria-hidden
            >
              <Icon className="size-4 stroke-[1.75]" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-center px-5 pb-5 pt-4">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <p className="text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {formatted}
            </p>
            {cmp && !cmp.neutral ? (
              <span
                className={cn(
                  "text-sm font-medium tabular-nums",
                  cmp.positive ? "text-emerald-600 dark:text-emerald-500" : "text-red-600 dark:text-red-500",
                )}
                aria-label={
                  cmp.positive
                    ? `Alta de ${cmp.text} em relação ao período anterior`
                    : `Queda de ${cmp.text} em relação ao período anterior`
                }
              >
                {cmp.positive ? "↑" : "↓"} {cmp.text}
              </span>
            ) : cmp && cmp.neutral && cmp.text !== "—" ? (
              <span
                className="text-sm font-medium tabular-nums text-muted-foreground"
                aria-label="Sem variação em relação ao período anterior"
              >
                {cmp.text}
              </span>
            ) : cmp && cmp.text === "—" ? (
              <span
                className="text-sm font-medium text-muted-foreground"
                title="Sem base no período anterior para calcular percentual"
              >
                —
              </span>
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

    if (widget.type === "BAR" && barCfg) {
      return (
        <BarChartCardBody
          title={title}
          chartData={chartData}
          barCfg={barCfg}
          barAvg={barAvg}
          formatBarValue={formatBarValue}
          dimensionIsDay={dimensionIsDay}
        />
      );
    }

    return (
      <Card className="flex h-full flex-col border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="drag-handle cursor-grab pb-1 pt-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 px-2 pb-2 pt-0">
          <div className="h-full min-h-[120px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius="80%"
                  innerRadius={widget.type === "DONUT" ? "55%" : 0}
                  paddingAngle={1}
                >
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_BAR_SEQUENCE[i % CHART_BAR_SEQUENCE.length]}
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
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="drag-handle cursor-grab pb-2 pt-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">
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
};

function BarChartCardBody({
  title,
  chartData,
  barCfg,
  barAvg,
  formatBarValue,
  dimensionIsDay,
}: BarChartCardBodyProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

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
    <Card className="flex h-full flex-col border-border/60 bg-card/80 shadow-sm">
      <CardHeader className="drag-handle cursor-grab pb-1 pt-3">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-2 pb-2 pt-0">
        <div
          ref={wrapRef}
          className="h-full min-h-[120px] w-full min-w-0"
        >
          <ResponsiveContainer width="100%" height="100%">
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
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                />
              ) : null}
              <Bar
                dataKey="value"
                name={title}
                maxBarSize={maxBarSize}
                radius={[4, 4, 0, 0]}
              >
                    {chartData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_BAR_SEQUENCE[i % CHART_BAR_SEQUENCE.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
        </CardContent>
      </Card>
  );
}
