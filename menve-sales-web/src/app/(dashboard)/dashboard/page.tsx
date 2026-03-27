import { auth } from "@/auth";
import { DashboardHomeCharts } from "@/components/dashboard/dashboard-home-charts";
import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import prisma from "@/lib/prisma";
import { buildDailyCounts, dealsCreatedByDayLast30 } from "@/lib/dashboard-stats";
import { getActiveTenantId } from "@/lib/session";
import { CalendarDays, Kanban, ListTodo, Target, Users } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  const tenantId = await getActiveTenantId();

  const dueBefore = new Date();
  dueBefore.setDate(dueBefore.getDate() + 7);

  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId, isDefault: true },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });

  const [
    contacts,
    dealsOpen,
    activitiesDue,
    forecast,
    dealRows,
    bySourceGroups,
    sources,
  ] = await Promise.all([
    prisma.contact.count({ where: { tenantId } }),
    prisma.deal.count({
      where: { tenantId, status: "OPEN" },
    }),
    prisma.activity.count({
      where: {
        tenantId,
        completedAt: null,
        dueAt: { lte: dueBefore },
      },
    }),
    prisma.deal.aggregate({
      where: { tenantId, status: "OPEN" },
      _sum: { value: true },
    }),
    dealsCreatedByDayLast30(tenantId),
    prisma.contact.groupBy({
      by: ["campaignSourceId"],
      where: { tenantId },
      _count: { _all: true },
    }),
    prisma.campaignSource.findMany({ where: { tenantId } }),
  ]);

  const dailyDeals = buildDailyCounts(dealRows, 30);

  const dealsByStage =
    pipeline != null
      ? await Promise.all(
          pipeline.stages.map(async (s) => ({
            name: s.name,
            count: await prisma.deal.count({
              where: { tenantId, stageId: s.id, status: "OPEN" },
            }),
          })),
        )
      : [];

  const sourceMap = new Map(sources.map((s) => [s.id, s.name]));
  const contactsBySource = bySourceGroups.map((b) => ({
    name: b.campaignSourceId
      ? sourceMap.get(b.campaignSourceId) ?? "—"
      : "Sem origem",
    value: b._count._all,
  }));

  const forecastBrl = Number(forecast._sum.value ?? 0);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Olá, {session?.user?.name ?? session?.user?.email} — visão geral do
            pipeline (últimos 30 dias nos gráficos).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span className="rounded-md border border-border/60 bg-card px-2.5 py-1 text-[13px]">
            {pipeline?.name ?? "Pipeline"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-card px-2.5 py-1 text-[13px]">
            <CalendarDays className="size-3.5 opacity-70" />
            30 dias
          </span>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpiCard
          label="Contatos"
          value={String(contacts)}
          sub="Total cadastrado"
          icon={Users}
        />
        <DashboardKpiCard
          label="Deals abertos"
          value={String(dealsOpen)}
          sub="No pipeline"
          icon={Kanban}
        />
        <DashboardKpiCard
          label="Previsão"
          value={forecastBrl.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
          sub="Soma em aberto"
          icon={Target}
        />
        <DashboardKpiCard
          label="Atividades (7 dias)"
          value={String(activitiesDue)}
          sub="Pendentes ou prazo próximo"
          icon={ListTodo}
        />
      </div>

      <DashboardHomeCharts
        dailyDeals={dailyDeals}
        dealsByStage={dealsByStage}
        contactsBySource={contactsBySource}
      />
    </div>
  );
}
