import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import {
  PipelineAutomationRunStatus,
  PipelineAutomationTriggerType,
} from "@prisma/client";
import { DealsService } from "../deals/deals.service";
import { PrismaService } from "../prisma/prisma.service";
import { PIPELINE_AUTOMATION_MAX_DEPTH } from "./pipeline-automation.constants";
import { automationActionsSchema } from "./pipeline-automation.dto";
import type { Prisma } from "@prisma/client";

type StageEventCtx = {
  tenantId: string;
  actorUserId: string;
  dealId: string;
  pipelineId: string;
  fromStageId: string;
  toStageId: string;
  depth: number;
};

type SimpleDealCtx = {
  tenantId: string;
  actorUserId: string;
  dealId: string;
  pipelineId: string;
  depth: number;
};

@Injectable()
export class PipelineAutomationEngineService {
  private readonly log = new Logger(PipelineAutomationEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DealsService))
    private readonly dealsService: DealsService,
  ) {}

  private async loadEnabledRules(tenantId: string, pipelineId: string) {
    return this.prisma.pipelineAutomationRule.findMany({
      where: { tenantId, pipelineId, enabled: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  private filterMatches(
    triggerType: PipelineAutomationTriggerType,
    filter: Prisma.JsonValue | null,
    event:
      | { kind: "created" }
      | { kind: "stage"; fromStageId: string; toStageId: string }
      | { kind: "won" }
      | { kind: "lost" },
  ): boolean {
    const f = (filter ?? {}) as {
      toStageId?: string;
      fromStageId?: string;
    };
    switch (triggerType) {
      case PipelineAutomationTriggerType.DEAL_CREATED:
        return event.kind === "created";
      case PipelineAutomationTriggerType.DEAL_ENTERED_STAGE:
        if (event.kind !== "stage") return false;
        if (f.toStageId && f.toStageId !== event.toStageId) return false;
        return true;
      case PipelineAutomationTriggerType.DEAL_LEFT_STAGE:
        if (event.kind !== "stage") return false;
        if (f.fromStageId && f.fromStageId !== event.fromStageId) return false;
        return true;
      case PipelineAutomationTriggerType.DEAL_MARKED_WON:
        return event.kind === "won";
      case PipelineAutomationTriggerType.DEAL_MARKED_LOST:
        return event.kind === "lost";
      default:
        return false;
    }
  }

  private async recordRun(
    tenantId: string,
    ruleId: string,
    dealId: string,
    triggerType: PipelineAutomationTriggerType,
    status: PipelineAutomationRunStatus,
    errorMessage?: string,
    executedActions?: Prisma.InputJsonValue,
  ) {
    await this.prisma.pipelineAutomationRun.create({
      data: {
        tenantId,
        ruleId,
        dealId,
        triggerType,
        status,
        errorMessage: errorMessage ?? null,
        executedActions: executedActions ?? undefined,
      },
    });
  }

  private async executeRule(
    rule: {
      id: string;
      tenantId: string;
      pipelineId: string;
      triggerType: PipelineAutomationTriggerType;
      actions: Prisma.JsonValue;
    },
    dealId: string,
    actorUserId: string,
    matchedTriggerType: PipelineAutomationTriggerType,
    depth: number,
  ): Promise<void> {
    const parsed = automationActionsSchema.safeParse(rule.actions);
    if (!parsed.success) {
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.FAILED,
        "Ações da regra inválidas",
      );
      return;
    }

    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId: rule.tenantId, pipelineId: rule.pipelineId },
      select: { id: true, stageId: true, status: true },
    });
    if (!deal) {
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.FAILED,
        "Oportunidade não encontrada",
      );
      return;
    }

    const requireOpen =
      matchedTriggerType === PipelineAutomationTriggerType.DEAL_CREATED ||
      matchedTriggerType === PipelineAutomationTriggerType.DEAL_ENTERED_STAGE ||
      matchedTriggerType === PipelineAutomationTriggerType.DEAL_LEFT_STAGE;

    if (requireOpen && deal.status !== "OPEN") {
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.SKIPPED,
        undefined,
        { reason: "deal_not_open" } as unknown as Prisma.InputJsonValue,
      );
      return;
    }

    let currentStageId = deal.stageId;
    const executed: Record<string, unknown>[] = [];
    try {
      for (const action of parsed.data) {
        if (action.type === "MOVE_TO_STAGE") {
          if (currentStageId === action.stageId) {
            executed.push({
              type: action.type,
              stageId: action.stageId,
              result: "already_on_stage",
            });
            continue;
          }
          await this.dealsService.moveStage(
            rule.tenantId,
            actorUserId,
            dealId,
            action.stageId,
            { automationDepth: depth + 1 },
          );
          executed.push({
            type: action.type,
            stageId: action.stageId,
            result: "moved",
          });
          const refreshed = await this.prisma.deal.findFirst({
            where: { id: dealId, tenantId: rule.tenantId },
            select: { stageId: true },
          });
          if (refreshed) currentStageId = refreshed.stageId;
        }
      }

      const allNoOp = executed.every(
        (e) => e.result === "already_on_stage",
      );
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        allNoOp && executed.length > 0
          ? PipelineAutomationRunStatus.SKIPPED
          : PipelineAutomationRunStatus.SUCCESS,
        undefined,
        executed as unknown as Prisma.InputJsonValue,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`Automation rule ${rule.id} failed: ${msg}`);
      await this.recordRun(
        rule.tenantId,
        rule.id,
        dealId,
        matchedTriggerType,
        PipelineAutomationRunStatus.FAILED,
        msg,
        executed as unknown as Prisma.InputJsonValue,
      );
    }
  }

  async afterDealCreated(ctx: SimpleDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event = { kind: "created" as const };
    for (const rule of rules) {
      if (rule.triggerType !== PipelineAutomationTriggerType.DEAL_CREATED)
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_CREATED,
        ctx.depth,
      );
    }
  }

  async afterDealStageChanged(ctx: StageEventCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event = {
      kind: "stage" as const,
      fromStageId: ctx.fromStageId,
      toStageId: ctx.toStageId,
    };
    for (const rule of rules) {
      if (
        rule.triggerType !==
          PipelineAutomationTriggerType.DEAL_ENTERED_STAGE &&
        rule.triggerType !== PipelineAutomationTriggerType.DEAL_LEFT_STAGE
      ) {
        continue;
      }
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        rule.triggerType,
        ctx.depth,
      );
    }
  }

  async afterDealMarkedWon(ctx: SimpleDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event = { kind: "won" as const };
    for (const rule of rules) {
      if (rule.triggerType !== PipelineAutomationTriggerType.DEAL_MARKED_WON)
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_MARKED_WON,
        ctx.depth,
      );
    }
  }

  async afterDealMarkedLost(ctx: SimpleDealCtx): Promise<void> {
    if (ctx.depth >= PIPELINE_AUTOMATION_MAX_DEPTH) return;
    const rules = await this.loadEnabledRules(ctx.tenantId, ctx.pipelineId);
    const event = { kind: "lost" as const };
    for (const rule of rules) {
      if (rule.triggerType !== PipelineAutomationTriggerType.DEAL_MARKED_LOST)
        continue;
      if (!this.filterMatches(rule.triggerType, rule.triggerFilter, event))
        continue;
      await this.executeRule(
        rule,
        ctx.dealId,
        ctx.actorUserId,
        PipelineAutomationTriggerType.DEAL_MARKED_LOST,
        ctx.depth,
      );
    }
  }
}
