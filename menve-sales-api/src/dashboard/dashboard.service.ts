import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function buildDailyCounts(
  rows: { createdAt: Date }[],
  days = 30,
): { date: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const out: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const key = dt.toISOString().slice(0, 10);
    out.push({ date: key, count: map.get(key) ?? 0 });
  }
  return out;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(tenantId: string) {
    const dueBefore = new Date();
    dueBefore.setDate(dueBefore.getDate() + 7);

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId, isDefault: true },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });

    const since = new Date();
    since.setDate(since.getDate() - 30);
    since.setHours(0, 0, 0, 0);

    const [
      contacts,
      dealsOpen,
      activitiesDue,
      forecast,
      dealRows,
      bySourceGroups,
      sources,
    ] = await Promise.all([
      this.prisma.contact.count({ where: { tenantId } }),
      this.prisma.deal.count({ where: { tenantId, status: "OPEN" } }),
      this.prisma.activity.count({
        where: {
          tenantId,
          completedAt: null,
          dueAt: { lte: dueBefore },
        },
      }),
      this.prisma.deal.aggregate({
        where: { tenantId, status: "OPEN" },
        _sum: { value: true },
      }),
      this.prisma.deal.findMany({
        where: { tenantId, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      this.prisma.contact.groupBy({
        by: ["campaignSourceId"],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.campaignSource.findMany({ where: { tenantId } }),
    ]);

    const dailyDeals = buildDailyCounts(dealRows, 30);

    const dealsByStage =
      pipeline != null
        ? await Promise.all(
            pipeline.stages.map(async (s) => ({
              name: s.name,
              count: await this.prisma.deal.count({
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

    const tenantFlags = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { researchEnabled: true },
    });
    const prospecting =
      tenantFlags?.researchEnabled === false
        ? null
        : await this.prospectingBlock(tenantId, pipeline);

    return {
      pipeline,
      contacts,
      dealsOpen,
      activitiesDue,
      forecastBrl: Number(forecast._sum.value ?? 0),
      dailyDeals,
      dealsByStage,
      contactsBySource,
      prospecting,
    };
  }

  /** Deals whose contact has CampaignSource code `prospecting` (Pesquisa). */
  private async prospectingBlock(
    tenantId: string,
    pipeline: {
      stages: { id: string; name: string; sortOrder: number }[];
    } | null,
  ) {
    const src = await this.prisma.campaignSource.findFirst({
      where: { tenantId, code: "prospecting" },
    });
    if (!src) return null;

    const deals = await this.prisma.deal.findMany({
      where: {
        tenantId,
        contact: { campaignSourceId: src.id },
      },
      include: { stage: true },
    });

    const stages = pipeline?.stages ?? [];
    const total = deals.length;

    if (total === 0) {
      return {
        total: 0,
        won: 0,
        open: 0,
        contactRate: null as number | null,
        funnel: stages.map((s) => ({ name: s.name, count: 0 })),
      };
    }

    const won = deals.filter((d) => d.status === "WON").length;
    const open = deals.filter((d) => d.status === "OPEN").length;

    const contacted = deals.filter(
      (d) => d.stage.sortOrder >= 1 || d.status !== "OPEN",
    ).length;
    const contactRate = Math.round((contacted / total) * 1000) / 10;

    const funnel = stages.map((s) => ({
      name: s.name,
      count: deals.filter(
        (d) =>
          d.status === "OPEN" && d.stage.sortOrder === s.sortOrder,
      ).length,
    }));

    return { total, won, open, contactRate, funnel };
  }

  async revenue(
    tenantId: string,
    from?: string,
    to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const [wonAgg, openAgg, openCount, wonDeals] = await Promise.all([
      this.prisma.deal.aggregate({
        where: {
          tenantId,
          status: "WON",
          updatedAt: { gte: fromDate, lte: toDate },
        },
        _sum: { value: true },
        _count: { _all: true },
      }),
      this.prisma.deal.aggregate({
        where: { tenantId, status: "OPEN" },
        _sum: { value: true },
      }),
      this.prisma.deal.count({ where: { tenantId, status: "OPEN" } }),
      this.prisma.deal.findMany({
        where: {
          tenantId,
          status: "WON",
          updatedAt: { gte: fromDate, lte: toDate },
          assignedToId: { not: null },
        },
        select: {
          assignedToId: true,
          value: true,
          assignedTo: { select: { id: true, name: true } },
        },
      }),
    ]);

    const sellerMap = new Map<
      string,
      { userId: string; name: string | null; wonCount: number; wonValueBrl: number }
    >();
    for (const d of wonDeals) {
      const uid = d.assignedToId!;
      const cur = sellerMap.get(uid) ?? {
        userId: uid,
        name: d.assignedTo?.name ?? null,
        wonCount: 0,
        wonValueBrl: 0,
      };
      cur.wonCount += 1;
      cur.wonValueBrl += Number(d.value ?? 0);
      sellerMap.set(uid, cur);
    }

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      wonValueBrl: Number(wonAgg._sum.value ?? 0),
      wonCount: wonAgg._count._all,
      forecastBrl: Number(openAgg._sum.value ?? 0),
      openCount,
      sellers: [...sellerMap.values()].sort(
        (a, b) => b.wonValueBrl - a.wonValueBrl,
      ),
    };
  }
}
