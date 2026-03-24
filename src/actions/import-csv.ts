"use server";

import prisma from "@/lib/prisma";
import { getActiveTenantId } from "@/lib/session";
import { revalidatePath } from "next/cache";

/** Importa CSV simples: name,phone,email,company (primeira linha = cabeçalho) */
export async function importContactsCsv(text: string) {
  const tenantId = await getActiveTenantId();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { imported: 0, skipped: 0 };

  const header = lines[0]!.toLowerCase().split(",");
  const nameIdx = header.findIndex((h) => h.includes("name") || h.includes("nome"));
  const phoneIdx = header.findIndex((h) => h.includes("phone") || h.includes("telefone"));
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const companyIdx = header.findIndex((h) => h.includes("company") || h.includes("empresa"));

  let imported = 0;
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i]!.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const name = nameIdx >= 0 ? row[nameIdx] : row[0];
    if (!name) {
      skipped++;
      continue;
    }
    const phone = phoneIdx >= 0 ? row[phoneIdx] : undefined;
    const email = emailIdx >= 0 ? row[emailIdx] : undefined;
    const company = companyIdx >= 0 ? row[companyIdx] : undefined;

    try {
      await prisma.contact.create({
        data: {
          tenantId,
          name,
          phone: phone || null,
          email: email || null,
          company: company || null,
        },
      });
      imported++;
    } catch {
      skipped++;
    }
  }

  revalidatePath("/contacts");
  return { imported, skipped };
}
