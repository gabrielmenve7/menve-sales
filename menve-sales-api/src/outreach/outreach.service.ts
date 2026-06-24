import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import {
  OutreachCampaignStatus,
  OutreachRecipientStatus,
  type OutreachCampaign,
  type WhatsAppConnection,
} from "@prisma/client";
import { z } from "zod";
import { PipelineAutomationEngineService } from "../pipeline-automations/pipeline-automation-engine.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { resolveBrazilianPhoneFromCandidates } from "../prospecting/phone-utils";
import { createWhatsAppProvider } from "../whatsapp/factory";
import { renderOutreachTemplate } from "./outreach-template";

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  listId: z.string().min(1),
  connectionId: z.string().min(1),
  templateBody: z.string().min(1).max(8000),
  scheduledAt: z.string().datetime().optional(),
});

function phoneDigits(raw: string) {
  return raw.replace(/\D/g, "");
}

function normalizeOutreachPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10) return `+${digits}`;
  return raw.trim();
}

@Injectable()
export class OutreachService {
  private readonly log = new Logger(OutreachService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => PipelineAutomationEngineService))
    private readonly automationEngine?: PipelineAutomationEngineService,
  ) {}

  async ensureOutreachSource(tenantId: string) {
    let s = await this.prisma.campaignSource.findFirst({
      where: { tenantId, code: "outreach" },
    });
    if (!s) {
      s = await this.prisma.campaignSource.create({
        data: {
          tenantId,
          name: "Disparo",
          code: "outreach",
        },
      });
    }
    return s;
  }

  listCampaigns(tenantId: string) {
    return this.prisma.outreachCampaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        connection: { select: { id: true, name: true, provider: true } },
        list: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { recipients: true } },
      },
    });
  }

  async getCampaign(tenantId: string, id: string) {
    const campaign = await this.prisma.outreachCampaign.findFirst({
      where: { id, tenantId },
      include: {
        connection: { select: { id: true, name: true, provider: true } },
        list: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { recipients: true } },
      },
    });
    if (!campaign) throw new NotFoundException();
    return campaign;
  }

  async createCampaign(u: RequestUser, raw: unknown) {
    assertCanConfigureTenant(u.role);
    const data = createCampaignSchema.parse(raw);

    const list = await this.prisma.prospectList.findFirst({
      where: { id: data.listId, tenantId: u.tenantId },
    });
    if (!list) throw new BadRequestException("Lista não encontrada");

    const connection = await this.prisma.whatsAppConnection.findFirst({
      where: { id: data.connectionId, tenantId: u.tenantId },
    });
    if (!connection) {
      throw new BadRequestException("Conexão WhatsApp não encontrada");
    }

    const scheduledAt = data.scheduledAt
      ? new Date(data.scheduledAt)
      : null;

    return this.prisma.outreachCampaign.create({
      data: {
        tenantId: u.tenantId,
        listId: data.listId,
        connectionId: data.connectionId,
        name: data.name.trim(),
        templateBody: data.templateBody,
        createdById: u.userId,
        scheduledAt,
        status: scheduledAt
          ? OutreachCampaignStatus.SCHEDULED
          : OutreachCampaignStatus.DRAFT,
      },
      include: {
        connection: { select: { id: true, name: true, provider: true } },
        list: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { recipients: true } },
      },
    });
  }

  async startCampaign(u: RequestUser, id: string) {
    assertCanConfigureTenant(u.role);
    const campaign = await this.requireCampaign(u.tenantId, id);

    if (
      campaign.status !== OutreachCampaignStatus.DRAFT &&
      campaign.status !== OutreachCampaignStatus.PAUSED &&
      campaign.status !== OutreachCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        "Campanha não pode ser iniciada neste status",
      );
    }

    const connection = await this.prisma.whatsAppConnection.findFirst({
      where: {
        id: campaign.connectionId,
        tenantId: u.tenantId,
        isActive: true,
      },
    });
    if (!connection) {
      throw new BadRequestException(
        "Conexão WhatsApp inativa ou não encontrada",
      );
    }

    await this.syncRecipientsFromList(campaign);

    const pending = await this.prisma.outreachCampaignRecipient.count({
      where: {
        campaignId: campaign.id,
        status: OutreachRecipientStatus.PENDING,
      },
    });
    if (pending === 0) {
      throw new BadRequestException(
        "Nenhum destinatário com telefone válido na lista",
      );
    }

    return this.prisma.outreachCampaign.update({
      where: { id: campaign.id },
      data: {
        status: OutreachCampaignStatus.RUNNING,
        startedAt: campaign.startedAt ?? new Date(),
        completedAt: null,
      },
      include: {
        connection: { select: { id: true, name: true, provider: true } },
        list: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
    });
  }

  async pauseCampaign(u: RequestUser, id: string) {
    assertCanConfigureTenant(u.role);
    const campaign = await this.requireCampaign(u.tenantId, id);

    if (campaign.status !== OutreachCampaignStatus.RUNNING) {
      throw new BadRequestException("Campanha não está em execução");
    }

    return this.prisma.outreachCampaign.update({
      where: { id: campaign.id },
      data: { status: OutreachCampaignStatus.PAUSED },
      include: {
        connection: { select: { id: true, name: true, provider: true } },
        list: { select: { id: true, name: true } },
        _count: { select: { recipients: true } },
      },
    });
  }

  listRecipients(tenantId: string, campaignId: string) {
    return this.getCampaign(tenantId, campaignId).then(() =>
      this.prisma.outreachCampaignRecipient.findMany({
        where: { campaignId },
        orderBy: { createdAt: "asc" },
      }),
    );
  }

  private async requireCampaign(tenantId: string, id: string) {
    const campaign = await this.prisma.outreachCampaign.findFirst({
      where: { id, tenantId },
    });
    if (!campaign) throw new NotFoundException();
    return campaign;
  }

  private phoneFromProspectResult(result: {
    phone: string | null;
    whatsapp: string | null;
    enrichmentData: unknown;
  }): string | null {
    const enrichment =
      (result.enrichmentData as Record<string, unknown> | null) ?? null;
    const scrapedPhones: string[] = [];
    const phonesRaw = enrichment?.phones;
    if (Array.isArray(phonesRaw)) {
      for (const p of phonesRaw) {
        if (typeof p === "string" && p.trim()) scrapedPhones.push(p.trim());
      }
    }
    const enrichWa =
      typeof enrichment?.whatsapp === "string"
        ? enrichment.whatsapp.trim()
        : "";
    return resolveBrazilianPhoneFromCandidates([
      result.whatsapp,
      result.phone,
      enrichWa || undefined,
      ...scrapedPhones,
    ]);
  }

  async syncRecipientsFromList(campaign: OutreachCampaign) {
    if (!campaign.listId) return;

    const items = await this.prisma.prospectListItem.findMany({
      where: { listId: campaign.listId },
      include: {
        prospectResult: true,
        contact: { select: { id: true, name: true, phone: true, company: true } },
      },
    });

    const seenPhones = new Set(
      (
        await this.prisma.outreachCampaignRecipient.findMany({
          where: { campaignId: campaign.id },
          select: { phone: true },
        })
      ).map((r) => r.phone),
    );

    const rows: Array<{
      campaignId: string;
      phone: string;
      name: string | null;
      company: string | null;
      contactId: string | null;
    }> = [];

    for (const item of items) {
      let phone: string | null = null;
      let name: string | null = null;
      let company: string | null = null;
      let contactId: string | null = item.contactId;

      if (item.contact?.phone) {
        phone = resolveBrazilianPhoneFromCandidates([item.contact.phone]);
        name = item.contact.name;
        company = item.contact.company;
        contactId = item.contact.id;
      } else if (item.prospectResult) {
        phone = this.phoneFromProspectResult(item.prospectResult);
        name = item.prospectResult.name;
        company = item.prospectResult.name;
        contactId = item.prospectResult.contactId ?? contactId;
      }

      if (!phone || seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      rows.push({
        campaignId: campaign.id,
        phone,
        name,
        company,
        contactId,
      });
    }

    if (rows.length > 0) {
      await this.prisma.outreachCampaignRecipient.createMany({
        data: rows,
        skipDuplicates: true,
      });
    }
  }

  async ensureContactForRecipient(
    tenantId: string,
    recipient: {
      phone: string;
      name: string | null;
      company: string | null;
      contactId: string | null;
    },
  ) {
    const source = await this.ensureOutreachSource(tenantId);
    const phone = normalizeOutreachPhone(recipient.phone);

    if (recipient.contactId) {
      const existing = await this.prisma.contact.findFirst({
        where: { id: recipient.contactId, tenantId },
      });
      if (existing) return existing;
    }

    return this.prisma.contact.upsert({
      where: { tenantId_phone: { tenantId, phone } },
      create: {
        tenantId,
        name: recipient.name?.trim() || phone,
        phone,
        company: recipient.company?.trim() || null,
        utmSource: "outreach",
        campaignSourceId: source.id,
      },
      update: {},
    });
  }

  async sendToRecipient(args: {
    campaign: OutreachCampaign & { connection: WhatsAppConnection };
    recipientId: string;
    userId: string;
  }) {
    const recipient = await this.prisma.outreachCampaignRecipient.findFirst({
      where: {
        id: args.recipientId,
        campaignId: args.campaign.id,
        status: OutreachRecipientStatus.PENDING,
      },
    });
    if (!recipient) return { sent: false as const };

    if (
      recipient.nextSendAt != null &&
      recipient.nextSendAt.getTime() > Date.now()
    ) {
      return { sent: false as const };
    }

    const contact = await this.ensureContactForRecipient(args.campaign.tenantId, {
      phone: recipient.phone,
      name: recipient.name,
      company: recipient.company,
      contactId: recipient.contactId,
    });

    const text = renderOutreachTemplate(args.campaign.templateBody, {
      nome: recipient.name,
      empresa: recipient.company,
      telefone: recipient.phone,
    });

    const provider = createWhatsAppProvider(args.campaign.connection);
    const sent = await provider.sendTextMessage(recipient.phone, text);

    if (!sent.ok) {
      await this.prisma.outreachCampaignRecipient.update({
        where: { id: recipient.id },
        data: {
          status: OutreachRecipientStatus.FAILED,
          errorMessage: sent.error ?? "Falha ao enviar",
        },
      });
      return { sent: false as const, error: sent.error };
    }

    await this.prisma.outreachCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: OutreachRecipientStatus.SENT,
        sentAt: new Date(),
        contactId: contact.id,
        messageId: sent.externalId ?? null,
        errorMessage: null,
      },
    });

    return { sent: true as const };
  }

  async maybeCompleteCampaign(campaignId: string) {
    const pending = await this.prisma.outreachCampaignRecipient.count({
      where: {
        campaignId,
        status: OutreachRecipientStatus.PENDING,
      },
    });
    if (pending > 0) return;

    await this.prisma.outreachCampaign.updateMany({
      where: {
        id: campaignId,
        status: OutreachCampaignStatus.RUNNING,
      },
      data: {
        status: OutreachCampaignStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  /** Marca opt-out quando o destinatário responde "SAIR". */
  async handleInboundOptOut(
    tenantId: string,
    phone: string,
    body: string,
  ): Promise<number> {
    const normalized = normalizeOutreachPhone(phone);
    if (body.trim().toUpperCase() !== "SAIR") return 0;

    const result = await this.prisma.outreachCampaignRecipient.updateMany({
      where: {
        phone: normalized,
        status: {
          in: [
            OutreachRecipientStatus.PENDING,
            OutreachRecipientStatus.SENT,
            OutreachRecipientStatus.DELIVERED,
          ],
        },
        campaign: {
          tenantId,
          status: {
            in: [
              OutreachCampaignStatus.RUNNING,
              OutreachCampaignStatus.PAUSED,
            ],
          },
        },
      },
      data: { status: OutreachRecipientStatus.OPT_OUT },
    });
    return result.count;
  }

  /**
   * Marca destinatário de campanha como REPLIED e dispara automações PROSPECT_REPLIED
   * nos deals abertos do contato.
   */
  async handleInboundReply(args: {
    tenantId: string;
    phone: string;
    contactId: string;
    conversationId: string;
    messageId?: string;
  }): Promise<{ updated: boolean }> {
    const digits = phoneDigits(args.phone);
    if (!digits) return { updated: false };

    const recipients = await this.prisma.outreachCampaignRecipient.findMany({
      where: {
        phone: { contains: digits.slice(-11) },
        status: {
          in: [
            OutreachRecipientStatus.SENT,
            OutreachRecipientStatus.DELIVERED,
          ],
        },
        campaign: { tenantId: args.tenantId },
      },
      include: { campaign: { select: { tenantId: true } } },
      take: 20,
    });

    const recipient = recipients.find(
      (r) =>
        phoneDigits(r.phone) === digits ||
        phoneDigits(r.phone).endsWith(digits.slice(-11)),
    );
    if (!recipient) return { updated: false };

    const now = new Date();
    await this.prisma.outreachCampaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: OutreachRecipientStatus.REPLIED,
        repliedAt: now,
        contactId: args.contactId,
        conversationId: args.conversationId,
        messageId: args.messageId ?? recipient.messageId,
      },
    });

    const openDeals = await this.prisma.deal.findMany({
      where: {
        tenantId: args.tenantId,
        contactId: args.contactId,
        status: "OPEN",
      },
      select: { id: true, pipelineId: true },
    });

    const engine = this.automationEngine;
    if (engine && typeof engine.afterProspectReplied === "function") {
      for (const deal of openDeals) {
        void engine
          .afterProspectReplied({
            tenantId: args.tenantId,
            actorUserId: args.contactId,
            dealId: deal.id,
            pipelineId: deal.pipelineId,
            depth: 0,
          })
          .catch((e) => {
            this.log.warn(
              `PROSPECT_REPLIED automation failed deal=${deal.id}: ${e instanceof Error ? e.message : String(e)}`,
            );
          });
      }
    }

    return { updated: true };
  }
}
