import type {
  CampaignSource,
  Contact,
  Deal,
  DealTag,
  Stage,
  Tag,
} from "@prisma/client";

export type DealMeetingActivity = {
  id: string;
  dueAt: Date | string | null;
  meetLink: string | null;
  googleEventId?: string | null;
};

export type DealRow = Deal & {
  contact: Contact & {
    campaignSource: CampaignSource | null;
    contactTags: { tag: Tag }[];
    customData?: unknown;
  };
  stage: Stage;
  dealTags: (DealTag & { tag: Tag })[];
  assignedTo: {
    id: string;
    name: string | null;
    email?: string;
    image?: string | null;
  } | null;
  activities?: DealMeetingActivity[];
};

export function readContactWebsite(contact: { customData?: unknown }): string | null {
  if (
    !contact.customData ||
    typeof contact.customData !== "object" ||
    Array.isArray(contact.customData)
  ) {
    return null;
  }
  const w = (contact.customData as Record<string, unknown>).website;
  return typeof w === "string" && w.trim() ? w.trim() : null;
}

export function readDealMeetLink(deal: DealRow): string | null {
  const fromActivity = deal.activities?.[0]?.meetLink;
  if (fromActivity?.trim()) return fromActivity.trim();
  if (
    deal.customData &&
    typeof deal.customData === "object" &&
    !Array.isArray(deal.customData)
  ) {
    const m = (deal.customData as Record<string, unknown>).meetLink;
    if (typeof m === "string" && m.trim()) return m.trim();
  }
  return null;
}

export function readDealMeetingDueAt(deal: DealRow): Date | string | null {
  const fromActivity = deal.activities?.[0]?.dueAt;
  if (fromActivity) return fromActivity;
  return deal.expectedClose;
}
