import { CustomFieldEntity, type CustomField } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export async function findContactCustomFieldDefinitions(
  prisma: PrismaService,
  tenantId: string,
): Promise<CustomField[]> {
  try {
    return await prisma.customField.findMany({
      where: { tenantId, entity: CustomFieldEntity.CONTACT },
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
        return ent == null || ent === CustomFieldEntity.CONTACT;
      }) as CustomField[];
    }
    throw e;
  }
}

export async function findDealCustomFieldDefinitions(
  prisma: PrismaService,
  tenantId: string,
): Promise<CustomField[]> {
  try {
    return await prisma.customField.findMany({
      where: { tenantId, entity: CustomFieldEntity.DEAL },
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
        return ent === CustomFieldEntity.DEAL;
      }) as CustomField[];
    }
    throw e;
  }
}
