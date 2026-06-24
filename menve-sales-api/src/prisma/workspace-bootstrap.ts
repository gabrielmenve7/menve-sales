import {
  type PrismaClient,
  Prisma,
  CustomFieldEntity,
} from "@prisma/client";

export const REMOVED_CUSTOM_FIELD_KEYS = [
  "cargo",
  "segmento",
  "funcionarios",
  "prioridade",
  "observacoes",
  "oportunidade",
  "origem",
] as const;

export function omitCustomDataKeys(
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

/**
 * Pipeline padrão, origens, tags e campos custom de deal — usado pelo seed e pelo
 * bootstrap de produção (Railway) para não depender de `db:seed` manual.
 */
export async function ensureDefaultWorkspace(
  prisma: PrismaClient,
  tenantId: string,
) {
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
            { name: "Reunião agendada", sortOrder: 0, probability: 40 },
            { name: "Reagendamento", sortOrder: 1, probability: 50 },
            { name: "Follow-up", sortOrder: 2, probability: 70 },
            { name: "Venda", sortOrder: 3, probability: 90 },
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

  let outreach = await prisma.campaignSource.findFirst({
    where: { tenantId, code: "outreach" },
  });
  if (!outreach) {
    outreach = await prisma.campaignSource.create({
      data: {
        tenantId,
        name: "Disparo",
        code: "outreach",
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
