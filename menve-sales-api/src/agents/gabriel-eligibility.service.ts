import { Injectable } from "@nestjs/common";
import {
  AgentRunStatus,
  ConversationQualificationMode,
  OutreachRecipientStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

@Injectable()
export class GabrielEligibilityService {
  constructor(private readonly prisma: PrismaService) {}

  async shouldRun(args: {
    tenantId: string;
    conversationId: string;
  }): Promise<EligibilityResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: args.tenantId },
      select: { gabrielEnabled: true },
    });
    if (!tenant?.gabrielEnabled) {
      return { eligible: false, reason: "gabriel_disabled" };
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: args.conversationId, tenantId: args.tenantId },
      include: {
        outreachRecipient: { select: { status: true } },
        contact: { select: { id: true } },
      },
    });
    if (!conversation) {
      return { eligible: false, reason: "conversation_not_found" };
    }

    if (!conversation.outreachRecipientId || !conversation.outreachRecipient) {
      return { eligible: false, reason: "not_from_disparo" };
    }

    if (
      conversation.outreachRecipient.status === OutreachRecipientStatus.OPT_OUT
    ) {
      return { eligible: false, reason: "opt_out" };
    }

    if (
      conversation.outreachRecipient.status !== OutreachRecipientStatus.REPLIED
    ) {
      return { eligible: false, reason: "disparo_not_replied" };
    }

    if (conversation.qualificationMode !== ConversationQualificationMode.AI_ACTIVE) {
      return { eligible: false, reason: "not_ai_active" };
    }

    const visibleDeal = await this.prisma.deal.findFirst({
      where: {
        tenantId: args.tenantId,
        contactId: conversation.contactId,
        status: "OPEN",
        pipelineVisible: true,
      },
      select: { id: true },
    });
    if (visibleDeal) {
      return { eligible: false, reason: "already_in_pipeline" };
    }

    const running = await this.prisma.agentRun.findFirst({
      where: {
        conversationId: args.conversationId,
        status: { in: [AgentRunStatus.PENDING, AgentRunStatus.RUNNING] },
      },
    });
    if (running) {
      return { eligible: false, reason: "run_in_progress" };
    }

    return { eligible: true };
  }
}
