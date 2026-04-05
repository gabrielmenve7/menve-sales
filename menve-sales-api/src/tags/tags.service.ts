import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanConfigureTenant } from "../common/rbac";
import type { RequestUser } from "../common/request-user";
import { z } from "zod";

const tagNameSchema = z.object({
  name: z.string().min(1).max(64),
  color: z.string().max(32).optional(),
});

const updateTagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(64).optional(),
  color: z.string().max(32).nullable().optional(),
});

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.tag.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }

  async create(tenantId: string, input: unknown) {
    const data = tagNameSchema.parse(input);
    const name = data.name.trim();
    await this.prisma.tag.upsert({
      where: { tenantId_name: { tenantId, name } },
      create: {
        tenantId,
        name,
        color: data.color || null,
      },
      update: {
        color: data.color ?? undefined,
      },
    });
  }

  async createCatalog(u: RequestUser, input: unknown) {
    assertCanConfigureTenant(u.role);
    await this.create(u.tenantId, input);
  }

  async update(u: RequestUser, input: z.infer<typeof updateTagSchema>) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const data = updateTagSchema.parse(input);
    const existing = await this.prisma.tag.findFirst({
      where: { id: data.id, tenantId },
    });
    if (!existing) throw new BadRequestException("Tag não encontrada");
    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      const clash = await this.prisma.tag.findFirst({
        where: { tenantId, name: trimmed, NOT: { id: data.id } },
      });
      if (clash) throw new BadRequestException("Já existe uma tag com este nome");
    }
    await this.prisma.tag.update({
      where: { id: data.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
    });
  }

  async delete(u: RequestUser, tagId: string) {
    assertCanConfigureTenant(u.role);
    const tenantId = u.tenantId;
    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, tenantId },
    });
    if (!tag) throw new BadRequestException("Tag não encontrada");
    await this.prisma.$transaction([
      this.prisma.contactTag.deleteMany({ where: { tagId } }),
      this.prisma.dealTag.deleteMany({ where: { tagId } }),
      this.prisma.tag.delete({ where: { id: tagId } }),
    ]);
  }
}
