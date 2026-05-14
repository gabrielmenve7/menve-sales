import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ActivityType, CustomFieldEntity, type Prisma } from "@prisma/client";
import { z } from "zod";
import { coerceCustomFieldValue } from "../custom-fields/custom-field-coerce";
import {
  findContactCustomFieldDefinitions,
  findDealCustomFieldDefinitions,
} from "../custom-fields/custom-fields-load.util";
import { PIPELINE_AUTOMATION_MAX_DEPTH } from "../pipeline-automations/pipeline-automation.constants";
import { PipelineAutomationEngineService } from "../pipeline-automations/pipeline-automation-engine.service";
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

const dealItemSchema = z.object({
  /** Opcional para suportar item “avulso” não vinculado a `Product`. */
  productId: z.string().min(1).nullable().optional(),
  productName: z.string().min(1).max(200),
  quantity: z.number().finite().min(0).max(1e9),
  unitPrice: z.number().finite().min(0).max(1e11),
});

const replaceDealItemsSchema = z.object({
  items: z.array(dealItemSchema).max(200),
});

/** Metadado para o front renderizar ícones/pílulas (prefixo em `Activity.description`). */
const MENVE_ACTIVITY_META_PREFIX = "__MENVE_META__:";

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => PipelineAutomationEngineService))
    private readonly pipelineAutomationEngine?: PipelineAutomationEngineService,
  ) {}

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

  /** Mesmo critério do Inbox / `ensureConversationForContact` (WhatsApp). */
  private contactHasPhoneForInbox(phone: string | null | undefined): boolean {
    return Boolean(phone?.trim());
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
    opts?: { automationDepth?: number },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      select: {
        id: true,
        contactId: true,
        pipelineId: true,
        customData: true,
      },
    });
    if (!deal) throw new BadRequestException("Deal não encontrado");

    const valueKeys = Object.keys(values);
    if (valueKeys.length === 0) {
      return { ok: true as const };
    }

    /** Só definições dos campos enviados + obrigatórios (evita carregar dezenas de CF a cada blur). */
    const fields = await this.prisma.customField.findMany({
      where: {
        tenantId,
        entity: CustomFieldEntity.DEAL,
        OR: [{ key: { in: valueKeys } }, { required: true }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const prev = (deal.customData as Record<string, unknown> | null) ?? {};
    const merged: Record<string, unknown> = { ...prev };
    const changedLabels: string[] = [];
    const automationChanges: {
      fieldKey: string;
      fromValue: unknown;
      toValue: unknown;
    }[] = [];

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
          automationChanges.push({
            fieldKey: f.key,
            fromValue: before,
            toValue: undefined,
          });
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
          automationChanges.push({
            fieldKey: f.key,
            fromValue: before,
            toValue: next,
          });
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

    const autoDepth = opts?.automationDepth ?? 0;
    if (this.pipelineAutomationEngine && automationChanges.length > 0) {
      for (const ch of automationChanges) {
        try {
          await this.pipelineAutomationEngine.afterDealCustomFieldChanged({
            tenantId,
            actorUserId,
            dealId,
            pipelineId: deal.pipelineId,
            fieldKey: ch.fieldKey,
            fromValue: ch.fromValue,
            toValue: ch.toValue,
            depth: autoDepth,
          });
        } catch {
          /* ignore */
        }
      }
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
      if (this.pipelineAutomationEngine) {
        try {
          await this.pipelineAutomationEngine.afterDealAssigneeRemoved({
            tenantId,
            actorUserId,
            dealId,
            pipelineId: deal.pipelineId,
            depth: 0,
          });
        } catch {
          /* ignore */
        }
      }
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
    if (this.pipelineAutomationEngine) {
      try {
        await this.pipelineAutomationEngine.afterDealAssigneeAssigned({
          tenantId,
          actorUserId,
          dealId,
          pipelineId: deal.pipelineId,
          depth: 0,
        });
      } catch {
        /* ignore */
      }
    }
    return { ok: true as const };
  }

  async moveStage(
    tenantId: string,
    actorUserId: string,
    dealId: string,
    stageId: string,
    opts?: { automationDepth?: number },
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
    const oldStageId = deal.stageId;
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
    const parentDepth = opts?.automationDepth ?? 0;
    if (
      parentDepth < PIPELINE_AUTOMATION_MAX_DEPTH &&
      this.pipelineAutomationEngine
    ) {
      try {
        await this.pipelineAutomationEngine.afterDealStageChanged({
          tenantId,
          actorUserId,
          dealId,
          pipelineId: deal.pipelineId,
          fromStageId: oldStageId,
          toStageId: stageId,
          depth: parentDepth,
        });
      } catch {
        /* automação não deve falhar a requisição do usuário */
      }
    }
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
    if (this.pipelineAutomationEngine) {
      try {
        const contact = await this.prisma.contact.findFirst({
          where: { id: deal.contactId, tenantId },
          select: { campaignSourceId: true },
        });
        await this.pipelineAutomationEngine.afterDealCreated({
          tenantId,
          actorUserId,
          dealId: deal.id,
          pipelineId: deal.pipelineId,
          campaignSourceId: contact?.campaignSourceId ?? null,
          depth: 0,
        });
      } catch {
        /* ignore */
      }
    }
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
    if (this.pipelineAutomationEngine) {
      try {
        await this.pipelineAutomationEngine.afterDealMarkedWon({
          tenantId,
          actorUserId,
          dealId,
          pipelineId: deal.pipelineId,
          depth: 0,
        });
      } catch {
        /* ignore */
      }
    }
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
    if (this.pipelineAutomationEngine) {
      try {
        await this.pipelineAutomationEngine.afterDealMarkedLost({
          tenantId,
          actorUserId,
          dealId: parsed.dealId,
          pipelineId: deal.pipelineId,
          depth: 0,
        });
      } catch {
        /* ignore */
      }
    }
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
   * Lista os itens (produtos) de uma oportunidade. Recalcula o total ao listar para
   * manter `Deal.value` consistente se algum item foi alterado fora do CRUD.
   */
  async listItems(tenantId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true },
    });
    if (!deal) throw new NotFoundException();
    const items = await this.prisma.dealItem.findMany({
      where: { tenantId, dealId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      quantity: Number(it.quantity),
      unitPrice: Number(it.unitPrice),
      sortOrder: it.sortOrder,
    }));
  }

  /**
   * Substitui todos os itens do deal por `input.items` (estratégia mais simples para o front
   * que envia o estado completo do bloco “Produtos”). Atualiza `Deal.value` com a soma.
   */
  async replaceItems(tenantId: string, dealId: string, input: unknown) {
    const data = replaceDealItemsSchema.parse(input);
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId },
      select: { id: true },
    });
    if (!deal) throw new NotFoundException();

    const productIds = Array.from(
      new Set(
        data.items
          .map((it) => it.productId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const validProductIds = new Set<string>();
    if (productIds.length > 0) {
      const found = await this.prisma.product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: { id: true },
      });
      for (const p of found) validProductIds.add(p.id);
    }

    const total = data.items.reduce(
      (acc, it) => acc + it.quantity * it.unitPrice,
      0,
    );

    await this.prisma.$transaction([
      this.prisma.dealItem.deleteMany({ where: { tenantId, dealId } }),
      ...data.items.map((it, idx) =>
        this.prisma.dealItem.create({
          data: {
            tenantId,
            dealId,
            productId:
              it.productId && validProductIds.has(it.productId)
                ? it.productId
                : null,
            productName: it.productName.trim(),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            sortOrder: idx,
          },
        }),
      ),
      this.prisma.deal.update({
        where: { id: dealId },
        data: { value: data.items.length > 0 ? total : null },
      }),
    ]);

    return { ok: true as const, total };
  }

  /**
   * Próximo deal OPEN na mesma etapa — mesma sequência do quadro (topo → base),
   * apenas entre contatos com telefone (atendíveis no Inbox / WhatsApp).
   * Fila circular: no último card elegível, o próximo é o do topo.
   */
  async nextOpenDealInSameStageQueue(tenantId: string, dealId: string) {
    const current = await this.prisma.deal.findFirst({
      where: { id: dealId, tenantId, status: "OPEN" },
      select: { id: true, pipelineId: true, stageId: true },
    });
    if (!current) {
      return {
        next: null,
        queueMeta: { position: 0, total: 0 },
      };
    }

    const pipelineDeals = await this.prisma.deal.findMany({
      where: {
        tenantId,
        pipelineId: current.pipelineId,
        status: "OPEN",
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: {
        id: true,
        contactId: true,
        stageId: true,
        contact: { select: { phone: true } },
      },
    });

    const pipelineDealsInbox = pipelineDeals.filter((d) =>
      this.contactHasPhoneForInbox(d.contact.phone),
    );

    const stageDeals = pipelineDealsInbox.filter(
      (d) => d.stageId === current.stageId,
    );
    const total = stageDeals.length;
    const idx = stageDeals.findIndex((d) => d.id === dealId);

    if (idx < 0) {
      return {
        next: null,
        queueMeta: { position: 0, total },
      };
    }

    if (total <= 1) {
      return {
        next: null,
        queueMeta: { position: idx + 1, total },
      };
    }

    const nextIdx = (idx + 1) % total;
    const next = stageDeals[nextIdx]!;
    return {
      next: { dealId: next.id, contactId: next.contactId },
      queueMeta: { position: idx + 1, total },
    };
  }
}
