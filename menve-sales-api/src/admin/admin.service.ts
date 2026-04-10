import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/request-user";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  assertSuperAdmin(u: RequestUser) {
    if (u.globalRole !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException();
    }
  }

  async tenants(u: RequestUser) {
    this.assertSuperAdmin(u);
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { contacts: true, deals: true, users: true },
        },
      },
    });
    const tenantStats = await Promise.all(
      tenants.map(async (t) => {
        const [openDeals, wonDeals, lostDeals] = await Promise.all([
          this.prisma.deal.count({
            where: { tenantId: t.id, status: "OPEN" },
          }),
          this.prisma.deal.count({
            where: { tenantId: t.id, status: "WON" },
          }),
          this.prisma.deal.count({
            where: { tenantId: t.id, status: "LOST" },
          }),
        ]);
        return { tenantId: t.id, openDeals, wonDeals, lostDeals };
      }),
    );
    const statMap = new Map(tenantStats.map((s) => [s.tenantId, s]));
    return { tenants, statMap: Object.fromEntries(statMap) };
  }
}
