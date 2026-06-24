import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AgentRunStatus,
  ConversationQualificationMode,
  OutreachRecipientStatus,
} from "@prisma/client";
import { HandoffService } from "./handoff.service";
import { GabrielOrchestratorService } from "./gabriel-orchestrator.service";
import { PrismaService } from "../prisma/prisma.service";
import { SkillSyncService } from "./skill-sync.service";

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillSync: SkillSyncService,
    private readonly orchestrator: GabrielOrchestratorService,
    private readonly handoff: HandoffService,
  ) {}

  async getGabrielConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        gabrielEnabled: true,
        gabrielModel: true,
        gabrielReplyDelayMs: true,
        name: true,
      },
    });
    if (!tenant) throw new NotFoundException();

    const agent = await this.prisma.aiAgent.findUnique({
      where: { key: "gabriel" },
    });

    const skills = agent
      ? await this.prisma.aiAgentSkill.findMany({
          where: { tenantId, agentId: agent.id },
          orderBy: { sortOrder: "asc" },
          select: {
            skillKey: true,
            version: true,
            sourcePath: true,
            sortOrder: true,
            updatedAt: true,
          },
        })
      : [];

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [activeConversations, runsCompleted, runsFailed, meetingsHandoff] =
      await Promise.all([
        this.prisma.conversation.count({
          where: {
            tenantId,
            qualificationMode: ConversationQualificationMode.AI_ACTIVE,
          },
        }),
        this.prisma.agentRun.count({
          where: {
            tenantId,
            status: AgentRunStatus.COMPLETED,
            startedAt: { gte: since },
          },
        }),
        this.prisma.agentRun.count({
          where: {
            tenantId,
            status: AgentRunStatus.FAILED,
            startedAt: { gte: since },
          },
        }),
        this.prisma.conversation.count({
          where: {
            tenantId,
            handoffReason: "MEET_SCHEDULED",
            handoffAt: { gte: since },
          },
        }),
      ]);

    return {
      agent: agent
        ? {
            id: agent.id,
            key: agent.key,
            displayName: agent.displayName,
            description: agent.description,
          }
        : null,
      config: {
        gabrielEnabled: tenant.gabrielEnabled,
        gabrielModel: tenant.gabrielModel,
        gabrielReplyDelayMs: tenant.gabrielReplyDelayMs,
      },
      skills,
      metrics: {
        activeConversations,
        runsCompleted,
        runsFailed,
        meetingsHandoff,
        periodDays: 7,
      },
    };
  }

  async updateGabrielConfig(
    tenantId: string,
    body: {
      gabrielEnabled?: boolean;
      gabrielModel?: string | null;
      gabrielReplyDelayMs?: number;
    },
  ) {
    const data: {
      gabrielEnabled?: boolean;
      gabrielModel?: string | null;
      gabrielReplyDelayMs?: number;
    } = {};

    if (typeof body.gabrielEnabled === "boolean") {
      data.gabrielEnabled = body.gabrielEnabled;
    }
    if (body.gabrielModel !== undefined) {
      data.gabrielModel = body.gabrielModel?.trim() || null;
    }
    if (typeof body.gabrielReplyDelayMs === "number") {
      data.gabrielReplyDelayMs = Math.max(0, Math.min(30_000, body.gabrielReplyDelayMs));
    }

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        gabrielEnabled: true,
        gabrielModel: true,
        gabrielReplyDelayMs: true,
      },
    });

    if (tenant.gabrielEnabled) {
      await this.skillSync.syncSkillsForTenant(tenantId);
    }

    return tenant;
  }

  async syncSkills(tenantId: string) {
    return this.skillSync.syncSkillsForTenant(tenantId);
  }

  async activateGabrielOnConversation(
    tenantId: string,
    conversationId: string,
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: {
        contactId: true,
        outreachRecipientId: true,
        outreachRecipient: { select: { status: true } },
      },
    });
    if (!conv) throw new NotFoundException("Conversa não encontrada");

    let outreachRecipientId = conv.outreachRecipientId;
    if (
      !outreachRecipientId ||
      conv.outreachRecipient?.status !== OutreachRecipientStatus.REPLIED
    ) {
      const replied = await this.prisma.outreachCampaignRecipient.findFirst({
        where: {
          contactId: conv.contactId,
          status: OutreachRecipientStatus.REPLIED,
          campaign: { tenantId },
        },
        orderBy: { repliedAt: "desc" },
        select: { id: true },
      });
      if (!replied) {
        throw new BadRequestException(
          "Gabriel só qualifica conversas com resposta a um disparo de prospecção.",
        );
      }
      outreachRecipientId = replied.id;
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { outreachRecipientId: replied.id },
      });
    }

    try {
      await this.orchestrator.activateOnConversation({
        tenantId,
        conversationId,
        contactId: conv.contactId,
        outreachRecipientId,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Não foi possível ativar o Gabriel",
      );
    }

    return { ok: true as const };
  }

  async takeoverConversation(
    tenantId: string,
    userId: string,
    conversationId: string,
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (!conv) throw new NotFoundException("Conversa não encontrada");

    if (
      conv.qualificationMode !== ConversationQualificationMode.AI_ACTIVE &&
      conv.qualificationMode !== ConversationQualificationMode.AI_PAUSED
    ) {
      throw new BadRequestException(
        "Esta conversa não está em qualificação pela IA",
      );
    }

    await this.handoff.completeQualification({
      conversationId,
      tenantId,
      reason: "MANUAL_TAKEOVER",
      assignedUserId: userId,
    });

    return { ok: true as const };
  }
}
