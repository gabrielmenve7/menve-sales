import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ActivityType, type Prisma } from "@prisma/client";
import { z } from "zod";
import { coerceCustomFieldValue } from "../custom-fields/custom-field-coerce";
import {
  findContactCustomFieldDefinitions,
  findDealCustomFieldDefinitions,
} from "../custom-fields/custom-fields-load.util";
import { PrismaService } from "../prisma/prisma.service";

const dealSchema = z.object({
  contactId: z.string(),
  pipelineId: z.string(),
  stageId: z.string(),
  title: z.string().min(1),
  value: z.number().optional(),
});

const lostSchema = z.object({
  dealId: z.string(),
  lostReason: z.string().min(2).max(500),
});

const patchDealSchema = z.object({
  assignedToId: z.string().min(1).nullable().optional(),
  value: z.number().nullable().optional(),
  title: z.string().min(1).max(500).optional(),
});

/** Metadado para o front renderizar ícones/pílulas (prefixo em `Activity.description`). */
const MENVE_ACTIVITY_META_PREFIX = "__MENVE_META__:";

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private metaDescription(payload: Record<string, unknown>): string {
    return MENVE_ACTIVITY_META_PREFIX + JSON.stringify(payload);
  }

  private userActivityLabel(u: {
    name: string | null;
    email: string;
  } | null): string {
    if (!u) return "";
    const n = u.name?.trim();
    if (n) return n;
    return u.email?.trim() ?? "";
  }

  async getById(tenantId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      include: {
        contact: {
          include: {
            campaignSource: true,
            contactTags: { include: { tag: true } },
          },
        },
        stage: true,
        pipeline: {
          include: {
            stages: { orderBy: { sortOrder: "asc" } },
          },
        },
        dealTags: { include: { tag: true } },
        assignedTo: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });
    if (!deal) throw new NotFoundException();
    const [
      activities,
      contactCustomFields,
      dealCustomFields,
      allTags,
      campaignSources,
    ] = await Promise.all([
      this.prisma.activity.findMany({
        where: { tenantId, dealId },
        orderBy: { createdAt: "desc" },
        take: 80,
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      findContactCustomFieldDefinitions(this.prisma, tenantId),
      findDealCustomFieldDefinitions(this.prisma, tenantId),
      this.prisma.tag.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      }),
      this.prisma.campaignSource.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      deal,
      activities,
      contactCustomFields,
      dealCustomFields,
      allTags,
      campaignSources,
    };
  }

  async updateCustomData(
    tenantId: string,
    actorUserId: string,
    dealId: string,
    values: Record<string, unknown>,
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });
    if (!deal) throw new BadRequestException("Deal não encontrado");

    const fields = await findDealCustomFieldDefinitions(
      this.prisma,
      tenantId,
    );
    const prev = (deal.customData as Record<string, unknown> | null) ?? {};
    const merged: Record<string, unknown> = { ...prev };
    const changedLabels: string[] = [];

    for (const f of fields) {
      if (!(f.key in values)) continue;
      const raw = values[f.key];
      if (raw === undefined) continue;
      if (raw === null || raw === "") {
        if (f.required) throw new BadRequestException(`${f.name} é obrigatório`);
        const before = merged[f.key];
        delete merged[f.key];
        if (before !== undefined && before !== null && before !== "") {
          changedLabels.push(f.name);
        }
        continue;
      }
      try {
        const next = await coerceCustomFieldValue(
          this.prisma,
          tenantId,
          f.fieldType,
          raw,
          f.options,
        );
        const before = merged[f.key];
        merged[f.key] = next;
        if (JSON.stringify(before) !== JSON.stringify(next)) {
          changedLabels.push(f.name);
        }
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw new BadRequestException(
          e instanceof Error ? `${f.name}: ${e.message}` : String(e),
        );
      }
    }

    for (const f of fields) {
      if (!f.required) continue;
      const v = merged[f.key];
      if (v === undefined || v === null || v === "") {
        throw new BadRequestException(`${f.name} é obrigatório`);
      }
    }

    if (changedLabels.length > 0) {
      const title =
        changedLabels.length === 1
          ? `Campo atualizado: ${changedLabels[0]}`
          : `Campos atualizados: ${changedLabels.join(", ")}`;
      await this.prisma.$transaction([
        this.prisma.deal.update({
          where: { id: dealId },
          data: { customData: merged as Prisma.InputJsonValue },
        }),
        this.prisma.activity.create({
          data: {
            tenantId,
            userId: actorUserId,
            dealId,
            contactId: deal.contactId,
            type: ActivityType.NOTE,
            title,
            description: this.metaDescription({
              k: "deal_custom",
              fields: changedLabels,
            }),
          },
        }),
      ]);
    } else {
      await this.prisma.deal.update({
        where: { id: dealId },
        data: { customData: merged as Prisma.InputJsonValue },
      });
    }
    return { ok: true as const };
  }

  async patch(
    tenantId: string,
    actorUserId: string,
    dealId: string,
    body: unknown,
  ) {
    const data = patchDealSchema.parse(body);

    if (data.title !== undefined) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: dealId, tenantId },
      });
      if (!deal) throw new BadRequestException("Deal não encontrado");
      const next = data.title.trim();
      if (deal.title !== next) {
        await this.prisma.$transaction([
          this.prisma.deal.update({
            where: { id: dealId },
            data: { title: next },
          }),
          this.prisma.activity.create({
            data: {
              tenantId,
              userId: actorUserId,
              dealId,
              contactId: deal.contactId,
              type: ActivityType.NOTE,
              title: "Título da oportunidade atualizado",
              description: this.metaDescription({
                k: "deal_title",
                from: deal.title,
                to: next,
              }),
            },
          }),
        ]);
      }
    }

    if (data.value !== undefined) {
      const n = await this.prisma.deal.updateMany({
        where: { id: dealId, tenantId },
        data: { value: data.value },
      });
      if (n.count === 0) throw new BadRequestException("Deal não encontrado");
    }

    if (data.assignedToId === undefined) {
      return { ok: true as const };
    }

    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      include: {
        assignedTo: {
          select: { id: true, name: true, email: true, image: true },
        },
      },
    });
    if (!deal) throw new BadRequestException("Deal não encontrado");

    const prevId = deal.assignedToId;
    const prevLabel = this.userActivityLabel(deal.assignedTo);

    if (data.assignedToId === null) {
      if (prevId === null) {
        return { ok: true as const };
      }
      await this.prisma.$transaction([
        this.prisma.deal.update({
          where: { id: dealId },
          data: { assignedToId: null },
        }),
        this.prisma.activity.create({
          data: {
            tenantId,
            userId: actorUserId,
            dealId,
            contactId: deal.contactId,
            type: ActivityType.NOTE,
            title: prevLabel
              ? `Responsável removido (era ${prevLabel})`
              : "Responsável removido",
            description: this.metaDescription({
              k: "assignee",
              action: "remove",
              from: prevLabel ? { name: prevLabel } : null,
            }),
          },
        }),
      ]);
      return { ok: true as const };
    }

    const nextUser = await this.prisma.user.findFirst({
      where: { id: data.assignedToId, tenantId },
      select: { id: true, name: true, email: true, image: true },
    });
    if (!nextUser) throw new BadRequestException("Usuário inválido");

    if (prevId === nextUser.id) {
      return { ok: true as const };
    }

    const nextLabel = this.userActivityLabel(nextUser);
    const title = `Atribuído para ${nextLabel}`;

    await this.prisma.$transaction([
      this.prisma.deal.update({
        where: { id: dealId },
        data: { assignedToId: nextUser.id },
      }),
      this.prisma.activity.create({
        data: {
          tenantId,
          userId: actorUserId,
          dealId,
          contactId: deal.contactId,
          type: ActivityType.NOTE,
          title,
          description: this.metaDescription({
            k: "assignee",
            action: "set",
            from: prevLabel ? { name: prevLabel } : null,
            to: { name: nextLabel, id: nextUser.id },
          }),
        },
      }),
    ]);
    return { ok: true as const };
  }

  async moveStage(
    tenantId: string,
    actorUserId: string,
    dealId: string,
    stageId: string,
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      include: { pipeline: { include: { stages: true } } },
    });
    if (!deal) throw new BadRequestException("Deal não encontrado");
    const newStage = deal.pipeline.stages.find((s) => s.id === stageId);
    if (!newStage) throw new BadRequestException("Etapa inválida");
    if (deal.stageId === stageId) {
      return { ok: true as const };
    }
    const oldStage = deal.pipeline.stages.find((s) => s.id === deal.stageId);
    const fromName = oldStage?.name ?? "—";
    const title = `Movido de ${fromName} para ${newStage.name}`;

    await this.prisma.$transaction([
      this.prisma.deal.update({
        where: { id: dealId },
        data: { stageId },
      }),
      this.prisma.activity.create({
        data: {
          tenantId,
          userId: actorUserId,
          dealId,
          contactId: deal.contactId,
          type: ActivityType.NOTE,
          title,
          description: this.metaDescription({
            k: "stage_change",
            from: {
              name: fromName,
              color: oldStage?.color ?? null,
            },
            to: {
              name: newStage.name,
              color: newStage.color ?? null,
            },
          }),
        },
      }),
    ]);
    return { ok: true as const };
  }

  async create(tenantId: string, actorUserId: string, input: unknown) {
    const data = dealSchema.parse(input);
    const deal = await this.prisma.deal.create({
      data: {
        tenantId,
        contactId: data.contactId,
        pipelineId: data.pipelineId,
        stageId: data.stageId,
        title: data.title,
        value: data.value,
      },
    });
    await this.prisma.activity.create({
      data: {
        tenantId,
        userId: actorUserId,
        dealId: deal.id,
        contactId: deal.contactId,
        type: ActivityType.NOTE,
        title: `Oportunidade criada: ${data.title.trim()}`,
        description: this.metaDescription({
          k: "deal_created",
          title: data.title.trim(),
        }),
      },
    });
  }

  async markWon(tenantId: string, actorUserId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });
    if (!deal) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.deal.updateMany({
        where: { id: dealId, tenantId },
        data: { status: "WON", lostReason: null },
      }),
      this.prisma.activity.create({
        data: {
          tenantId,
          userId: actorUserId,
          dealId,
          contactId: deal.contactId,
          type: ActivityType.NOTE,
          title: "Oportunidade marcada como ganha",
          description: this.metaDescription({ k: "deal_outcome", outcome: "WON" }),
        },
      }),
    ]);
  }

  async markLost(
    tenantId: string,
    actorUserId: string,
    dealId: string,
    lostReason: string,
  ) {
    const parsed = lostSchema.parse({ dealId, lostReason });
    const deal = await this.prisma.deal.findFirst({
      where: { id: parsed.dealId, tenantId },
    });
    if (!deal) throw new NotFoundException();
    const reason = parsed.lostReason.trim();
    await this.prisma.$transaction([
      this.prisma.deal.updateMany({
        where: { id: parsed.dealId, tenantId },
        data: { status: "LOST", lostReason: reason },
      }),
      this.prisma.activity.create({
        data: {
          tenantId,
          userId: actorUserId,
          dealId,
          contactId: deal.contactId,
          type: ActivityType.NOTE,
          title: `Oportunidade marcada como perdida`,
          description: this.metaDescription({
            k: "deal_outcome",
            outcome: "LOST",
            reason,
          }),
        },
      }),
    ]);
  }

  async remove(tenantId: string, dealId: string) {
    const r = await this.prisma.deal.deleteMany({
      where: { id: dealId, tenantId },
    });
    if (r.count === 0) throw new NotFoundException();
    return { ok: true as const };
  }

  async archive(tenantId: string, actorUserId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
    });
    if (!deal) throw new NotFoundException();
    if (deal.status === "ARCHIVED") {
      return { ok: true as const };
    }
    if (deal.status !== "OPEN") {
      throw new BadRequestException(
        "Só é possível arquivar oportunidades em aberto",
      );
    }
    await this.prisma.$transaction([
      this.prisma.deal.update({
        where: { id: dealId },
        data: { status: "ARCHIVED" },
      }),
      this.prisma.activity.create({
        data: {
          tenantId,
          userId: actorUserId,
          dealId,
          contactId: deal.contactId,
          type: ActivityType.NOTE,
          title: "Oportunidade arquivada",
          description: this.metaDescription({ k: "deal_archived" }),
        },
      }),
    ]);
    return { ok: true as const };
  }

  /**
   * Próximo deal OPEN na mesma etapa — mesma sequência do quadro do funil:
   * ordena todos os OPEN do funil como `getPipelineDeals` e, na etapa, mantém a ordem
   * em que os cards aparecem na coluna (topo → base).
   */
  async nextOpenDealInSameStageQueue(tenantId: string, dealId: string) {
    const current = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId, status: "OPEN" },
      select: { id: true, pipelineId: true, stageId: true },
    });
    if (!current) {
      return { next: null };
    }

    const pipelineDeals = await this.prisma.deal.findMany({
      where: {
        tenantId,
        pipelineId: current.pipelineId,
        status: "OPEN",
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true, contactId: true, stageId: true },
    });

    const stageDeals = pipelineDeals.filter(
      (d) => d.stageId === current.stageId,
    );
    const idx = stageDeals.findIndex((d) => d.id === dealId);
    if (idx < 0 || idx >= stageDeals.length - 1) {
      return { next: null };
    }
    const next = stageDeals[idx + 1]!;
    return {
      next: { dealId: next.id, contactId: next.contactId },
    };
  }
}
