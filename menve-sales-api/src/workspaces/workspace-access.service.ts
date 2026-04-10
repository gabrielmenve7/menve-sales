import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  getMembership(userId: string, tenantId: string) {
    return this.prisma.workspaceMembership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
  }

  async assertMember(userId: string, tenantId: string) {
    const m = await this.getMembership(userId, tenantId);
    if (!m) {
      throw new ForbiddenException("Sem acesso a este workspace");
    }
    return m;
  }

  listForUser(userId: string) {
    return this.prisma.workspaceMembership.findMany({
      where: { userId },
      include: { tenant: true },
      orderBy: { joinedAt: "asc" },
    });
  }
}
