import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AgentRunStatus,
  ConversationQualificationMode,
} from "@prisma/client";
import { HandoffService } from "./handoff.service";
import { LarissaOrchestratorService } from "./larissa-orchestrator.service";
import { PrismaService } from "../prisma/prisma.service";
import { SkillSyncService } from "./skill-sync.service";

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skillSync: SkillSyncService,
    private readonly orchestrator: LarissaOrchestratorService,
    private readonly handoff: HandoffService,
  ) {}

  async getLarissaConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        larissaEnabled: true,
        larissaModel: true,
        larissaReplyDelayMs: true,
        name: true,
      },
    });
    if (!tenant) throw new NotFoundException();

    const agent = await this.prisma.aiAgent.findUnique({
      where: { key: "larissa" },
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
        larissaEnabled: tenant.larissaEnabled,
        larissaModel: tenant.larissaModel,
        larissaReplyDelayMs: tenant.larissaReplyDelayMs,
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

  async updateLarissaConfig(
    tenantId: string,
    body: {
      larissaEnabled?: boolean;
      larissaModel?: string | null;
      larissaReplyDelayMs?: number;
    },
  ) {
    const data: {
      larissaEnabled?: boolean;
      larissaModel?: string | null;
      larissaReplyDelayMs?: number;
    } = {};

    if (typeof body.larissaEnabled === "boolean") {
      data.larissaEnabled = body.larissaEnabled;
    }
    if (body.larissaModel !== undefined) {
      data.larissaModel = body.larissaModel?.trim() || null;
    }
    if (typeof body.larissaReplyDelayMs === "number") {
      data.larissaReplyDelayMs = Math.max(0, Math.min(30_000, body.larissaReplyDelayMs));
    }

    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data,
      select: {
        larissaEnabled: true,
        larissaModel: true,
        larissaReplyDelayMs: true,
      },
    });

    if (tenant.larissaEnabled) {
      await this.skillSync.syncSkillsForTenant(tenantId);
    }

    return tenant;
  }

  async syncSkills(tenantId: string) {
    return this.skillSync.syncSkillsForTenant(tenantId);
  }

  async activateLarissaOnConversation(
    tenantId: string,
    conversationId: string,
  ) {
    const conv = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: { contactId: true },
    });
    if (!conv) throw new NotFoundException("Conversa não encontrada");

    try {
      await this.orchestrator.activateOnConversation({
        tenantId,
        conversationId,
        contactId: conv.contactId,
      });
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : "Não foi possível ativar a Larissa",
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
