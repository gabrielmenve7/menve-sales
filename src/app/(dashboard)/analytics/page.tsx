import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { AnalyticsCharts } from "./analytics-charts";

export default async function AnalyticsPage() {
  const tenantId = await getActiveTenantId();

  const pipeline = await prisma.pipeline.findFirst({
    where: { tenantId, isDefault: true },
    include: { stages: { orderBy: { sortOrder: "asc" } } },
  });

  const stageCounts: { name: string; count: number }[] = [];
  if (pipeline) {
    for (const s of pipeline.stages) {
      const count = await prisma.deal.count({
        where: { tenantId, stageId: s.id, status: "OPEN" },
      });
      stageCounts.push({ name: s.name, count });
    }
  }

  const [wonCount, lostCount, byUser, bySource, forecast, lossGroups] =
    await Promise.all([
      prisma.deal.count({ where: { tenantId, status: "WON" } }),
      prisma.deal.count({ where: { tenantId, status: "LOST" } }),
      prisma.deal.groupBy({
        by: ["assignedToId"],
        where: { tenantId, status: "OPEN" },
        _count: { _all: true },
      }),
      prisma.contact.groupBy({
        by: ["campaignSourceId"],
        where: { tenantId },
        _count: { _all: true },
      }),
      prisma.deal.aggregate({
        where: { tenantId, status: "OPEN" },
        _sum: { value: true },
      }),
      prisma.deal.groupBy({
        by: ["lostReason"],
        where: {
          tenantId,
          status: "LOST",
          lostReason: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, name: true, email: true },
  });

  const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

  const sources = await prisma.campaignSource.findMany({
    where: { tenantId },
  });
  const sourceMap = new Map(sources.map((s) => [s.id, s.name]));

  const lossReasons = lossGroups
    .filter((g) => g.lostReason && g.lostReason.trim().length > 0)
    .map((g) => ({
      label: (g.lostReason ?? "").slice(0, 80),
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const closedTotal = wonCount + lostCount;
  const winRate = closedTotal > 0 ? Math.round((wonCount / closedTotal) * 1000) / 10 : null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="text-muted-foreground">
          Funil, performance, fechamentos e origem de leads.
        </p>
      </div>
      <AnalyticsCharts
        funnel={stageCounts}
        byUser={byUser.map((b) => ({
          label: b.assignedToId
            ? userMap.get(b.assignedToId) ?? "Sem dono"
            : "Sem dono",
          count: b._count._all,
        }))}
        bySource={bySource.map((b) => ({
          label: b.campaignSourceId
            ? sourceMap.get(b.campaignSourceId) ?? "—"
            : "Sem origem",
          count: b._count._all,
        }))}
        forecast={Number(forecast._sum.value ?? 0)}
        wonCount={wonCount}
        lostCount={lostCount}
        winRate={winRate}
        lossReasons={lossReasons}
      />
    </div>
  );
}
