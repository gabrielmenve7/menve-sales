import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OutreachRecipientStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { z } from "zod";
import {
  buildOutreachStatusMap,
  phoneFromProspectFields,
} from "./outreach-status.util";

export const PRIMARY_LIST_CODE = "primary";
export const PRIMARY_LIST_NAME = "Lista principal";

const createListSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const addItemsSchema = z.object({
  prospectResultIds: z.array(z.string().min(1)).min(1).max(500),
});

function mapListSummary(
  list: {
    id: string;
    name: string;
    description: string | null;
    code: string | null;
    createdAt: Date;
    createdBy: { name: string | null; email: string | null };
    _count: { items: number };
  },
) {
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    code: list.code,
    isPrimary: list.code === PRIMARY_LIST_CODE,
    itemCount: list._count.items,
    createdAt: list.createdAt.toISOString(),
    createdBy: list.createdBy,
  };
}

@Injectable()
export class ProspectListsService {
  constructor(private readonly prisma: PrismaService) {}

  async ensurePrimaryList(tenantId: string, userId: string) {
    const existing = await this.prisma.prospectList.findFirst({
      where: { tenantId, code: PRIMARY_LIST_CODE },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
    });
    if (existing) return existing;

    return this.prisma.prospectList.create({
      data: {
        tenantId,
        name: PRIMARY_LIST_NAME,
        code: PRIMARY_LIST_CODE,
        description:
          "Empresas capturadas no Google Maps — alimentada automaticamente a cada captura.",
        createdById: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
    });
  }

  private async outreachStatusForPhones(
    tenantId: string,
    phones: string[],
  ): Promise<Map<string, { status: OutreachRecipientStatus; campaignName: string | null; updatedAt: Date }>> {
    if (phones.length === 0) {
      return new Map();
    }
    const recipients = await this.prisma.outreachCampaignRecipient.findMany({
      where: {
        phone: { in: phones },
        campaign: { tenantId },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        phone: true,
        status: true,
        updatedAt: true,
        campaign: { select: { name: true } },
      },
    });
    return buildOutreachStatusMap(recipients);
  }

  list(tenantId: string) {
    return this.prisma.prospectList
      .findMany({
        where: { tenantId },
        orderBy: [{ code: "asc" }, { createdAt: "desc" }],
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } },
        },
      })
      .then((rows) => rows.map(mapListSummary));
  }

  async getPrimary(tenantId: string, userId: string) {
    const list = await this.ensurePrimaryList(tenantId, userId);
    return this.getById(tenantId, list.id);
  }

  async getById(tenantId: string, id: string) {
    const list = await this.prisma.prospectList.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
        items: {
          orderBy: { createdAt: "desc" },
          include: {
            prospectResult: {
              select: {
                id: true,
                name: true,
                phone: true,
                whatsapp: true,
                website: true,
                hasWebsite: true,
                address: true,
                snippet: true,
                rating: true,
                reviewCount: true,
                googleMapsUrl: true,
                status: true,
                contactId: true,
                enrichmentData: true,
                search: {
                  select: {
                    segment: true,
                    city: true,
                    state: true,
                    query: true,
                    createdAt: true,
                  },
                },
              },
            },
            contact: {
              select: { id: true, name: true, phone: true, company: true },
            },
          },
        },
      },
    });
    if (!list) throw new NotFoundException();

    const phones: string[] = [];
    for (const item of list.items) {
      const pr = item.prospectResult;
      if (!pr) continue;
      const phone = phoneFromProspectFields(pr);
      if (phone) phones.push(phone);
    }
    const statusMap = await this.outreachStatusForPhones(tenantId, phones);

    const items = list.items.map((item) => {
      const pr = item.prospectResult;
      const phone = pr ? phoneFromProspectFields(pr) : null;
      const outreach = phone ? statusMap.get(phone) : undefined;
      return {
        id: item.id,
        createdAt: item.createdAt.toISOString(),
        prospectResult: pr
          ? {
              id: pr.id,
              name: pr.name,
              phone: pr.phone,
              whatsapp: pr.whatsapp,
              website: pr.website,
              hasWebsite: pr.hasWebsite,
              address: pr.address,
              snippet: pr.snippet,
              rating: pr.rating,
              reviewCount: pr.reviewCount,
              googleMapsUrl: pr.googleMapsUrl,
              status: pr.status,
              contactId: pr.contactId,
              capture: pr.search
                ? {
                    segment: pr.search.segment,
                    city: pr.search.city,
                    state: pr.search.state,
                    query: pr.search.query,
                    createdAt: pr.search.createdAt.toISOString(),
                  }
                : null,
            }
          : null,
        contact: item.contact,
        outreachStatus: outreach?.status ?? null,
        outreachCampaignName: outreach?.campaignName ?? null,
      };
    });

    return {
      ...mapListSummary(list),
      items,
    };
  }

  async create(u: RequestUser, raw: unknown) {
    assertCanConfigureTenant(u.role);
    const data = createListSchema.parse(raw);
    return this.prisma.prospectList
      .create({
        data: {
          tenantId: u.tenantId,
          name: data.name.trim(),
          description: data.description?.trim() || null,
          createdById: u.userId,
        },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } },
        },
      })
      .then(mapListSummary);
  }

  /** Adiciona resultados à lista principal (captura automática). */
  async addResultsToPrimaryList(
    tenantId: string,
    userId: string,
    prospectResultIds: string[],
  ) {
    if (prospectResultIds.length === 0) {
      return { added: 0, listId: null as string | null };
    }
    const list = await this.ensurePrimaryList(tenantId, userId);
    const added = await this.addItemsInternal(
      tenantId,
      list.id,
      prospectResultIds,
    );
    return { added, listId: list.id };
  }

  async addItems(u: RequestUser, listId: string, raw: unknown) {
    assertCanConfigureTenant(u.role);
    const { prospectResultIds } = addItemsSchema.parse(raw);
    const list = await this.prisma.prospectList.findFirst({
      where: { id: listId, tenantId: u.tenantId },
    });
    if (!list) throw new NotFoundException();
    const added = await this.addItemsInternal(
      u.tenantId,
      listId,
      prospectResultIds,
    );
    return { added, listId };
  }

  private async addItemsInternal(
    tenantId: string,
    listId: string,
    prospectResultIds: string[],
  ) {
    const results = await this.prisma.prospectResult.findMany({
      where: {
        tenantId,
        id: { in: prospectResultIds },
      },
      select: { id: true, contactId: true },
    });

    if (results.length !== prospectResultIds.length) {
      throw new BadRequestException(
        "Um ou mais resultados de prospecção não foram encontrados",
      );
    }

    const created = await this.prisma.prospectListItem.createMany({
      data: results.map((r) => ({
        listId,
        prospectResultId: r.id,
        contactId: r.contactId,
      })),
      skipDuplicates: true,
    });

    return created.count;
  }

  async removeItem(u: RequestUser, listId: string, itemId: string) {
    assertCanConfigureTenant(u.role);

    const list = await this.prisma.prospectList.findFirst({
      where: { id: listId, tenantId: u.tenantId },
    });
    if (!list) throw new NotFoundException();

    const item = await this.prisma.prospectListItem.findFirst({
      where: { id: itemId, listId },
    });
    if (!item) throw new NotFoundException();

    await this.prisma.prospectListItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  async resolveOutreachStatusForResults(
    tenantId: string,
    results: Array<{
      phone: string | null;
      whatsapp: string | null;
      enrichmentData?: unknown;
    }>,
  ): Promise<(OutreachRecipientStatus | null)[]> {
    const phones = results.map((r) => phoneFromProspectFields(r));
    const unique = [...new Set(phones.filter((p): p is string => !!p))];
    const map = await this.outreachStatusForPhones(tenantId, unique);
    return phones.map((p) => (p ? (map.get(p)?.status ?? null) : null));
  }
}
