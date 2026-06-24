import type { OutreachRecipientStatus } from "@prisma/client";
import { resolveBrazilianPhoneFromCandidates } from "../prospecting/phone-utils";

export type OutreachStatusInfo = {
  status: OutreachRecipientStatus;
  campaignName: string | null;
  updatedAt: Date;
};

export function phoneFromProspectFields(fields: {
  phone: string | null;
  whatsapp: string | null;
  enrichmentData?: unknown;
}): string | null {
  const enrichment =
    fields.enrichmentData && typeof fields.enrichmentData === "object"
      ? (fields.enrichmentData as Record<string, unknown>)
      : null;
  const scrapedPhones: string[] = [];
  const phonesRaw = enrichment?.phones;
  if (Array.isArray(phonesRaw)) {
    for (const p of phonesRaw) {
      if (typeof p === "string" && p.trim()) scrapedPhones.push(p.trim());
    }
  }
  const enrichWa =
    typeof enrichment?.whatsapp === "string"
      ? enrichment.whatsapp.trim()
      : "";
  return resolveBrazilianPhoneFromCandidates([
    fields.whatsapp,
    fields.phone,
    enrichWa || undefined,
    ...scrapedPhones,
  ]);
}

export function buildOutreachStatusMap(
  recipients: Array<{
    phone: string;
    status: OutreachRecipientStatus;
    updatedAt: Date;
    campaign: { name: string };
  }>,
): Map<string, OutreachStatusInfo> {
  const map = new Map<string, OutreachStatusInfo>();
  for (const r of recipients) {
    const existing = map.get(r.phone);
    if (!existing || r.updatedAt > existing.updatedAt) {
      map.set(r.phone, {
        status: r.status,
        campaignName: r.campaign.name,
        updatedAt: r.updatedAt,
      });
    }
  }
  return map;
}
