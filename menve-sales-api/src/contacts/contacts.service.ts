import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { CustomFieldEntity, Prisma } from "@prisma/client";
import { PipelineAutomationEngineService } from "../pipeline-automations/pipeline-automation-engine.service";
import { PrismaService } from "../prisma/prisma.service";
import { coerceCustomFieldValue } from "../custom-fields/custom-field-coerce";
import { findContactCustomFieldDefinitions } from "../custom-fields/custom-fields-load.util";
import { z } from "zod";
import {
  phoneDigitsOnly,
  phoneMatchCandidates,
} from "./phone-normalize.util";

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  campaignSourceId: z.string().cuid().optional(),
});

const patchContactSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  campaignSourceId: z.string().cuid().nullable().optional(),
});

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => PipelineAutomationEngineService))
    private readonly pipelineAutomationEngine?: PipelineAutomationEngineService,
  ) {}

  async listForPipeline(tenantId: string) {
    return this.prisma.contact.findMany({
      where: { tenantId },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    });
  }

  async list(tenantId: string) {
    return this.prisma.contact.findMany({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      include: {
        campaignSource: true,
        contactTags: { include: { tag: true } },
      },
    });
  }

  /**
   * Resolve contato por telefone (dígitos) para side panel / extensão.
   * Usa comparação só nos dígitos do campo `phone` no banco.
   */
  async resolveByPhone(tenantId: string, rawPhone: string) {
    const digits = phoneDigitsOnly(rawPhone);
    if (digits.length < 8) {
      throw new BadRequestException(
        "Informe um telefone com pelo menos 8 dígitos.",
      );
    }

    const candidates = phoneMatchCandidates(digits);
    let matches: Array<{ id: string }> = [];
    for (const cand of candidates) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT c.id
        FROM "Contact" c
        WHERE c."tenantId" = ${tenantId}
          AND regexp_replace(COALESCE(c."phone", ''), '[^0-9]', '', 'g') = ${cand}
        LIMIT 5
      `;
      if (rows.length > 0) {
        matches = rows;
        break;
      }
    }

    if (matches.length === 0) {
      return {
        found: false as const,
        normalizedDigits: digits,
        triedVariants: candidates,
      };
    }

    if (matches.length > 1) {
      throw new BadRequestException(
        "Vários contatos correspondem a este número; ajuste os cadastros no CRM.",
      );
    }

    const contact = await this.prisma.contact.findFirst({
      where: { id: matches[0].id, tenantId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        company: true,
        jobTitle: true,
        campaignSource: { select: { id: true, name: true } },
        contactTags: {
          include: { tag: { select: { id: true, name: true, color: true } } },
        },
        deals: {
          orderBy: { updatedAt: "desc" },
          take: 25,
          select: {
            id: true,
            title: true,
            status: true,
            value: true,
            stage: { select: { name: true } },
            pipeline: { select: { name: true } },
            assignedTo: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!contact) throw new NotFoundException();

    return {
      found: true as const,
      normalizedDigits: digits,
      contact,
    };
  }

  async getDetail(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
      include: {
        campaignSource: true,
        contactTags: { include: { tag: true } },
        deals: {
          include: { stage: true, pipeline: true, assignedTo: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    });
    if (!contact) throw new NotFoundException();

    const [allTags, customFields, activities, messages] = await Promise.all([
      this.prisma.tag.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      }),
      findContactCustomFieldDefinitions(this.prisma, tenantId),
      this.prisma.activity.findMany({
        where: { tenantId, contactId: id },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
        take: 100,
      }),
      this.prisma.message.findMany({
        where: { tenantId, contactId: id },
        orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
        take: 100,
      }),
    ]);

    return { contact, allTags, customFields, activities, messages };
  }

  async create(tenantId: string, input: unknown) {
    const data = contactSchema.parse(input);
    const contact = await this.prisma.contact.create({
      data: {
        tenantId,
        name: data.name,
        phone: data.phone || null,
        email: data.email || null,
        company: data.company || null,
        jobTitle: data.jobTitle?.trim() || null,
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
        campaignSourceId: data.campaignSourceId || null,
      },
      select: { id: true },
    });
    return contact;
  }

  async delete(tenantId: string, id: string) {
    await this.prisma.contact.deleteMany({ where: { id, tenantId } });
  }

  async listCampaignSources(tenantId: string) {
    return this.prisma.campaignSource.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }

  async patch(tenantId: string, id: string, body: unknown) {
    const data = patchContactSchema.parse(body);
    const keys = Object.keys(data);
    if (keys.length === 0) return { ok: true as const };

    const existing = await this.prisma.contact.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException();

    const update: Prisma.ContactUpdateInput = {};
    if (data.name !== undefined) {
      update.name = data.name.trim();
    }
    if (data.email !== undefined) {
      update.email = data.email === "" ? null : data.email;
    }
    if (data.phone !== undefined) {
      update.phone = data.phone === "" || data.phone === null ? null : data.phone;
    }
    if (data.company !== undefined) {
      update.company =
        data.company === "" || data.company === null ? null : data.company;
    }
    if (data.jobTitle !== undefined) {
      update.jobTitle =
        data.jobTitle === "" || data.jobTitle === null
          ? null
          : data.jobTitle.trim();
    }
    if (data.campaignSourceId !== undefined) {
      if (data.campaignSourceId === null) {
        update.campaignSource = { disconnect: true };
      } else {
        const src = await this.prisma.campaignSource.findFirst({
          where: { id: data.campaignSourceId, tenantId },
        });
        if (!src) throw new BadRequestException("Origem inválida");
        update.campaignSource = { connect: { id: data.campaignSourceId } };
      }
    }

    if (Object.keys(update).length === 0) return { ok: true as const };

    try {
      await this.prisma.contact.update({
        where: { id },
        data: update,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new BadRequestException(
          "Já existe um contato com este telefone neste tenant",
        );
      }
      throw e;
    }
    return { ok: true as const };
  }

  async exportCsv(tenantId: string): Promise<string> {
    const rows = await this.prisma.contact.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: {
        campaignSource: true,
        contactTags: { include: { tag: true } },
      },
    });
    const header = [
      "name",
      "phone",
      "email",
      "company",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "campaign",
      "tags",
    ];
    const lines = rows.map((r) =>
      [
        csvEscape(r.name),
        csvEscape(r.phone ?? ""),
        csvEscape(r.email ?? ""),
        csvEscape(r.company ?? ""),
        csvEscape(r.utmSource ?? ""),
        csvEscape(r.utmMedium ?? ""),
        csvEscape(r.utmCampaign ?? ""),
        csvEscape(r.campaignSource?.name ?? ""),
        csvEscape(r.contactTags.map((ct) => ct.tag.name).join("; ")),
      ].join(","),
    );
    return [header.join(","), ...lines].join("\n");
  }

  async importCsv(tenantId: string, text: string) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return { imported: 0, skipped: 0 };
    const header = lines[0]!.toLowerCase().split(",");
    const nameIdx = header.findIndex(
      (h) => h.includes("name") || h.includes("nome"),
    );
    const phoneIdx = header.findIndex(
      (h) => h.includes("phone") || h.includes("telefone"),
    );
    const emailIdx = header.findIndex((h) => h.includes("email"));
    const companyIdx = header.findIndex(
      (h) => h.includes("company") || h.includes("empresa"),
    );
    let imported = 0;
    let skipped = 0;
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i]!
        .split(",")
        .map((c) => c.trim().replace(/^"|"$/g, ""));
      const name = nameIdx >= 0 ? row[nameIdx] : row[0];
      if (!name) {
        skipped++;
        continue;
      }
      const phone = phoneIdx >= 0 ? row[phoneIdx] : undefined;
      const email = emailIdx >= 0 ? row[emailIdx] : undefined;
      const company = companyIdx >= 0 ? row[companyIdx] : undefined;
      try {
        await this.prisma.contact.create({
          data: {
            tenantId,
            name,
            phone: phone || null,
            email: email || null,
            company: company || null,
          },
        });
        imported++;
      } catch {
        skipped++;
      }
    }
    return { imported, skipped };
  }

  async addTag(
    tenantId: string,
    actorUserId: string,
    contactId: string,
    tagId: string,
  ) {
    const [contact, tag] = await Promise.all([
      this.prisma.contact.findFirst({ where: { id: contactId, tenantId } }),
      this.prisma.tag.findFirst({ where: { id: tagId, tenantId } }),
    ]);
    if (!contact || !tag) throw new BadRequestException("Contato ou tag inválidos");
    await this.prisma.contactTag.upsert({
      where: { contactId_tagId: { contactId, tagId } },
      create: { contactId, tagId },
      update: {},
    });
    if (this.pipelineAutomationEngine) {
      try {
        await this.pipelineAutomationEngine.afterContactTagAdded({
          tenantId,
          actorUserId,
          contactId,
          tagId,
          depth: 0,
        });
      } catch {
        /* ignore */
      }
    }
  }

  async removeTag(
    tenantId: string,
    actorUserId: string,
    contactId: string,
    tagId: string,
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
    });
    if (!contact) throw new BadRequestException("Contato inválido");
    const deleted = await this.prisma.contactTag.deleteMany({
      where: { contactId, tagId },
    });
    if (
      deleted.count > 0 &&
      this.pipelineAutomationEngine
    ) {
      try {
        await this.pipelineAutomationEngine.afterContactTagRemoved({
          tenantId,
          actorUserId,
          contactId,
          tagId,
          depth: 0,
        });
      } catch {
        /* ignore */
      }
    }
  }

  async updateCustomData(
    tenantId: string,
    contactId: string,
    values: Record<string, unknown>,
  ) {
    const valueKeys = Object.keys(values);
    if (valueKeys.length === 0) return;

    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true, customData: true },
    });
    if (!contact) throw new BadRequestException("Contato inválido");

    const fields = await this.prisma.customField.findMany({
      where: {
        tenantId,
        entity: CustomFieldEntity.CONTACT,
        OR: [{ key: { in: valueKeys } }, { required: true }],
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const prev = (contact.customData as Record<string, unknown> | null) ?? {};
    const merged: Record<string, unknown> = { ...prev };

    for (const f of fields) {
      if (!(f.key in values)) continue;
      const raw = values[f.key];
      if (raw === undefined) continue;
      if (raw === null || raw === "") {
        if (f.required) throw new BadRequestException(`${f.name} é obrigatório`);
        delete merged[f.key];
        continue;
      }
      try {
        merged[f.key] = await coerceCustomFieldValue(
          this.prisma,
          tenantId,
          f.fieldType,
          raw,
          f.options,
        );
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

    await this.prisma.contact.update({
      where: { id: contactId },
      data: { customData: merged as Prisma.InputJsonValue },
    });
  }
}
