import {
  PrismaClient,
  UserRole,
  DealStatus,
  WhatsAppProvider,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const password = await bcrypt.hash("admin123", 12);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      name: "Cliente Demo",
      slug: "demo",
      plan: "pro",
    },
  });

  await prisma.user.upsert({
    where: { email: "admin@menve.com" },
    update: {},
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
    update: {},
    create: {
      email: "owner@demo.com",
      name: "Owner Demo",
      passwordHash: password,
      role: UserRole.OWNER,
      tenantId: tenant.id,
    },
  });

  let pipeline = await prisma.pipeline.findFirst({
    where: { tenantId: tenant.id, name: "Vendas Inside Sales" },
    include: { stages: true },
  });

  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        tenantId: tenant.id,
        name: "Vendas Inside Sales",
        isDefault: true,
        sortOrder: 0,
        stages: {
          create: [
            { name: "Novo lead", sortOrder: 0, probability: 10 },
            { name: "Qualificação", sortOrder: 1, probability: 25 },
            { name: "Proposta", sortOrder: 2, probability: 50 },
            { name: "Negociação", sortOrder: 3, probability: 75 },
            { name: "Fechado ganho", sortOrder: 4, probability: 100 },
          ],
        },
      },
      include: { stages: true },
    });
  }

  const stages = pipeline.stages.sort((a, b) => a.sortOrder - b.sortOrder);

  let source = await prisma.campaignSource.findFirst({
    where: { tenantId: tenant.id, code: "meta" },
  });
  if (!source) {
    source = await prisma.campaignSource.create({
      data: {
        tenantId: tenant.id,
        name: "Meta Ads",
        code: "meta",
      },
    });
  }

  for (const name of ["MQL", "SQL", "Quente"]) {
    await prisma.tag.upsert({
      where: {
        tenantId_name: { tenantId: tenant.id, name },
      },
      create: { tenantId: tenant.id, name },
      update: {},
    });
  }

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

  const existingDeal = await prisma.deal.findFirst({
    where: { tenantId: tenant.id, title: "Oportunidade Demo" },
  });
  if (!existingDeal && stages[1]) {
    await prisma.deal.create({
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

  const hasWa = await prisma.whatsAppConnection.findFirst({
    where: { tenantId: tenant.id, name: "Linha Demo Evolution" },
  });
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
    "Seed OK — admin@menve.com / admin123 | owner@demo.com / admin123",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
