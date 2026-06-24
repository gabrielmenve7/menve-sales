"use client";

import { useState } from "react";
import {
  fetchProspectingFunnel,
  type ProspectingFunnelReport,
} from "@/actions/reports";
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
import {
  BarChart3,
  Loader2,
  MessageCircle,
  Send,
  Target,
  TrendingUp,
} from "lucide-react";

function brl(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

export function RelatoriosClient({
  initialReport,
}: {
  initialReport: ProspectingFunnelReport | null;
}) {
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(
    initialReport?.from ? toDateInput(initialReport.from) : "",
  );
  const [to, setTo] = useState(
    initialReport?.to ? toDateInput(initialReport.to) : "",
  );
  const [error, setError] = useState<string | null>(null);

  async function onApply() {
    setLoading(true);
    setError(null);
    try {
      const fromIso = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
      const toIso = to ? new Date(`${to}T23:59:59`).toISOString() : undefined;
      const data = await fetchProspectingFunnel({ from: fromIso, to: toIso });
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar relatório");
    } finally {
      setLoading(false);
    }
  }

  const t = report?.totals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Funil de prospecção — busca, disparo e conversão
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="rep-from">De</Label>
          <Input
            id="rep-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="rep-to">Até</Label>
          <Input
            id="rep-to"
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

      {!report ? (
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar o relatório. Verifique se a API está
          disponível.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardKpiCard
              label="Mensagens enviadas"
              value={String(t?.messagesSent ?? 0)}
              icon={Send}
            />
            <DashboardKpiCard
              label="Respostas"
              value={String(t?.replies ?? 0)}
              icon={MessageCircle}
            />
            <DashboardKpiCard
              label="Reuniões"
              value={String(t?.meetings ?? 0)}
              icon={Target}
            />
            <DashboardKpiCard
              label="Receita ganha"
              value={brl(t?.revenueWonBrl ?? 0)}
              sub={`${t?.dealsWon ?? 0} negócios`}
              icon={TrendingUp}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardKpiCard
              label="Buscas"
              value={String(t?.searches ?? 0)}
              icon={BarChart3}
            />
            <DashboardKpiCard
              label="Resultados"
              value={String(t?.results ?? 0)}
              icon={BarChart3}
            />
            <DashboardKpiCard
              label="Itens em listas"
              value={String(t?.listItems ?? 0)}
              icon={BarChart3}
            />
            <DashboardKpiCard
              label="Campanhas"
              value={String(t?.campaigns ?? 0)}
              icon={Send}
            />
          </div>

          {report.funnel.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Funil do pipeline</CardTitle>
                <CardDescription>
                  Oportunidades abertas por etapa (acumulado)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.funnel.map((stage) => {
                  const max =
                    report.funnel[report.funnel.length - 1]?.cumulativeCount || 1;
                  const pct = Math.round(
                    (stage.cumulativeCount / max) * 100,
                  );
                  return (
                    <div key={stage.stageId}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>{stage.stageName}</span>
                        <span className="text-muted-foreground">
                          {stage.cumulativeCount} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary-solid transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
