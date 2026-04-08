import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(tenantId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId, isDefault: true },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });

    const stageCounts: { name: string; count: number }[] = [];
    if (pipeline) {
      for (const s of pipeline.stages) {
        const count = await this.prisma.deal.count({
          where: { tenantId, stageId: s.id, status: "OPEN" },
        });
        stageCounts.push({ name: s.name, count });
      }
    }

    const [wonCount, lostCount, byUser, bySource, forecast, lossGroups] =
      await Promise.all([
        this.prisma.deal.count({ where: { tenantId, status: "WON" } }),
        this.prisma.deal.count({ where: { tenantId, status: "LOST" } }),
        this.prisma.deal.groupBy({
          by: ["assignedToId"],
          where: { tenantId, status: "OPEN" },
          _count: { _all: true },
        }),
        this.prisma.contact.groupBy({
          by: ["campaignSourceId"],
          where: { tenantId },
          _count: { _all: true },
        }),
        this.prisma.deal.aggregate({
          where: { tenantId, status: "OPEN" },
          _sum: { value: true },
        }),
        this.prisma.deal.groupBy({
          by: ["lostReason"],
          where: {
            tenantId,
            status: "LOST",
            lostReason: { not: null },
          },
          _count: { _all: true },
        }),
      ]);

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name ?? u.email]));

    const sources = await this.prisma.campaignSource.findMany({
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
    const winRate =
      closedTotal > 0
        ? Math.round((wonCount / closedTotal) * 1000) / 10
        : null;

    return {
      funnel: stageCounts,
      byUser: byUser.map((b) => ({
        label: b.assignedToId
          ? userMap.get(b.assignedToId) ?? "Sem dono"
          : "Sem dono",
        count: b._count._all,
      })),
      bySource: bySource.map((b) => ({
        label: b.campaignSourceId
          ? sourceMap.get(b.campaignSourceId) ?? "—"
          : "Sem origem",
        count: b._count._all,
      })),
      forecast: Number(forecast._sum.value ?? 0),
      wonCount,
      lostCount,
      winRate,
      lossReasons,
    };
  }
}
