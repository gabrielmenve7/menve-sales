import { BadRequestException, Injectable } from "@nestjs/common";
import { assertValidProfileImage } from "../common/profile-image.util";
import { PrismaService } from "../prisma/prisma.service";
import { findContactCustomFieldDefinitions } from "../custom-fields/custom-fields-load.util";
import { useWorkspaceMembership } from "../common/use-workspace-membership";
import { workspaceRoleToUserRole } from "../common/workspace-role.util";

function publicWebhookBaseUrl() {
  return (
    process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBundle(tenantId: string) {
    const [
      tenant,
      whatsAppConnections,
      quickReplyCategories,
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
      this.prisma.quickReplyCategory.findMany({
        where: { tenantId },
        orderBy: { sortOrder: "asc" },
        include: {
          replies: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              title: true,
              body: true,
              sortOrder: true,
            },
          },
        },
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
      this.loadMembers(tenantId),
    ]);
    return {
      tenant,
      whatsAppConnections,
      quickReplyCategories,
      webhookPublicUrl: publicWebhookBaseUrl(),
      pipelines,
      tags,
      customFields,
      members,
    };
  }

  private async loadMembers(tenantId: string) {
    if (useWorkspaceMembership()) {
      const rows = await this.prisma.workspaceMembership.findMany({
        where: { tenantId },
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: { joinedAt: "asc" },
      });
      return rows.map((r) => ({
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        image: r.user.image,
        role: workspaceRoleToUserRole(r.role),
      }));
    }
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true, image: true },
      orderBy: { name: "asc" },
    });
  }

  async getMembers(tenantId: string) {
    return this.loadMembers(tenantId);
  }

  async updateTenant(
    tenantId: string,
    body: { name?: string; researchEnabled?: boolean; image?: string | null },
  ) {
    const hasName = body.name !== undefined;
    const hasResearch = body.researchEnabled !== undefined;
    const hasImage = body.image !== undefined;
    if (!hasName && !hasResearch && !hasImage) {
      throw new BadRequestException("Nenhum campo para atualizar");
    }
    if (hasName && !body.name?.trim()) {
      throw new BadRequestException("Nome é obrigatório");
    }
    if (hasResearch && typeof body.researchEnabled !== "boolean") {
      throw new BadRequestException("researchEnabled deve ser boolean");
    }
    let imageValue: string | null | undefined;
    if (hasImage) {
      if (body.image === null || body.image === "") {
        imageValue = null;
      } else {
        imageValue = assertValidProfileImage(body.image as string);
      }
    }
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(hasName ? { name: body.name!.trim() } : {}),
        ...(hasResearch ? { researchEnabled: body.researchEnabled! } : {}),
        ...(hasImage ? { image: imageValue } : {}),
      },
    });
  }
}
