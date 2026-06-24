import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Optional,
} from "@nestjs/common";
import {
  ActivityType,
  DealStatus,
  type Prisma,
} from "@prisma/client";
import { PipelineAutomationEngineService } from "../pipeline-automations/pipeline-automation-engine.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  mergeCustomDataWebsite,
  resolveJourneyContext,
} from "./journey-context.util";

export type PromoteOnMeetInput = {
  tenantId: string;
  actorUserId: string;
  contactId: string;
  meetLink: string;
  dueAt: Date;
  googleEventId: string;
  activityTitle?: string;
  activityDescription?: string | null;
  durationMinutes?: number;
  dealId?: string | null;
};

function isValidMeetLink(link: string): boolean {
  const t = link.trim().toLowerCase();
  return t.includes("meet.google.com");
}

@Injectable()
export class DealPipelinePromotionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => PipelineAutomationEngineService))
    private readonly pipelineAutomationEngine?: PipelineAutomationEngineService,
  ) {}

  async promoteDealToPipelineOnMeetScheduled(
    input: PromoteOnMeetInput,
  ): Promise<{ dealId: string; activityId: string; created: boolean }> {
    if (!isValidMeetLink(input.meetLink)) {
      throw new BadRequestException(
        "Reunião sem link Google Meet válido; lead não entra na Gestão de leads",
      );
    }

    const contact = await this.prisma.contact.findFirst({
      where: { id: input.contactId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!contact) throw new BadRequestException("Contato inválido");

    const existingByEvent = await this.prisma.activity.findFirst({
      where: {
        tenantId: input.tenantId,
        googleEventId: input.googleEventId,
        type: ActivityType.MEETING,
      },
      select: { id: true, dealId: true },
    });
    if (existingByEvent?.dealId) {
      return {
        dealId: existingByEvent.dealId,
        activityId: existingByEvent.id,
        created: false,
      };
    }

    const journey = await resolveJourneyContext(
      this.prisma,
      input.tenantId,
      input.contactId,
    );
    const displayName = journey.name || journey.company || "Lead";
    const customDataPatch = mergeCustomDataWebsite(
      (
        await this.prisma.contact.findFirst({
          where: { id: input.contactId },
          select: { customData: true },
        })
      )?.customData,
      journey.website,
    );

    await this.prisma.contact.update({
      where: { id: input.contactId },
      data: {
        name: displayName,
        phone: journey.phone ?? undefined,
        company: journey.company ?? journey.name ?? undefined,
        customData: customDataPatch as Prisma.InputJsonValue,
      },
    });

    const pipeline = await this.prisma.pipeline.findFirst({
      where: { tenantId: input.tenantId, isDefault: true },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
    if (!pipeline?.stages.length) {
      throw new BadRequestException("Funil padrão não configurado");
    }
    const entryStage =
      pipeline.stages.find((s) => s.name === "Reunião agendada") ??
      pipeline.stages[0]!;

    const conversation = await this.prisma.conversation.findFirst({
      where: { tenantId: input.tenantId, contactId: input.contactId },
      orderBy: { updatedAt: "desc" },
      select: { assignedUserId: true },
    });

    let deal = input.dealId
      ? await this.prisma.deal.findFirst({
          where: {
            id: input.dealId,
            tenantId: input.tenantId,
            contactId: input.contactId,
          },
        })
      : null;

    if (!deal) {
      deal = await this.prisma.deal.findFirst({
        where: {
          tenantId: input.tenantId,
          contactId: input.contactId,
          pipelineId: pipeline.id,
          status: DealStatus.OPEN,
        },
        orderBy: { updatedAt: "desc" },
      });
    }

    const meetCustom: Prisma.InputJsonValue = {
      meetLink: input.meetLink.trim(),
      googleEventId: input.googleEventId,
    };

    const now = new Date();
    let created = false;

    if (!deal) {
      deal = await this.prisma.deal.create({
        data: {
          tenantId: input.tenantId,
          contactId: input.contactId,
          pipelineId: pipeline.id,
          stageId: entryStage.id,
          title: `Reunião: ${displayName}`,
          expectedClose: input.dueAt,
          pipelineVisible: true,
          pipelineEnteredAt: now,
          assignedToId: conversation?.assignedUserId ?? input.actorUserId,
          customData: meetCustom,
        },
      });
      created = true;
    } else if (!deal.pipelineVisible) {
      deal = await this.prisma.deal.update({
        where: { id: deal.id },
        data: {
          pipelineVisible: true,
          pipelineEnteredAt: now,
          stageId: entryStage.id,
          title: deal.title?.trim() ? deal.title : `Reunião: ${displayName}`,
          expectedClose: input.dueAt,
          assignedToId:
            deal.assignedToId ??
            conversation?.assignedUserId ??
            input.actorUserId,
          customData: {
            ...(typeof deal.customData === "object" &&
            deal.customData &&
            !Array.isArray(deal.customData)
              ? (deal.customData as Record<string, unknown>)
              : {}),
            ...meetCustom,
          } as Prisma.InputJsonValue,
        },
      });
      created = true;
    } else {
      deal = await this.prisma.deal.update({
        where: { id: deal.id },
        data: {
          expectedClose: input.dueAt,
          customData: {
            ...(typeof deal.customData === "object" &&
            deal.customData &&
            !Array.isArray(deal.customData)
              ? (deal.customData as Record<string, unknown>)
              : {}),
            ...meetCustom,
          } as Prisma.InputJsonValue,
        },
      });
    }

    const activityTitle =
      input.activityTitle?.trim() || `Reunião: ${displayName}`;

    const activity = await this.prisma.activity.create({
      data: {
        tenantId: input.tenantId,
        userId: input.actorUserId,
        contactId: input.contactId,
        dealId: deal.id,
        type: ActivityType.MEETING,
        title: activityTitle,
        description: input.activityDescription ?? null,
        dueAt: input.dueAt,
        meetLink: input.meetLink.trim(),
        googleEventId: input.googleEventId,
      },
    });

    if (created && this.pipelineAutomationEngine) {
      const contactRow = await this.prisma.contact.findFirst({
        where: { id: input.contactId, tenantId: input.tenantId },
        select: { campaignSourceId: true },
      });
      void this.pipelineAutomationEngine
        .afterDealEnteredPipeline({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          dealId: deal.id,
          pipelineId: pipeline.id,
          campaignSourceId: contactRow?.campaignSourceId ?? null,
          depth: 0,
        })
        .catch(() => undefined);
    }

    return { dealId: deal.id, activityId: activity.id, created };
  }
}
