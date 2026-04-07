import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { z } from "zod";

const categorySchema = z.object({
  name: z.string().min(1).max(80),
});

const qrSchema = z.object({
  categoryId: z.string().min(1),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(2000),
});

@Injectable()
export class QuickRepliesService {
  constructor(private readonly prisma: PrismaService) {}

  async createCategory(tenantId: string, input: unknown) {
    const data = categorySchema.parse(input);
    const name = data.name.trim();
    const last = await this.prisma.quickReplyCategory.findFirst({
      where: { tenantId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    return this.prisma.quickReplyCategory.create({
      data: {
        tenantId,
        name,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  async deleteCategory(tenantId: string, id: string) {
    await this.prisma.quickReplyCategory.deleteMany({
      where: { id, tenantId },
    });
  }

  async create(tenantId: string, input: unknown) {
    const data = qrSchema.parse(input);
    const cat = await this.prisma.quickReplyCategory.findFirst({
      where: { id: data.categoryId.trim(), tenantId },
      select: { id: true },
    });
    if (!cat) {
      throw new BadRequestException("Categoria inválida ou de outro workspace");
    }
    const categoryId = cat.id;
    const last = await this.prisma.quickReply.findFirst({
      where: { categoryId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    await this.prisma.quickReply.create({
      data: {
        tenantId,
        categoryId,
        title: data.title.trim(),
        body: data.body.trim(),
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  async delete(tenantId: string, id: string) {
    await this.prisma.quickReply.deleteMany({ where: { id, tenantId } });
  }
}
