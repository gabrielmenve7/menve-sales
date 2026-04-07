import type {
  CampaignSource,
  Contact,
  Deal,
  DealTag,
  Stage,
  Tag,
} from "@prisma/client";

export type DealRow = Deal & {
  contact: Contact & {
    campaignSource: CampaignSource | null;
    contactTags: { tag: Tag }[];
  };
  stage: Stage;
  dealTags: (DealTag & { tag: Tag })[];
  assignedTo: {
    id: string;
    name: string | null;
    email?: string;
    image?: string | null;
  } | null;
};
