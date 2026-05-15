import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";

function parseOptionalHex(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  if (t === "") return null;
  if (!/^#[0-9A-Fa-f]{6}$/.test(t)) {
    throw new BadRequestException("Cor inválida (use #RRGGBB)");
  }
  return t;
}

function parseOptionalHexU(
  v: string | undefined | null,
): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  return parseOptionalHex(v);
}

@Injectable()
export class PipelinesService {
  constructor(private readonly prisma: PrismaService) {}

  async assertPipelineInTenant(pipelineId: string, tenantId: string) {
    const p = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
      select: { id: true },
    });
    if (!p) throw new BadRequestException("Funil inválido");
  }

  async list(tenantId: string) {
    return this.prisma.pipeline.findMany({
      where: { tenantId },
      orderBy: { sortOrder: "asc" },
      include: { stages: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async getPipelineDeals(tenantId: string, pipelineId: string) {
    const pipeline = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
      select: { id: true },
    });
    if (!pipeline) throw new BadRequestException("Funil inválido");

    const [deals, wonCount, lostCount] = await Promise.all([
      this.prisma.deal.findMany({
        where: { tenantId, pipelineId, status: "OPEN" },
        select: {
          id: true,
          tenantId: true,
          contactId: true,
          pipelineId: true,
          stageId: true,
          title: true,
          value: true,
          probability: true,
          expectedClose: true,
          status: true,
          lostReason: true,
          assignedToId: true,
          customData: true,
          createdAt: true,
          updatedAt: true,
          contact: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              company: true,
              jobTitle: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              campaignSourceId: true,
              campaignSource: {
                select: { id: true, name: true, code: true },
              },
              contactTags: {
                select: {
                  tag: {
                    select: { id: true, name: true, color: true },
                  },
                },
              },
            },
          },
          stage: {
            select: {
              id: true,
              pipelineId: true,
              name: true,
              sortOrder: true,
              probability: true,
              color: true,
            },
          },
          dealTags: {
            select: {
              dealId: true,
              tagId: true,
              tag: { select: { id: true, name: true, color: true } },
            },
          },
          assignedTo: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      }),
      this.prisma.deal.count({
        where: { tenantId, pipelineId, status: "WON" },
      }),
      this.prisma.deal.count({
        where: { tenantId, pipelineId, status: "LOST" },
      }),
    ]);

    let openSum = 0;
    for (const d of deals) {
      if (d.value != null) openSum += Number(d.value);
    }

    return {
      deals,
      stats: {
        openCount: deals.length,
        openSum,
        wonCount,
        lostCount,
      },
    };
  }

  async createPipeline(u: RequestUser, input: { name: string; color?: string | null }) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const color = parseOptionalHex(input.color ?? undefined);
    const existingCount = await this.prisma.pipeline.count({ where: { tenantId } });
    const agg = await this.prisma.pipeline.aggregate({
      where: { tenantId },
      _max: { sortOrder: true },
    });
    const nextSort = (agg._max.sortOrder ?? -1) + 1;
    const isFirst = existingCount === 0;
    const p = await this.prisma.pipeline.create({
      data: {
        tenantId,
        name: input.name.trim(),
        sortOrder: nextSort,
        isDefault: isFirst,
        color,
      },
    });
    await this.prisma.stage.create({
      data: {
        pipelineId: p.id,
        name: "Qualificação",
        sortOrder: 0,
      },
    });
  }

  private async assertStageBelongsToPipeline(
    stageId: string,
    pipelineId: string,
  ) {
    const s = await this.prisma.stage.findFirst({
      where: { id: stageId, pipelineId },
      select: { id: true },
    });
    if (!s) {
      throw new BadRequestException(
        "Etapa de ganho/perda deve pertencer a este funil.",
      );
    }
  }

  async updatePipeline(
    u: RequestUser,
    input: {
      id: string;
      name?: string;
      color?: string | null;
      wonStageId?: string | null;
      lostStageId?: string | null;
    },
  ) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    await this.assertPipelineInTenant(input.id, tenantId);
    const color =
      input.color !== undefined ? parseOptionalHexU(input.color) : undefined;

    const hasOutcome =
      input.wonStageId !== undefined || input.lostStageId !== undefined;
    if (hasOutcome) {
      const current = await this.prisma.pipeline.findFirst({
        where: { id: input.id, tenantId },
        select: { wonStageId: true, lostStageId: true },
      });
      const nextWon =
        input.wonStageId !== undefined
          ? input.wonStageId
          : current?.wonStageId ?? null;
      const nextLost =
        input.lostStageId !== undefined
          ? input.lostStageId
          : current?.lostStageId ?? null;
      if (nextWon && nextLost && nextWon === nextLost) {
        throw new BadRequestException(
          "A mesma etapa não pode ser ganho e perda ao mesmo tempo.",
        );
      }
      if (nextWon) await this.assertStageBelongsToPipeline(nextWon, input.id);
      if (nextLost)
        await this.assertStageBelongsToPipeline(nextLost, input.id);
    }

    await this.prisma.pipeline.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(input.wonStageId !== undefined
          ? { wonStageId: input.wonStageId }
          : {}),
        ...(input.lostStageId !== undefined
          ? { lostStageId: input.lostStageId }
          : {}),
      },
    });
  }

  async deletePipeline(u: RequestUser, pipelineId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    await this.assertPipelineInTenant(pipelineId, tenantId);
    const dealCount = await this.prisma.deal.count({ where: { pipelineId } });
    if (dealCount > 0) {
      throw new BadRequestException(
        "Não é possível excluir: há oportunidades neste funil.",
      );
    }
    const wasDefault = await this.prisma.pipeline.findFirst({
      where: { id: pipelineId, tenantId },
      select: { isDefault: true },
    });
    await this.prisma.pipeline.delete({ where: { id: pipelineId } });
    if (wasDefault?.isDefault) {
      const next = await this.prisma.pipeline.findFirst({
        where: { tenantId },
        orderBy: { sortOrder: "asc" },
      });
      if (next) {
        await this.prisma.pipeline.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
  }

  async setDefault(u: RequestUser, pipelineId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    await this.assertPipelineInTenant(pipelineId, tenantId);
    await this.prisma.$transaction([
      this.prisma.pipeline.updateMany({
        where: { tenantId },
        data: { isDefault: false },
      }),
      this.prisma.pipeline.update({
        where: { id: pipelineId },
        data: { isDefault: true },
      }),
    ]);
  }

  async reorderPipelines(u: RequestUser, orderedPipelineIds: string[]) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const existing = await this.prisma.pipeline.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const idSet = new Set(existing.map((e) => e.id));
    if (
      orderedPipelineIds.length !== existing.length ||
      orderedPipelineIds.some((id) => !idSet.has(id))
    ) {
      throw new BadRequestException("Ordem de funis inválida");
    }
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < orderedPipelineIds.length; i++) {
        await tx.pipeline.update({
          where: { id: orderedPipelineIds[i] },
          data: { sortOrder: 1000 + i },
        });
      }
      for (let i = 0; i < orderedPipelineIds.length; i++) {
        await tx.pipeline.update({
          where: { id: orderedPipelineIds[i] },
          data: { sortOrder: i },
        });
      }
    });
  }

  private async assertStageInTenant(stageId: string, tenantId: string) {
    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, pipeline: { tenantId } },
      select: { id: true },
    });
    if (!stage) throw new BadRequestException("Etapa inválida");
  }

  async createStage(
    u: RequestUser,
    input: {
      pipelineId: string;
      name: string;
      probability?: number | null;
      color?: string | null;
    },
  ) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    await this.assertPipelineInTenant(input.pipelineId, tenantId);
    const color = parseOptionalHexU(input.color ?? undefined);
    const agg = await this.prisma.stage.aggregate({
      where: { pipelineId: input.pipelineId },
      _max: { sortOrder: true },
    });
    const next = (agg._max.sortOrder ?? -1) + 1;
    await this.prisma.stage.create({
      data: {
        pipelineId: input.pipelineId,
        name: input.name.trim(),
        sortOrder: next,
        probability: input.probability ?? null,
        ...(color !== undefined ? { color } : {}),
      },
    });
  }

  async updateStage(
    u: RequestUser,
    input: {
      id: string;
      name?: string;
      probability?: number | null;
      color?: string | null;
    },
  ) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    await this.assertStageInTenant(input.id, tenantId);
    const color =
      input.color !== undefined ? parseOptionalHexU(input.color) : undefined;
    await this.prisma.stage.update({
      where: { id: input.id },
      data: {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.probability !== undefined
          ? { probability: input.probability }
          : {}),
        ...(color !== undefined ? { color } : {}),
      },
    });
  }

  async deleteStage(u: RequestUser, stageId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;

    const stage = await this.prisma.stage.findFirst({
      where: { id: stageId, pipeline: { tenantId } },
      include: {
        pipeline: {
          select: {
            stages: {
              select: { id: true, sortOrder: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    });
    if (!stage) throw new BadRequestException("Etapa inválida");

    const siblings = stage.pipeline.stages.filter((s) => s.id !== stageId);
    if (siblings.length === 0) {
      throw new BadRequestException(
        "Não é possível excluir a última etapa do funil.",
      );
    }

    /** Primeira etapa restante no Kanban (menor sortOrder). */
    const targetStageId = siblings[0]!.id;

    await this.prisma.$transaction(async (tx) => {
      await tx.pipeline.updateMany({
        where: { wonStageId: stageId },
        data: { wonStageId: null },
      });
      await tx.pipeline.updateMany({
        where: { lostStageId: stageId },
        data: { lostStageId: null },
      });
      await tx.deal.updateMany({
        where: { stageId },
        data: { stageId: targetStageId },
      });
      await tx.stage.delete({ where: { id: stageId } });
    });
  }

  async reorderStages(
    u: RequestUser,
    pipelineId: string,
    orderedStageIds: string[],
  ) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    await this.assertPipelineInTenant(pipelineId, tenantId);
    const existing = await this.prisma.stage.findMany({
      where: { pipelineId },
      select: { id: true },
    });
    const idSet = new Set(existing.map((s) => s.id));
    if (
      orderedStageIds.length !== existing.length ||
      orderedStageIds.some((id) => !idSet.has(id))
    ) {
      throw new BadRequestException("Ordem de etapas inválida");
    }
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < orderedStageIds.length; i++) {
        await tx.stage.update({
          where: { id: orderedStageIds[i] },
          data: { sortOrder: 1000 + i },
        });
      }
      for (let i = 0; i < orderedStageIds.length; i++) {
        await tx.stage.update({
          where: { id: orderedStageIds[i] },
          data: { sortOrder: i },
        });
      }
    });
  }
}
