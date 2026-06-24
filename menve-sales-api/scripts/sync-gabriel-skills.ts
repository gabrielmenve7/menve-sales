import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { loadAgentDefinition } from "../src/agents/skill-file.util";

const prisma = new PrismaClient();

async function main() {
  const tenantId = process.argv[2];
  const all = process.argv.includes("--all-enabled");

  const def = await loadAgentDefinition("gabriel");
  const agent = await prisma.aiAgent.upsert({
    where: { key: def.agentKey },
    create: {
      id: "gabriel-agent-seed",
      key: def.agentKey,
      displayName: def.displayName,
      description: def.description || "Agente SDR de qualificação pós-disparo",
      isActive: true,
    },
    update: {
      displayName: def.displayName,
      description: def.description || undefined,
    },
  });

  console.log(`Loaded ${def.skills.length} skills from ${def.sourcePath}`);
  let tenantIds: string[] = [];
  if (tenantId) {
    tenantIds = [tenantId];
  } else if (all) {
    const tenants = await prisma.tenant.findMany({
      where: { gabrielEnabled: true },
      select: { id: true },
    });
    tenantIds = tenants.map((t) => t.id);
  } else {
    const tenants = await prisma.tenant.findMany({ select: { id: true } });
    tenantIds = tenants.map((t) => t.id);
  }

  for (const tid of tenantIds) {
    for (const file of def.skills) {
      const existing = await prisma.aiAgentSkill.findUnique({
        where: {
          tenantId_agentId_skillKey: {
            tenantId: tid,
            agentId: agent.id,
            skillKey: file.skillKey,
          },
        },
      });
      const contentChanged = existing?.content !== file.content;
      const version = contentChanged
        ? (existing?.version ?? 0) + 1
        : (existing?.version ?? 1);

      await prisma.aiAgentSkill.upsert({
        where: {
          tenantId_agentId_skillKey: {
            tenantId: tid,
            agentId: agent.id,
            skillKey: file.skillKey,
          },
        },
        create: {
          tenantId: tid,
          agentId: agent.id,
          skillKey: file.skillKey,
          content: file.content,
          sourcePath: file.sourcePath,
          sortOrder: file.order,
          version,
        },
        update: {
          content: file.content,
          sourcePath: file.sourcePath,
          sortOrder: file.order,
          ...(contentChanged ? { version } : {}),
        },
      });
    }
    console.log(`Synced tenant ${tid}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
