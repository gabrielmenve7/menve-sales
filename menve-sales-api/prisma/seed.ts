import {
  PrismaClient,
  UserRole,
  DealStatus,
  WhatsAppProvider,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  ensureDefaultWorkspace,
  omitCustomDataKeys,
  REMOVED_CUSTOM_FIELD_KEYS,
} from "../src/prisma/workspace-bootstrap";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("admin123", 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { researchEnabled: true },
    create: {
      name: "Cliente Demo",
      slug: "demo",
      plan: "pro",
      researchEnabled: true,
    },
  });

  /** Workspace interno Menve (dev): use com DEFAULT_TENANT_SLUG=menve-digital */
  const menveDigital = await prisma.tenant.upsert({
    where: { slug: "menve-digital" },
    update: { researchEnabled: true },
    create: {
      name: "Menve Digital",
      slug: "menve-digital",
      plan: "pro",
      researchEnabled: true,
    },
  });

  /**
   * Produção em `https://vendas.menvedigital.com.br`: o host resolve slug `vendas`
   * (menve-sales-web/src/lib/tenant-edge.ts).
   */
  const vendasTenant = await prisma.tenant.upsert({
    where: { slug: "vendas" },
    update: { researchEnabled: true },
    create: {
      name: "Menve Digital — Vendas",
      slug: "vendas",
      plan: "pro",
      researchEnabled: true,
    },
  });

  /**
   * Host `crm.menvedigital.com.br` → slug `crm` (primeiro label do host).
   */
  const crmTenant = await prisma.tenant.upsert({
    where: { slug: "crm" },
    update: { researchEnabled: true },
    create: {
      name: "Menve — CRM",
      slug: "crm",
      plan: "pro",
      researchEnabled: true,
    },
  });

  /** `update` inclui `passwordHash` para `db:seed` realinhar senha seed (ex.: admin123) após deploys antigos. */
  await prisma.user.upsert({
    where: { email: "owner@menvedigital.local" },
    update: {
      tenantId: menveDigital.id,
      role: UserRole.OWNER,
      name: "Owner Menve Digital",
      passwordHash: password,
    },
    create: {
      email: "owner@menvedigital.local",
      name: "Owner Menve Digital",
      passwordHash: password,
      role: UserRole.OWNER,
      tenantId: menveDigital.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "owner@vendas.menvedigital.local" },
    update: {
      tenantId: vendasTenant.id,
      role: UserRole.OWNER,
      name: "Owner Vendas (produção)",
      passwordHash: password,
    },
    create: {
      email: "owner@vendas.menvedigital.local",
      name: "Owner Vendas (produção)",
      passwordHash: password,
      role: UserRole.OWNER,
      tenantId: vendasTenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "owner@crm.menvedigital.local" },
    update: {
      tenantId: crmTenant.id,
      role: UserRole.OWNER,
      name: "Owner CRM (crm.*.menvedigital)",
      passwordHash: password,
    },
    create: {
      email: "owner@crm.menvedigital.local",
      name: "Owner CRM (crm.*.menvedigital)",
      passwordHash: password,
      role: UserRole.OWNER,
      tenantId: crmTenant.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@menve.com" },
    update: {
      name: "Super Admin Menve",
      passwordHash: password,
    },
    create: {
      email: "admin@menve.com",
      name: "Super Admin Menve",
      passwordHash: password,
      role: UserRole.SUPER_ADMIN,
      tenantId: null,
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@demo.com" },
    update: {
      tenantId: tenant.id,
      role: UserRole.OWNER,
      name: "Owner Demo",
      passwordHash: password,
    },
    create: {
      email: "owner@demo.com",
      name: "Owner Demo",
      passwordHash: password,
      role: UserRole.OWNER,
      tenantId: tenant.id,
    },
  });

  const { pipeline, stages, source } = await ensureDefaultWorkspace(
    prisma,
    tenant.id,
  );
  await ensureDefaultWorkspace(prisma, vendasTenant.id);
  await ensureDefaultWorkspace(prisma, crmTenant.id);

  let contact = await prisma.contact.findFirst({
    where: { tenantId: tenant.id, phone: "+5511999999999" },
  });
  if (!contact) {
    contact = await prisma.contact.create({
      data: {
        tenantId: tenant.id,
        name: "Lead Exemplo",
        phone: "+5511999999999",
        email: "lead@exemplo.com",
        campaignSourceId: source.id,
        utmSource: "facebook",
        utmCampaign: "performance_q1",
      },
    });
  }

  const mqlTag = await prisma.tag.findFirst({
    where: { tenantId: tenant.id, name: "MQL" },
  });
  if (mqlTag) {
    await prisma.contactTag.upsert({
      where: {
        contactId_tagId: { contactId: contact.id, tagId: mqlTag.id },
      },
      create: { contactId: contact.id, tagId: mqlTag.id },
      update: {},
    });
  }

  let deal = await prisma.deal.findFirst({
    where: { tenantId: tenant.id, title: "Oportunidade Demo" },
  });
  if (!deal && stages[1]) {
    deal = await prisma.deal.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        pipelineId: pipeline.id,
        stageId: stages[1].id,
        title: "Oportunidade Demo",
        value: 15000,
        probability: 25,
        assignedToId: owner.id,
        status: DealStatus.OPEN,
      },
    });
  }

  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      customData: omitCustomDataKeys(
        contact.customData,
        REMOVED_CUSTOM_FIELD_KEYS,
      ),
    },
  });

  if (deal) {
    await prisma.deal.update({
      where: { id: deal.id },
      data: {
        customData: omitCustomDataKeys(
          deal.customData,
          REMOVED_CUSTOM_FIELD_KEYS,
        ),
      },
    });
  }

  const hasWa = await prisma.whatsAppConnection.findFirst({
    where: { tenantId: tenant.id, name: "Linha Demo Evolution" },
  });

  let demoQrCategory = await prisma.quickReplyCategory.findFirst({
    where: { tenantId: tenant.id, name: "Geral" },
  });
  if (!demoQrCategory) {
    demoQrCategory = await prisma.quickReplyCategory.create({
      data: { tenantId: tenant.id, name: "Geral", sortOrder: 0 },
    });
  }

  for (const [i, { title, body }] of [
    { title: "Saudação", body: "Olá! Tudo bem? Sou da equipe comercial e estou à disposição." },
    { title: "Follow-up", body: "Oi! Passando para alinhar o que combinamos. Quando podemos falar?" },
  ].entries()) {
    const existing = await prisma.quickReply.findFirst({
      where: { tenantId: tenant.id, title },
    });
    if (!existing) {
      await prisma.quickReply.create({
        data: {
          tenantId: tenant.id,
          categoryId: demoQrCategory.id,
          title,
          body,
          sortOrder: i,
        },
      });
    }
  }

  if (!hasWa) {
    await prisma.whatsAppConnection.create({
      data: {
        tenantId: tenant.id,
        name: "Linha Demo Evolution",
        provider: WhatsAppProvider.EVOLUTION,
        isActive: false,
        config: {
          baseUrl: "http://localhost:8080",
          instanceName: "demo",
          apiKey: "dev-evolution-key",
        },
      },
    });
  }

  console.log(
    "Seed OK — admin@menve.com / admin123 | owner@demo.com / admin123 | owner@vendas… / admin123 (vendas) | owner@crm.menvedigital.local / admin123 (crm — host crm.*)",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
