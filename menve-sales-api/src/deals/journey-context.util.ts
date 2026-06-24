import type { PrismaService } from "../prisma/prisma.service";

export type JourneyContext = {
  name: string;
  phone: string | null;
  company: string | null;
  website: string | null;
};

function readWebsiteFromCustomData(
  customData: unknown,
): string | null {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) {
    return null;
  }
  const w = (customData as Record<string, unknown>).website;
  return typeof w === "string" && w.trim() ? w.trim() : null;
}

function mergeCustomDataWebsite(
  existing: unknown,
  website: string | null,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  if (website) base.website = website;
  return base;
}

/**
 * Agrega nome, telefone e site coletados na jornada (lista → disparo → inbox).
 */
export async function resolveJourneyContext(
  prisma: PrismaService,
  tenantId: string,
  contactId: string,
): Promise<JourneyContext> {
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, tenantId },
    select: {
      name: true,
      phone: true,
      company: true,
      customData: true,
    },
  });
  if (!contact) {
    return { name: "", phone: null, company: null, website: null };
  }

  const prospect = await prisma.prospectResult.findFirst({
    where: { tenantId, contactId },
    orderBy: { updatedAt: "desc" },
    select: { name: true, website: true, phone: true, whatsapp: true },
  });

  const recipient = await prisma.outreachCampaignRecipient.findFirst({
    where: { contactId, campaign: { tenantId } },
    orderBy: { updatedAt: "desc" },
    select: { name: true, company: true, phone: true },
  });

  const name =
    contact.name?.trim() ||
    prospect?.name?.trim() ||
    recipient?.name?.trim() ||
    recipient?.company?.trim() ||
    "";

  const phone =
    contact.phone?.trim() ||
    prospect?.whatsapp?.trim() ||
    prospect?.phone?.trim() ||
    recipient?.phone?.trim() ||
    null;

  const company =
    contact.company?.trim() ||
    recipient?.company?.trim() ||
    prospect?.name?.trim() ||
    null;

  const website =
    prospect?.website?.trim() ||
    readWebsiteFromCustomData(contact.customData) ||
    null;

  return { name, phone, company, website };
}

export { mergeCustomDataWebsite, readWebsiteFromCustomData };
