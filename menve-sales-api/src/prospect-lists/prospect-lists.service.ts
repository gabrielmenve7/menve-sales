import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { z } from "zod";

const createListSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

const addItemsSchema = z.object({
  prospectResultIds: z.array(z.string().min(1)).min(1).max(500),
});

@Injectable()
export class ProspectListsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.prospectList.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
    });
  }

  async getById(tenantId: string, id: string) {
    const list = await this.prisma.prospectList.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            prospectResult: {
              select: {
                id: true,
                name: true,
                phone: true,
                whatsapp: true,
                website: true,
                status: true,
                contactId: true,
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
    return list;
  }

  async create(u: RequestUser, raw: unknown) {
    assertCanConfigureTenant(u.role);
    const data = createListSchema.parse(raw);
    return this.prisma.prospectList.create({
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
    });
  }

  async addItems(u: RequestUser, listId: string, raw: unknown) {
    assertCanConfigureTenant(u.role);
    const { prospectResultIds } = addItemsSchema.parse(raw);

    const list = await this.prisma.prospectList.findFirst({
      where: { id: listId, tenantId: u.tenantId },
    });
    if (!list) throw new NotFoundException();

    const results = await this.prisma.prospectResult.findMany({
      where: {
        tenantId: u.tenantId,
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

    return { added: created.count, listId };
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
}
