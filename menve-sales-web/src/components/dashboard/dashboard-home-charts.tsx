"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CHART, CHART_BAR_SEQUENCE } from "@/lib/chart-colors";

type Daily = { date: string; count: number };
type NamedCount = { name: string; count: number };
type SourceSlice = { name: string; value: number };

export function DashboardHomeCharts({
  dailyDeals,
  dealsByStage,
  contactsBySource,
}: {
  dailyDeals: Daily[];
  dealsByStage: NamedCount[];
  contactsBySource: SourceSlice[];
}) {
  const pieData = contactsBySource.filter((s) => s.value > 0);
  const formatDay = (d: string) => {
    const [, m, day] = d.split("-");
    return `${day}/${m}`;
  };

  return (
    <div className="space-y-6">
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-medium">Novos deals (30 dias)</CardTitle>
          <CardDescription>Volume criado por dia</CardDescription>
        </CardHeader>
        <CardContent className="h-[300px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyDeals} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/80" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10 }}
                tickFormatter={formatDay}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} width={32} tick={{ fontSize: 11 }} />
              <Tooltip
                labelFormatter={(v) => String(v)}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={CHART.primary}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Deals por etapa</CardTitle>
            <CardDescription>Em aberto no pipeline</CardDescription>
          </CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dealsByStage} margin={{ left: 0, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/80" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={56} />
                <YAxis allowDecimals={false} width={28} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {dealsByStage.map((_, i) => (
                    <Cell
                      key={i}
                      fill={CHART_BAR_SEQUENCE[i % CHART_BAR_SEQUENCE.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium">Contatos por origem</CardTitle>
            <CardDescription>Distribuição</CardDescription>
          </CardHeader>
          <CardContent className="flex h-[260px] items-center justify-center">
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados de origem</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_BAR_SEQUENCE[i % CHART_BAR_SEQUENCE.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
