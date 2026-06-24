import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { OutreachRecipientStatus } from "@prisma/client";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";
import { z } from "zod";

export const DEFAULT_LEAD_SCORING_RULES = {
  hasWhatsapp: 10,
  hasWebsite: 5,
  ratingAbove4: 15,
  replied: 30,
} as const;

const rulesSchema = z.object({
  hasWhatsapp: z.number().int().min(0).max(1000).optional(),
  hasWebsite: z.number().int().min(0).max(1000).optional(),
  ratingAbove4: z.number().int().min(0).max(1000).optional(),
  replied: z.number().int().min(0).max(1000).optional(),
});

function mergedRules(stored: unknown) {
  const parsed = rulesSchema.safeParse(stored ?? {});
  const custom = parsed.success ? parsed.data : {};
  return { ...DEFAULT_LEAD_SCORING_RULES, ...custom };
}

@Injectable()
export class LeadScoringService {
  constructor(private readonly prisma: PrismaService) {}

  async getRules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { leadScoringRules: true },
    });
    if (!tenant) throw new NotFoundException();
    return mergedRules(tenant.leadScoringRules);
  }

  async putRules(u: RequestUser, raw: unknown) {
    assertCanConfigureTenant(u.role);
    const data = rulesSchema.parse(raw);
    await this.prisma.tenant.update({
      where: { id: u.tenantId },
      data: { leadScoringRules: data },
    });
    return mergedRules(data);
  }

  private scoreContact(
    contact: {
      phone: string | null;
      customData: unknown;
    },
    replied: boolean,
    rules: ReturnType<typeof mergedRules>,
  ): number {
    let score = 0;
    const custom = (contact.customData as Record<string, unknown> | null) ?? {};

    if (contact.phone?.trim()) score += rules.hasWhatsapp;
    const website =
      typeof custom.website === "string" ? custom.website.trim() : "";
    if (website) score += rules.hasWebsite;

    const rating =
      typeof custom.googleRating === "number"
        ? custom.googleRating
        : Number(custom.googleRating);
    if (Number.isFinite(rating) && rating > 4) score += rules.ratingAbove4;

    if (replied) score += rules.replied;
    return score;
  }

  async recalculate(tenantId: string) {
    const rules = await this.getRules(tenantId);
    const contacts = await this.prisma.contact.findMany({
      where: { tenantId },
      select: { id: true, phone: true, customData: true },
    });

    const repliedContactIds = new Set(
      (
        await this.prisma.outreachCampaignRecipient.findMany({
          where: {
            status: OutreachRecipientStatus.REPLIED,
            campaign: { tenantId },
            contactId: { not: null },
          },
          select: { contactId: true },
        })
      )
        .map((r) => r.contactId)
        .filter((id): id is string => Boolean(id)),
    );

    const now = new Date();
    let updated = 0;
    for (const c of contacts) {
      const score = this.scoreContact(c, repliedContactIds.has(c.id), rules);
      await this.prisma.contact.update({
        where: { id: c.id },
        data: { leadScore: score, leadScoreUpdatedAt: now },
      });
      updated += 1;
    }

    return { updated, rules };
  }

  async recalculateOne(tenantId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true, phone: true, customData: true },
    });
    if (!contact) throw new BadRequestException("Contato não encontrado");

    const rules = await this.getRules(tenantId);
    const replied = Boolean(
      await this.prisma.outreachCampaignRecipient.findFirst({
        where: {
          contactId,
          status: OutreachRecipientStatus.REPLIED,
          campaign: { tenantId },
        },
        select: { id: true },
      }),
    );
    const score = this.scoreContact(contact, replied, rules);
    await this.prisma.contact.update({
      where: { id: contactId },
      data: { leadScore: score, leadScoreUpdatedAt: new Date() },
    });
    return { contactId, score };
  }
}
