import { Injectable } from "@nestjs/common";
import { ActivityType } from "@prisma/client";
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

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.activity.findMany({
      where: { tenantId },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: { contact: true, deal: true, user: true },
      take: 100,
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
