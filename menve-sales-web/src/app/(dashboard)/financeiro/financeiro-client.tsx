"use client";

import { useState } from "react";
import { fetchRevenueStats, type RevenueStats } from "@/actions/financeiro";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, Loader2, Target, TrendingUp, Users } from "lucide-react";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

export function FinanceiroClient({
  initialStats,
}: {
  initialStats: RevenueStats | null;
}) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(
    initialStats?.from ? toDateInput(initialStats.from) : "",
  );
  const [to, setTo] = useState(
    initialStats?.to ? toDateInput(initialStats.to) : "",
  );
  const [error, setError] = useState<string | null>(null);

  async function onApply() {
    setLoading(true);
    setError(null);
    try {
      const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
      const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : undefined;
      const data = await fetchRevenueStats({ from: fromIso, to: toIso });
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar dados");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Receita ganha, forecast e ranking de vendedores
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fin-from">De</Label>
          <Input
            id="fin-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fin-to">Até</Label>
          <Input
            id="fin-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-auto"
          />
        </div>
        <Button type="button" onClick={() => void onApply()} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          <span className={loading ? "ml-2" : ""}>Atualizar</span>
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!stats ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar os dados financeiros.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardKpiCard
              label="Receita ganha (WON)"
              value={brl(stats.wonValueBrl)}
              sub={`${stats.wonCount} negócios fechados`}
              icon={CreditCard}
            />
            <DashboardKpiCard
              label="Forecast (abertos)"
              value={brl(stats.forecastBrl)}
              sub={`${stats.openCount} oportunidades abertas`}
              icon={TrendingUp}
            />
            <DashboardKpiCard
              label="Ticket médio WON"
              value={
                stats.wonCount > 0
                  ? brl(stats.wonValueBrl / stats.wonCount)
                  : brl(0)
              }
              icon={Target}
            />
            <DashboardKpiCard
              label="Vendedores no ranking"
              value={String(stats.sellers.length)}
              icon={Users}
            />
          </div>

          {stats.sellers.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ranking de vendedores</CardTitle>
                <CardDescription>Receita WON no período</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {stats.sellers.map((s, i) => (
                    <li
                      key={s.userId}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <span>
                        <span className="mr-2 text-muted-foreground">
                          {i + 1}.
                        </span>
                        {s.name ?? "Sem nome"}
                      </span>
                      <span className="text-muted-foreground">
                        {brl(s.wonValueBrl)} · {s.wonCount} ganhos
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
