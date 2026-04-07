import "./load-api-env";
import { ProspectStatus } from "@prisma/client";
import { resolveBrazilianPhoneFromCandidates } from "../src/prospecting/phone-utils";
import { scriptPrisma as prisma } from "./_prisma";

/**
 * Preenche `Contact.phone` a partir dos dados do `ProspectResult` (Pesquisa)
 * para contatos já convertidos ao pipeline mas sem telefone no CRM.
 *
 * Uso (na pasta menve-sales-api):
 *   npx tsx scripts/backfill-contact-phones-from-prospects.ts
 *
 * Só atualiza quando `contact.phone` está vazio; não sobrescreve número existente.
 */

function collectCandidatesFromResult(r: {
  phone: string | null;
  whatsapp: string | null;
  enrichmentData: unknown;
}): (string | null | undefined)[] {
  const out: (string | null | undefined)[] = [r.whatsapp, r.phone];
  const ed = r.enrichmentData as Record<string, unknown> | null;
  if (ed && typeof ed.whatsapp === "string" && ed.whatsapp.trim()) {
    out.push(ed.whatsapp.trim());
  }
  const phonesRaw = ed?.phones;
  if (Array.isArray(phonesRaw)) {
    for (const p of phonesRaw) {
      if (typeof p === "string" && p.trim()) out.push(p.trim());
    }
  }
  return out;
}

async function main() {
  const contacts = await prisma.contact.findMany({
    where: {
      AND: [
        {
          OR: [{ phone: null }, { phone: "" }],
        },
        {
          prospectResults: {
            some: { status: ProspectStatus.CONVERTED },
          },
        },
      ],
    },
    include: {
      prospectResults: {
        where: { status: ProspectStatus.CONVERTED },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

  let updated = 0;
  let skippedNoPhone = 0;
  let skippedConflict = 0;

  for (const c of contacts) {
    const candidates: (string | null | undefined)[] = [];
    for (const r of c.prospectResults) {
      candidates.push(...collectCandidatesFromResult(r));
    }

    const phone = resolveBrazilianPhoneFromCandidates(candidates);
    if (!phone) {
      skippedNoPhone++;
      continue;
    }

    const other = await prisma.contact.findFirst({
      where: {
        tenantId: c.tenantId,
        phone,
        NOT: { id: c.id },
      },
      select: { id: true },
    });
    if (other) {
      skippedConflict++;
      console.warn(
        `[conflito] contactId=${c.id} tenant=${c.tenantId} telefone ${phone} já usado por outro contato (${other.id})`,
      );
      continue;
    }

    await prisma.contact.update({
      where: { id: c.id },
      data: { phone },
    });
    updated++;
    console.log(`[ok] ${c.name} (${c.id}) -> ${phone}`);
  }

  console.log(
    `\nResumo: ${updated} atualizado(s), ${skippedNoPhone} sem número resolvível na pesquisa, ${skippedConflict} conflito(s) de telefone duplicado.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
