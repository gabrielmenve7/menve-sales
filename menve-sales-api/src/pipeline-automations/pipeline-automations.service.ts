import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/request-user";
import { assertCanConfigureTenant } from "../common/rbac";
import {
  automationActionsSchema,
  createPipelineAutomationRuleSchema,
  triggerFilterSchema,
  updatePipelineAutomationRuleSchema,
} from "./pipeline-automation.dto";

@Injectable()
export class PipelineAutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertPipelineInTenant(tenantId: string, pipelineId: string) {
    const p = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException("Funil não encontrado");
  }

  private async assertStagesBelongToPipeline(
    tenantId: string,
    pipelineId: string,
    stageIds: string[],
  ) {
    if (stageIds.length === 0) return;
    const stages = await this.prisma.stage.findMany({
      where: {
        id: { in: stageIds },
        pipelineId,
        pipeline: { tenantId },
      },
      select: { id: true },
    });
    if (stages.length !== new Set(stageIds).size) {
      throw new BadRequestException("Etapa inválida para este funil");
    }
  }

  private collectStageIdsFromRule(
    triggerFilter: Prisma.JsonValue | null | undefined,
    actions: Prisma.JsonValue,
  ): string[] {
    const ids: string[] = [];
    const tf = triggerFilterSchema.safeParse(triggerFilter);
    if (tf.success && tf.data) {
      if (tf.data.toStageId) ids.push(tf.data.toStageId);
      if (tf.data.fromStageId) ids.push(tf.data.fromStageId);
    }
    const parsed = automationActionsSchema.safeParse(actions);
    if (parsed.success) {
      for (const a of parsed.data) {
        if (a.type === "MOVE_TO_STAGE") ids.push(a.stageId);
      }
    }
    return ids;
  }

  async list(tenantId: string, pipelineId: string) {
    await this.assertPipelineInTenant(tenantId, pipelineId);
    return this.prisma.pipelineAutomationRule.findMany({
      where: { tenantId, pipelineId },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });
  }

  async getOne(tenantId: string, pipelineId: string, ruleId: string) {
    await this.assertPipelineInTenant(tenantId, pipelineId);
    const rule = await this.prisma.pipelineAutomationRule.findFirst({
      where: { id: ruleId, tenantId, pipelineId },
    });
    if (!rule) throw new NotFoundException("Regra não encontrada");
    return rule;
  }

  async create(
    u: RequestUser,
    pipelineId: string,
    body: unknown,
  ) {
    assertCanConfigureTenant(u.role);
    await this.assertPipelineInTenant(u.tenantId, pipelineId);
    const data = createPipelineAutomationRuleSchema.parse(body);
    const stageIds = this.collectStageIdsFromRule(
      data.triggerFilter ?? null,
      data.actions,
    );
    await this.assertStagesBelongToPipeline(
      u.tenantId,
      pipelineId,
      stageIds,
    );
    return this.prisma.pipelineAutomationRule.create({
      data: {
        tenantId: u.tenantId,
        pipelineId,
        name: data.name.trim(),
        enabled: data.enabled ?? true,
        sortOrder: data.sortOrder ?? 0,
        triggerType: data.triggerType,
        triggerFilter: data.triggerFilter
          ? (data.triggerFilter as Prisma.InputJsonValue)
          : undefined,
        actions: data.actions as Prisma.InputJsonValue,
        createdByUserId: u.userId,
      },
    });
  }

  async update(
    u: RequestUser,
    pipelineId: string,
    ruleId: string,
    body: unknown,
  ) {
    assertCanConfigureTenant(u.role);
    await this.getOne(u.tenantId, pipelineId, ruleId);
    const patch = updatePipelineAutomationRuleSchema.parse(body);
    const existing = await this.prisma.pipelineAutomationRule.findFirst({
      where: { id: ruleId, tenantId: u.tenantId, pipelineId },
    });
    if (!existing) throw new NotFoundException();
    const nextFilter =
      patch.triggerFilter !== undefined
        ? patch.triggerFilter
        : (existing.triggerFilter as Record<string, unknown> | null);
    const nextActions =
      patch.actions !== undefined ? patch.actions : existing.actions;
    const stageIds = this.collectStageIdsFromRule(
      nextFilter as Prisma.JsonValue | null | undefined,
      nextActions,
    );
    await this.assertStagesBelongToPipeline(
      u.tenantId,
      pipelineId,
      stageIds,
    );
    return this.prisma.pipelineAutomationRule.update({
      where: { id: ruleId },
      data: {
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.triggerType !== undefined
          ? { triggerType: patch.triggerType }
          : {}),
        ...(patch.triggerFilter !== undefined
          ? {
              triggerFilter:
                patch.triggerFilter === null
                  ? Prisma.JsonNull
                  : (patch.triggerFilter as Prisma.InputJsonValue),
            }
          : {}),
        ...(patch.actions !== undefined
          ? { actions: patch.actions as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async remove(u: RequestUser, pipelineId: string, ruleId: string) {
    assertCanConfigureTenant(u.role);
    await this.getOne(u.tenantId, pipelineId, ruleId);
    await this.prisma.pipelineAutomationRule.delete({
      where: { id: ruleId },
    });
    return { ok: true as const };
  }

  async listRuns(
    tenantId: string,
    pipelineId: string,
    ruleId: string,
    take = 30,
  ) {
    await this.getOne(tenantId, pipelineId, ruleId);
    return this.prisma.pipelineAutomationRun.findMany({
      where: { tenantId, ruleId },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, take)),
    });
  }
}
