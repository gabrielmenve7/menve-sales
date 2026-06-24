import { Injectable } from "@nestjs/common";
import { ActivityType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { z } from "zod";

const activitySchema = z.object({
  title: z.string().min(1),
  type: z.nativeEnum(ActivityType),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  dueAt: z.string().optional(),
  description: z.string().optional(),
});

const listQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  assigneeId: z.string().optional(),
  type: z.nativeEnum(ActivityType).optional(),
});

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query: unknown = {}) {
    const q = listQuerySchema.parse(query);
    const where: Prisma.ActivityWhereInput = { tenantId };

    if (q.assigneeId) {
      where.userId = q.assigneeId;
    }
    if (q.type) {
      where.type = q.type;
    }
    if (q.from || q.to) {
      where.dueAt = {};
      if (q.from) where.dueAt.gte = new Date(q.from);
      if (q.to) where.dueAt.lte = new Date(q.to);
    }

    return this.prisma.activity.findMany({
      where,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: { contact: true, deal: true, user: true },
      take: 500,
    });
  }

  async create(tenantId: string, userId: string, input: unknown) {
    const data = activitySchema.parse(input);
    await this.prisma.activity.create({
      data: {
        tenantId,
        userId,
        title: data.title,
        type: data.type,
        contactId: data.contactId,
        dealId: data.dealId,
        description: data.description,
        dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
      },
    });
  }

  async complete(tenantId: string, id: string) {
    await this.prisma.activity.updateMany({
      where: { id, tenantId },
      data: { completedAt: new Date() },
    });
  }
}
