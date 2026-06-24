import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { loadAgentDefinition } from "./skill-file.util";

const GABRIEL_KEY = "gabriel";

@Injectable()
export class SkillSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureGabrielAgent() {
    const def = await loadAgentDefinition(GABRIEL_KEY).catch(() => null);
    return this.prisma.aiAgent.upsert({
      where: { key: GABRIEL_KEY },
      create: {
        id: "gabriel-agent-seed",
        key: GABRIEL_KEY,
        displayName: def?.displayName ?? "Gabriel",
        description:
          def?.description ?? "Agente SDR de qualificação pós-disparo",
        isActive: true,
      },
      update: {
        displayName: def?.displayName,
        description: def?.description || undefined,
      },
    });
  }

  async syncSkillsForTenant(tenantId: string) {
    const agent = await this.ensureGabrielAgent();
    const def = await loadAgentDefinition(GABRIEL_KEY);
    const files = def.skills;
    const results: { skillKey: string; version: number }[] = [];

    for (const file of files) {
      const existing = await this.prisma.aiAgentSkill.findUnique({
        where: {
          tenantId_agentId_skillKey: {
            tenantId,
            agentId: agent.id,
            skillKey: file.skillKey,
          },
        },
      });

      const contentChanged = existing?.content !== file.content;
      const version = contentChanged
        ? (existing?.version ?? 0) + 1
        : (existing?.version ?? 1);

      await this.prisma.aiAgentSkill.upsert({
        where: {
          tenantId_agentId_skillKey: {
            tenantId,
            agentId: agent.id,
            skillKey: file.skillKey,
          },
        },
        create: {
          tenantId,
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
      results.push({ skillKey: file.skillKey, version });
    }

    return { agentId: agent.id, skills: results };
  }

  async syncAllEnabledTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { gabrielEnabled: true },
      select: { id: true },
    });
    const synced: string[] = [];
    for (const t of tenants) {
      await this.syncSkillsForTenant(t.id);
      synced.push(t.id);
    }
    return { syncedCount: synced.length, tenantIds: synced };
  }
}
