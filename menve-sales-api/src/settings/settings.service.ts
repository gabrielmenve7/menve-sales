import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { findContactCustomFieldDefinitions } from "../custom-fields/custom-fields-load.util";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBundle(tenantId: string) {
    const [
      tenant,
      whatsAppConnections,
      quickReplies,
      pipelines,
      tags,
      customFields,
      members,
    ] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId } }),
      this.prisma.whatsAppConnection.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.quickReply.findMany({
        where: { tenantId },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.pipeline.findMany({
        where: { tenantId },
        orderBy: { sortOrder: "asc" },
        include: { stages: { orderBy: { sortOrder: "asc" } } },
      }),
      this.prisma.tag.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      }),
      findContactCustomFieldDefinitions(this.prisma, tenantId),
      this.prisma.user.findMany({
        where: { tenantId },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      tenant,
      whatsAppConnections,
      quickReplies,
      pipelines,
      tags,
      customFields,
      members,
    };
  }

  async getMembers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
  }

  async updateTenant(
    tenantId: string,
    body: { name?: string; researchEnabled?: boolean },
  ) {
    const hasName = body.name !== undefined;
    const hasResearch = body.researchEnabled !== undefined;
    if (!hasName && !hasResearch) {
      throw new BadRequestException("Nenhum campo para atualizar");
    }
    if (hasName && !body.name?.trim()) {
      throw new BadRequestException("Nome é obrigatório");
    }
    if (
      hasResearch &&
      typeof body.researchEnabled !== "boolean"
    ) {
      throw new BadRequestException("researchEnabled deve ser boolean");
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(hasName ? { name: body.name!.trim() } : {}),
        ...(hasResearch ? { researchEnabled: body.researchEnabled! } : {}),
      },
    });
  }
}
