import { Controller, Get, Param } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../common/public.decorator";

@Controller("tenants")
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get("by-slug/:slug")
  async bySlug(@Param("slug") slug: string) {
    const t = await this.prisma.tenant.findUnique({
      where: { slug },
    });
    if (!t) return null;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      researchEnabled: t.researchEnabled,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }
}
