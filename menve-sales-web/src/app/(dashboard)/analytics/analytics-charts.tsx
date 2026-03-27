"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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
import { CHART } from "@/lib/chart-colors";

export function AnalyticsCharts({
  funnel,
  byUser,
  bySource,
  forecast,
  wonCount,
  lostCount,
  winRate,
  lossReasons,
}: {
  funnel: { name: string; count: number }[];
  byUser: { label: string; count: number }[];
  bySource: { label: string; count: number }[];
  forecast: number;
  wonCount: number;
  lostCount: number;
  winRate: number | null;
  lossReasons: { label: string; count: number }[];
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Previsão (aberto)</CardTitle>
            <CardDescription>Soma valores em aberto</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {forecast.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Ganhos</CardTitle>
            <CardDescription>Deals WON</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-500">
              {wonCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Perdidos</CardTitle>
            <CardDescription>Deals LOST</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-rose-600 dark:text-rose-500">
              {lostCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Taxa de vitória</CardTitle>
            <CardDescription>Ganho / (Ganho + Perdido)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {winRate != null ? `${winRate}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Funil (deals abertos por etapa)</CardTitle>
        </CardHeader>
        <CardContent className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={funnel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={CHART.primary} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {lossReasons.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Motivos de perda (top)</CardTitle>
            <CardDescription>
              Agrupado a partir do fechamento como perdido no pipeline
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={lossReasons} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill={CHART.loss} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Por vendedor (abertos)</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byUser}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill={CHART.secondary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contatos por origem</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySource}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill={CHART.tertiary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
