import { Injectable } from "@nestjs/common";
import { DealStatus, OutreachRecipientStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async prospectingFunnel(
    tenantId: string,
    from?: string,
    to?: string,
  ) {
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (from) createdAt.gte = new Date(from);
    if (to) createdAt.lte = new Date(to);

    const [prospectingSrc, outreachSrc] = await Promise.all([
      this.prisma.campaignSource.findFirst({
        where: { tenantId, code: "prospecting" },
      }),
      this.prisma.campaignSource.findFirst({
        where: { tenantId, code: "outreach" },
      }),
    ]);

    const sourceIds = [prospectingSrc?.id, outreachSrc?.id].filter(
      (id): id is string => Boolean(id),
    );

    const contactWhere = {
      tenantId,
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      OR: [
        ...(sourceIds.length > 0
          ? [{ campaignSourceId: { in: sourceIds } }]
          : []),
        { utmSource: { in: ["prospecting", "outreach"] } },
      ],
    };

    const contacts = await this.prisma.contact.findMany({
      where: contactWhere,
      select: { id: true },
    });
    const contactIds = contacts.map((c) => c.id);

    const deals = contactIds.length
      ? await this.prisma.deal.findMany({
          where: {
            tenantId,
            contactId: { in: contactIds },
            ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
          },
          include: { stage: { select: { id: true, name: true, sortOrder: true } } },
        })
      : [];

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId, isDefault: true },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    const stages = pipeline?.stages ?? [];

    const funnel = stages.map((stage) => {
      const cumulative = deals.filter(
        (d) =>
          d.status === DealStatus.OPEN
            ? d.stage.sortOrder >= stage.sortOrder
            : d.stage.sortOrder >= stage.sortOrder ||
              d.status === DealStatus.WON,
      ).length;
      return {
        stageId: stage.id,
        name: stage.name,
        sortOrder: stage.sortOrder,
        count: cumulative,
      };
    });

    const outreachStats = await this.prisma.outreachCampaignRecipient.groupBy({
      by: ["status"],
      where: {
        campaign: { tenantId },
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      },
      _count: { _all: true },
    });

    const outreachSent =
      outreachStats.find((s) => s.status === OutreachRecipientStatus.SENT)
        ?._count._all ?? 0;
    const outreachDelivered =
      outreachStats.find((s) => s.status === OutreachRecipientStatus.DELIVERED)
        ?._count._all ?? 0;
    const outreachReplied =
      outreachStats.find((s) => s.status === OutreachRecipientStatus.REPLIED)
        ?._count._all ?? 0;

    const won = deals.filter((d) => d.status === DealStatus.WON).length;
    const open = deals.filter((d) => d.status === DealStatus.OPEN).length;
    const lost = deals.filter((d) => d.status === DealStatus.LOST).length;

    const prospectResults = await this.prisma.prospectResult.count({
      where: {
        tenantId,
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      },
    });

    return {
      period: { from: from ?? null, to: to ?? null },
      sources: {
        prospecting: Boolean(prospectingSrc),
        outreach: Boolean(outreachSrc),
      },
      kpis: {
        contacts: contactIds.length,
        prospectResults,
        dealsTotal: deals.length,
        dealsOpen: open,
        dealsWon: won,
        dealsLost: lost,
        outreachSent: outreachSent + outreachDelivered + outreachReplied,
        outreachReplied,
        replyRate:
          outreachSent + outreachDelivered + outreachReplied > 0
            ? Math.round(
                (outreachReplied /
                  (outreachSent + outreachDelivered + outreachReplied)) *
                  1000,
              ) / 10
            : null,
      },
      funnel,
    };
  }
}
