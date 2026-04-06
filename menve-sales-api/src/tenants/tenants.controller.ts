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
    const row = t as typeof t & { image?: string | null };
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      plan: row.plan,
      image: row.image ?? null,
      researchEnabled: row.researchEnabled,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
