"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART_BAR_SEQUENCE } from "@/lib/chart-colors";
import type {
  LayoutWidget,
  WidgetDataResult,
} from "@/lib/dashboard-builder-types";

function formatDayLabel(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export function DashboardWidgetRenderer({
  widget,
  data,
  loading,
  error,
}: {
  widget: LayoutWidget;
  data: WidgetDataResult | null;
  loading: boolean;
  error: string | null;
}) {
  const title =
    widget.title ||
    (widget.type === "METRIC"
      ? "Cálculo"
      : widget.type === "BAR"
        ? "Gráfico de barras"
        : "Gráfico de pizza");

  if (loading) {
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
    return (
      <Card className="flex h-full flex-col border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="drag-handle cursor-grab pb-0 pt-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col items-center justify-center pb-4 pt-1">
          <p className="text-3xl font-semibold tabular-nums tracking-tight">
            {widget.querySpec.measure === "SUM_VALUE"
              ? data.value.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL",
                  maximumFractionDigits: 0,
                })
              : data.value.toLocaleString("pt-BR")}
          </p>
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
    const chartData = data.series.map((s) => ({
      name:
        widget.querySpec.dimension === "BY_DAY"
          ? formatDayLabel(s.label)
          : s.label,
      value: s.value,
    }));

    return (
      <Card className="flex h-full flex-col border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="drag-handle cursor-grab pb-1 pt-3">
          <CardTitle className="text-xs font-medium text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 px-2 pb-2 pt-0">
          {widget.type === "BAR" ? (
            <div className="h-full min-h-[120px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/80" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 10 }} width={32} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
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
          ) : (
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
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
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
