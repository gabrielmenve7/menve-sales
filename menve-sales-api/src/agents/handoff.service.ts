import { Injectable } from "@nestjs/common";
import { ConversationQualificationMode } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type HandoffReason =
  | "MEET_SCHEDULED"
  | "MANUAL_TAKEOVER"
  | "OPT_OUT"
  | "AI_ERROR"
  | "HUMAN_REQUESTED";

@Injectable()
export class HandoffService {
  constructor(private readonly prisma: PrismaService) {}

  async completeQualification(args: {
    conversationId: string;
    tenantId: string;
    reason: HandoffReason;
    assignedUserId?: string | null;
  }) {
    const mode =
      args.reason === "MEET_SCHEDULED"
        ? ConversationQualificationMode.COMPLETED
        : ConversationQualificationMode.HUMAN_HANDOFF;

    await this.prisma.conversation.update({
      where: { id: args.conversationId },
      data: {
        qualificationMode: mode,
        aiPausedAt: new Date(),
        handoffAt: new Date(),
        handoffReason: args.reason,
        ...(args.assignedUserId
          ? { assignedUserId: args.assignedUserId }
          : {}),
      },
    });
  }

  async pauseAi(conversationId: string, reason: HandoffReason) {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        qualificationMode: ConversationQualificationMode.AI_PAUSED,
        aiPausedAt: new Date(),
        handoffReason: reason,
      },
    });
  }
}
