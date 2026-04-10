import {
  PrismaClient,
  Prisma,
  UserRole,
  DealStatus,
  WhatsAppProvider,
  CustomFieldEntity,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const REMOVED_CUSTOM_FIELD_KEYS = [
  "cargo",
  "segmento",
  "funcionarios",
  "prioridade",
  "observacoes",
  "oportunidade",
  /** Duplica `campaignSource` do contato (origem no card do deal). */
  "origem",
] as const;

function omitCustomDataKeys(
  raw: unknown,
  keys: readonly string[],
): Prisma.InputJsonValue {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {} as Prisma.InputJsonValue;
  }
  const o = { ...(raw as Record<string, unknown>) };
  for (const k of keys) delete o[k];
  return o as Prisma.InputJsonValue;
}

const prisma = new PrismaClient();

const dealCustomFieldSeeds: Array<{
  key: string;
  name: string;
  fieldType: string;
  sortOrder: number;
  options?: string[];
}> = [
  { key: "responsavel", name: "Responsável", fieldType: "USER", sortOrder: 12 },
  {
    key: "motivo_perda",
    name: "Motivo de perda",
    fieldType: "SELECT",
    sortOrder: 13,
    options: [
      "Preço",
      "Concorrência",
      "Sem resposta",
      "Timing",
      "Não é prioridade",
      "Outro",
    ],
  },
  {
    key: "produto",
    name: "Produto",
    fieldType: "SELECT",
    sortOrder: 14,
    options: ["Plano A", "Plano B", "Plano Enterprise", "Serviço avulso"],
  },
  {
    key: "atividade",
    name: "Atividade",
    fieldType: "SELECT",
    sortOrder: 15,
    options: [
      "Ligação",
      "E-mail",
      "Reunião",
      "Follow-up",
      "Proposta",
      "WhatsApp",
    ],
  },
];

/** Pipeline padrão, origens, tags e campos custom de deal — reutilizado por tenant (ex.: demo + vendas). */
async function ensureDefaultWorkspace(tenantId: string) {
  let pipeline = await prisma.pipeline.findFirst({
    where: { tenantId, name: "Vendas Inside Sales" },
    include: { stages: true },
  });

  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
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
    where: { tenantId, code: "meta" },
  });
  if (!source) {
    source = await prisma.campaignSource.create({
      data: {
        tenantId,
        name: "Meta Ads",
        code: "meta",
      },
    });
  }

  let ps = await prisma.campaignSource.findFirst({
    where: { tenantId, code: "prospecting" },
  });
  if (!ps) {
    ps = await prisma.campaignSource.create({
      data: {
        tenantId,
        name: "Prospecção Ativa",
        code: "prospecting",
      },
    });
  }

  for (const name of ["MQL", "SQL", "Quente"]) {
    await prisma.tag.upsert({
      where: {
        tenantId_name: { tenantId, name },
      },
      create: { tenantId, name },
      update: {},
    });
  }

  await prisma.customField.deleteMany({
    where: {
      tenantId,
      key: { in: [...REMOVED_CUSTOM_FIELD_KEYS] },
    },
  });

  for (const df of dealCustomFieldSeeds) {
    const exists = await prisma.customField.findFirst({
      where: { tenantId, key: df.key },
    });
    if (!exists) {
      await prisma.customField.create({
        data: {
          tenantId,
          entity: CustomFieldEntity.DEAL,
          name: df.name,
          key: df.key,
          fieldType: df.fieldType,
          sortOrder: df.sortOrder,
          required: false,
          options: df.options
            ? (df.options as unknown as Prisma.InputJsonValue)
            : undefined,
        },
      });
    }
  }

  return { pipeline, stages, source };
}

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

  await prisma.user.upsert({
    where: { email: "owner@menvedigital.local" },
    update: { tenantId: menveDigital.id, role: UserRole.OWNER },
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
    update: { tenantId: vendasTenant.id, role: UserRole.OWNER },
    create: {
      email: "owner@vendas.menvedigital.local",
      name: "Owner Vendas (produção)",
      passwordHash: password,
      role: UserRole.OWNER,
      tenantId: vendasTenant.id,
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

  const { pipeline, stages, source } = await ensureDefaultWorkspace(tenant.id);
  await ensureDefaultWorkspace(vendasTenant.id);

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
    "Seed OK — admin@menve.com / admin123 | owner@demo.com / admin123 | owner@vendas.menvedigital.local / admin123 (tenant slug vendas)",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
