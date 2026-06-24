import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { loadAgentDefinition } from "./skill-file.util";

const LARISSA_KEY = "larissa";

@Injectable()
export class SkillSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureLarissaAgent() {
    const def = await loadAgentDefinition(LARISSA_KEY).catch(() => null);
    return this.prisma.aiAgent.upsert({
      where: { key: LARISSA_KEY },
      create: {
        id: "larissa-agent-seed",
        key: LARISSA_KEY,
        displayName: def?.displayName ?? "Larissa",
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
    const agent = await this.ensureLarissaAgent();
    const def = await loadAgentDefinition(LARISSA_KEY);
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
      where: { larissaEnabled: true },
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
