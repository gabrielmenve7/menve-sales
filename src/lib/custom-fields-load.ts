import type { CustomField } from "@prisma/client";
import prisma from "@/lib/prisma";
import { CUSTOM_FIELD_ENTITY } from "@/lib/custom-field-entity";

/**
 * Carrega definições de campos customizados para contatos.
 * Faz fallback se o Prisma Client estiver desatualizado (sem colunas `entity` / `sortOrder`
 * no modelo gerado) — típico quando não rodou `npx prisma generate` após a migração.
 */
export async function findContactCustomFieldDefinitions(
  tenantId: string,
): Promise<CustomField[]> {
  try {
    return await prisma.customField.findMany({
      where: { tenantId, entity: CUSTOM_FIELD_ENTITY.CONTACT },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("Unknown argument") ||
      msg.includes("Unknown field") ||
      msg.includes("entity") ||
      msg.includes("sortOrder")
    ) {
      const rows = await prisma.customField.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
      });
      return rows.filter((r) => {
        const ent = (r as { entity?: string | null }).entity;
        return ent == null || ent === CUSTOM_FIELD_ENTITY.CONTACT;
      }) as CustomField[];
    }
    throw e;
  }
}
