import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { ensureDefaultWorkspace } from "./workspace-bootstrap";

/**
 * Hash bcrypt (12 rounds) de `admin123`, alinhado ao `prisma/seed.ts`.
 * Usado só na criação inicial do usuário (não sobrescreve senha existente).
 */
const BOOTSTRAP_PASSWORD_HASH =
  "$2a$12$g5AhBADZh5OelxgVhkyj0OqzHQpkTP.ZGY5UvgSlFDzv0P9JVABpy";

const CANONICAL_TENANTS = [
  { slug: "demo", name: "Cliente Demo" },
  { slug: "menve-digital", name: "Menve Digital" },
  { slug: "vendas", name: "Menve Digital — Vendas" },
  { slug: "crm", name: "Menve — CRM" },
] as const;

type CanonicalSlug = (typeof CANONICAL_TENANTS)[number]["slug"];

@Injectable()
export class AppBootstrapService implements OnApplicationBootstrap {
  private readonly log = new Logger(AppBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    if (process.env.SKIP_CANONICAL_BOOTSTRAP === "1") {
      this.log.warn("SKIP_CANONICAL_BOOTSTRAP=1 — tenants/workspace bootstrap ignorado");
      return;
    }
    // Em background: upserts no DB não podem atrasar `app.listen()` (healthcheck Railway).
    void this.runCanonicalBootstrap().catch((e) => {
      this.log.error(
        "Falha no bootstrap canônico (background) — migrate/seed se necessário.",
        e instanceof Error ? e.stack : e,
      );
    });
  }

  private async runCanonicalBootstrap() {
    await this.ensureTenants();
    await this.ensureBootstrapUsers();
    await this.ensureWorkspaces();
    this.log.log(
      "Tenants canônicos e workspaces verificados (demo, vendas, crm, menve-digital).",
    );
  }

  private async ensureTenants() {
    for (const t of CANONICAL_TENANTS) {
      await this.prisma.tenant.upsert({
        where: { slug: t.slug },
        update: { researchEnabled: true },
        create: {
          name: t.name,
          slug: t.slug,
          plan: "pro",
          researchEnabled: true,
        },
      });
    }
  }

  private async ensureBootstrapUsers() {
    const bySlug = async (slug: CanonicalSlug) => {
      const row = await this.prisma.tenant.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!row) throw new Error(`tenant slug inesperado: ${slug}`);
      return row.id;
    };

    const rows: Array<{
      email: string;
      name: string;
      role: UserRole;
      tenantSlug: CanonicalSlug | null;
    }> = [
      {
        email: "owner@demo.com",
        name: "Owner Demo",
        role: UserRole.OWNER,
        tenantSlug: "demo",
      },
      {
        email: "owner@menvedigital.local",
        name: "Owner Menve Digital",
        role: UserRole.OWNER,
        tenantSlug: "menve-digital",
      },
      {
        email: "owner@vendas.menvedigital.local",
        name: "Owner Vendas (produção)",
        role: UserRole.OWNER,
        tenantSlug: "vendas",
      },
      {
        email: "owner@crm.menvedigital.local",
        name: "Owner CRM (crm.*.menvedigital)",
        role: UserRole.OWNER,
        tenantSlug: "crm",
      },
      {
        email: "admin@menve.com",
        name: "Super Admin Menve",
        role: UserRole.SUPER_ADMIN,
        tenantSlug: null,
      },
    ];

    for (const r of rows) {
      const existing = await this.prisma.user.findUnique({
        where: { email: r.email },
        select: { id: true },
      });
      if (existing) continue;

      const tenantId =
        r.tenantSlug === null ? null : await bySlug(r.tenantSlug);

      await this.prisma.user.create({
        data: {
          email: r.email,
          name: r.name,
          passwordHash: BOOTSTRAP_PASSWORD_HASH,
          role: r.role,
          tenantId,
        },
      });
      this.log.log(`Usuário bootstrap criado: ${r.email}`);
    }
  }

  private async ensureWorkspaces() {
    for (const t of CANONICAL_TENANTS) {
      const row = await this.prisma.tenant.findUnique({
        where: { slug: t.slug },
        select: { id: true },
      });
      if (!row) continue;
      await ensureDefaultWorkspace(this.prisma, row.id);
    }
  }
}
