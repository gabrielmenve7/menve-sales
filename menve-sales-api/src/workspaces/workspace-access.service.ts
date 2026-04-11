import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { useWorkspaceMembership } from "../common/use-workspace-membership";
import { userRoleToWorkspaceRole } from "../common/workspace-role.util";

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Workspace criado com `USE_WORKSPACE_MEMBERSHIP=false` só gravava `User.tenantId` + `User.role` (ex.: OWNER).
   * Ao ativar o flag, sem esta linha o criador não tinha `WorkspaceMembership` e aparecia como sem permissão.
   */
  async ensureLegacyPrimaryTenantMembership(userId: string): Promise<void> {
    if (!useWorkspaceMembership()) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true, role: true },
    });
    if (!user?.tenantId || user.role === UserRole.SUPER_ADMIN) return;
    const existing = await this.getMembership(userId, user.tenantId);
    if (existing) return;
    const wr = userRoleToWorkspaceRole(user.role);
    await this.prisma.workspaceMembership.create({
      data: { userId, tenantId: user.tenantId, role: wr },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveTenantId: user.tenantId },
    });
  }

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
