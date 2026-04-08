import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CustomFieldEntity,
  PipelineAutomationTriggerType,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/request-user";
import { assertCanConfigureTenant } from "../common/rbac";
import {
  automationActionsSchema,
  createPipelineAutomationRuleSchema,
  parseCompositeTriggerFilter,
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

  private pushStageIdsFromLegacyFilter(
    ids: string[],
    f: Record<string, unknown> | null | undefined,
  ) {
    if (!f) return;
    if (typeof f.toStageId === "string" && f.toStageId)
      ids.push(f.toStageId);
    if (typeof f.fromStageId === "string" && f.fromStageId)
      ids.push(f.fromStageId);
  }

  private collectStageIdsFromRule(
    triggerFilter: unknown,
    actions: unknown,
  ): string[] {
    const ids: string[] = [];
    const comp = parseCompositeTriggerFilter(triggerFilter);
    if (comp) {
      for (const c of comp.clauses) {
        this.pushStageIdsFromLegacyFilter(
          ids,
          c.triggerFilter as Record<string, unknown> | null | undefined,
        );
      }
    } else if (triggerFilter && typeof triggerFilter === "object") {
      this.pushStageIdsFromLegacyFilter(
        ids,
        triggerFilter as Record<string, unknown>,
      );
    }
    const parsed = automationActionsSchema.safeParse(actions);
    if (parsed.success) {
      for (const a of parsed.data) {
        if (a.type === "MOVE_TO_STAGE") ids.push(a.stageId);
      }
    }
    return ids;
  }

  private collectCampaignSourceIdsFromLegacy(f: unknown): string[] {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    const raw = o.campaignSourceIds;
    if (!Array.isArray(raw)) return [];
    return raw.filter((x): x is string => typeof x === "string");
  }

  private collectCampaignSourceIdsFromFilter(triggerFilter: unknown): string[] {
    const comp = parseCompositeTriggerFilter(triggerFilter);
    if (comp) {
      const all: string[] = [];
      for (const c of comp.clauses) {
        all.push(...this.collectCampaignSourceIdsFromLegacy(c.triggerFilter));
      }
      return [...new Set(all)];
    }
    return [...new Set(this.collectCampaignSourceIdsFromLegacy(triggerFilter))];
  }

  private collectTagIdsFromFilter(triggerFilter: unknown): string[] {
    const comp = parseCompositeTriggerFilter(triggerFilter);
    if (comp) {
      const all: string[] = [];
      for (const c of comp.clauses) {
        const f = c.triggerFilter;
        if (f && typeof f === "object") {
          const t = (f as Record<string, unknown>).tagId;
          if (typeof t === "string" && t) all.push(t);
        }
      }
      return [...new Set(all)];
    }
    if (triggerFilter && typeof triggerFilter === "object") {
      const t = (triggerFilter as Record<string, unknown>).tagId;
      if (typeof t === "string" && t) return [t];
    }
    return [];
  }

  private async assertCampaignSourcesInTenant(
    tenantId: string,
    ids: string[],
  ) {
    if (ids.length === 0) return;
    const rows = await this.prisma.campaignSource.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException("Origem de campanha inválida");
    }
  }

  private async assertTagsInTenant(tenantId: string, ids: string[]) {
    if (ids.length === 0) return;
    const rows = await this.prisma.tag.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException("Tag inválida");
    }
  }

  private async assertDealCustomFieldKey(tenantId: string, key: string) {
    const f = await this.prisma.customField.findFirst({
      where: { tenantId, entity: CustomFieldEntity.DEAL, key },
      select: { id: true },
    });
    if (!f) throw new BadRequestException("Campo personalizado inválido");
  }

  private async assertTriggerFilterRefsSingleClause(
    tenantId: string,
    triggerType: PipelineAutomationTriggerType,
    triggerFilter: unknown,
  ) {
    const f =
      triggerFilter && typeof triggerFilter === "object"
        ? (triggerFilter as Record<string, unknown>)
        : undefined;
    if (
      triggerType === PipelineAutomationTriggerType.DEAL_CUSTOM_FIELD_CHANGED
    ) {
      const k = f?.customFieldKey;
      if (typeof k !== "string" || !k) {
        throw new BadRequestException(
          "Selecione o campo personalizado para este gatilho",
        );
      }
      await this.assertDealCustomFieldKey(tenantId, k);
    }
    await this.assertCampaignSourcesInTenant(
      tenantId,
      this.collectCampaignSourceIdsFromLegacy(triggerFilter),
    );
    const tagIds: string[] = [];
    if (f && typeof f.tagId === "string" && f.tagId) tagIds.push(f.tagId);
    await this.assertTagsInTenant(tenantId, tagIds);
  }

  private async assertTriggerFilterRefs(
    tenantId: string,
    triggerType: PipelineAutomationTriggerType,
    triggerFilter: unknown,
  ) {
    if (triggerType === PipelineAutomationTriggerType.COMPOSITE) {
      const comp = parseCompositeTriggerFilter(triggerFilter);
      if (!comp) {
        throw new BadRequestException("Gatilho composto inválido");
      }
      for (const c of comp.clauses) {
        await this.assertTriggerFilterRefsSingleClause(
          tenantId,
          c.triggerType,
          c.triggerFilter ?? null,
        );
      }
      return;
    }
    await this.assertTriggerFilterRefsSingleClause(
      tenantId,
      triggerType,
      triggerFilter,
    );
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
    await this.assertTriggerFilterRefs(
      u.tenantId,
      data.triggerType,
      data.triggerFilter ?? null,
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
    const stageIds = this.collectStageIdsFromRule(nextFilter, nextActions);
    await this.assertStagesBelongToPipeline(
      u.tenantId,
      pipelineId,
      stageIds,
    );
    const nextTriggerType =
      patch.triggerType ?? existing.triggerType;
    await this.assertTriggerFilterRefs(u.tenantId, nextTriggerType, nextFilter);
    const structChanged =
      patch.triggerFilter !== undefined || patch.triggerType !== undefined;
    const updated = await this.prisma.pipelineAutomationRule.update({
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
    if (structChanged) {
      await this.prisma.pipelineAutomationAndProgress.deleteMany({
        where: { ruleId },
      });
    }
    return updated;
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
